/**
 * Two cleanups:
 * 1. Merge "Song >" into "Song" — segue notation is not a separate song
 * 2. Delete junk entries like (bit), (late show), (New Riders...)
 */

import { createClient } from "@libsql/client/http";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function run() {
  // --- Step 1: Merge " >" variants into base song ---
  const sequeResult = await client.execute(`
    SELECT id, title FROM songs WHERE title LIKE '% >'
  `);
  const sequeSongs = sequeResult.rows as unknown as { id: number; title: string }[];
  console.log(`Found ${sequeSongs.length} segue songs (ending in " >")`);

  let merged = 0;
  let deleted = 0;

  for (const s of sequeSongs) {
    const baseTitle = s.title.replace(/ >$/, "").trim();
    // Find base song
    const baseResult = await client.execute({
      sql: `SELECT id FROM songs WHERE title = ? LIMIT 1`,
      args: [baseTitle],
    });
    const baseRows = baseResult.rows as unknown as { id: number }[];

    if (baseRows.length > 0) {
      const baseId = baseRows[0].id;
      // Repoint show_songs to base, avoiding duplicates
      await client.execute({
        sql: `UPDATE show_songs SET song_id = ? WHERE song_id = ? AND show_id NOT IN (
          SELECT show_id FROM show_songs WHERE song_id = ?
        )`,
        args: [baseId, s.id, baseId],
      });
      await client.execute({ sql: `DELETE FROM show_songs WHERE song_id = ?`, args: [s.id] });
      await client.execute({ sql: `DELETE FROM songs WHERE id = ?`, args: [s.id] });
      merged++;
    } else {
      // No base song exists — rename it (strip the >)
      await client.execute({
        sql: `UPDATE songs SET title = ?, normalized_title = LOWER(TRIM(REPLACE(title, ' >', ''))) WHERE id = ?`,
        args: [baseTitle, s.id],
      });
      // fix normalized_title properly
      const norm = baseTitle.trim().toLowerCase().replace(/^the\s+/i, "");
      await client.execute({
        sql: `UPDATE songs SET normalized_title = ? WHERE id = ?`,
        args: [norm, s.id],
      });
    }
  }

  // After renaming, dedup again (some renamed songs may now collide with existing ones)
  const dupesResult = await client.execute(`
    SELECT normalized_title, GROUP_CONCAT(id) as ids
    FROM songs
    GROUP BY normalized_title
    HAVING COUNT(*) > 1
  `);
  const dupes = dupesResult.rows as unknown as { normalized_title: string; ids: string }[];
  for (const dupe of dupes) {
    const ids = dupe.ids.split(",").map(Number);
    const canonicalId = ids[0];
    for (const dupeId of ids.slice(1)) {
      await client.execute({
        sql: `UPDATE show_songs SET song_id = ? WHERE song_id = ? AND show_id NOT IN (
          SELECT show_id FROM show_songs WHERE song_id = ?
        )`,
        args: [canonicalId, dupeId, canonicalId],
      });
      await client.execute({ sql: `DELETE FROM show_songs WHERE song_id = ?`, args: [dupeId] });
      await client.execute({ sql: `DELETE FROM songs WHERE id = ?`, args: [dupeId] });
      deleted++;
    }
  }

  console.log(`Merged ${merged} segue songs into base songs`);
  console.log(`Deleted ${deleted} post-rename dupes`);

  // --- Step 2: Delete junk entries ---
  const junkResult = await client.execute(`SELECT id, title FROM songs WHERE title LIKE '(%)' OR title LIKE '[%]'`);
  const junkSongs = junkResult.rows as unknown as { id: number; title: string }[];
  console.log(`Found ${junkSongs.length} junk entries: ${junkSongs.map(s => s.title).join(", ")}`);

  for (const j of junkSongs) {
    await client.execute({ sql: `DELETE FROM show_songs WHERE song_id = ?`, args: [j.id] });
    await client.execute({ sql: `DELETE FROM songs WHERE id = ?`, args: [j.id] });
  }

  // Final counts
  const countResult = await client.execute("SELECT COUNT(*) as cnt FROM songs");
  const dupeCheck = await client.execute(`
    SELECT COUNT(*) as cnt FROM (SELECT normalized_title FROM songs GROUP BY normalized_title HAVING COUNT(*) > 1)
  `);
  const c = countResult.rows as unknown as { cnt: number }[];
  const d = dupeCheck.rows as unknown as { cnt: number }[];
  console.log(`\nFinal song count: ${c[0].cnt}`);
  console.log(`Remaining dupes: ${d[0].cnt}`);
}

run().catch(console.error);
