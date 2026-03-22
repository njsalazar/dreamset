/**
 * Deduplicates the songs table in Turso.
 * For each normalized_title with multiple song IDs:
 *   - Pick the canonical ID (prefer mixed-case "Title of Song" style, shortest if tie)
 *   - Update all show_songs rows pointing to dupe IDs to point to canonical ID
 *   - Delete the dupe song rows
 */

import { createClient } from "@libsql/client/http";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

function scoreTitle(title: string): number {
  // Prefer titles where most words are Title Case (not ALL CAPS or all lower)
  const words = title.split(/\s+/);
  const titleCaseWords = words.filter(w => /^[A-Z][a-z]/.test(w) || w.length <= 2).length;
  return titleCaseWords;
}

async function run() {
  // Find all dupes
  const dupesResult = await client.execute(`
    SELECT normalized_title, GROUP_CONCAT(id) as ids, GROUP_CONCAT(title, '|||') as titles
    FROM songs
    GROUP BY normalized_title
    HAVING COUNT(*) > 1
  `);

  const dupes = dupesResult.rows as unknown as {
    normalized_title: string;
    ids: string;
    titles: string;
  }[];

  console.log(`Found ${dupes.length} duplicate normalized titles`);

  let totalMerged = 0;

  for (const dupe of dupes) {
    const ids = dupe.ids.split(",").map(Number);
    const titles = dupe.titles.split("|||");

    // Pick canonical: highest title-case score, then shortest, then first
    let canonicalIdx = 0;
    let bestScore = -1;
    for (let i = 0; i < titles.length; i++) {
      const score = scoreTitle(titles[i]);
      if (score > bestScore || (score === bestScore && titles[i].length < titles[canonicalIdx].length)) {
        bestScore = score;
        canonicalIdx = i;
      }
    }

    const canonicalId = ids[canonicalIdx];
    const dupeIds = ids.filter((_, i) => i !== canonicalIdx);

    // Repoint show_songs for each dupe ID
    for (const dupeId of dupeIds) {
      // Some show_songs might already have canonicalId for the same show — those would cause a unique constraint
      // So: update only where (show_id, canonicalId) doesn't already exist
      await client.execute({
        sql: `UPDATE show_songs SET song_id = ? WHERE song_id = ? AND show_id NOT IN (
          SELECT show_id FROM show_songs WHERE song_id = ?
        )`,
        args: [canonicalId, dupeId, canonicalId],
      });
      // Delete any remaining show_songs with dupeId (the ones that would have been duplicates)
      await client.execute({
        sql: `DELETE FROM show_songs WHERE song_id = ?`,
        args: [dupeId],
      });
      // Delete the dupe song
      await client.execute({
        sql: `DELETE FROM songs WHERE id = ?`,
        args: [dupeId],
      });
    }

    totalMerged += dupeIds.length;
  }

  console.log(`Merged ${totalMerged} duplicate song entries`);

  // Verify
  const countResult = await client.execute("SELECT COUNT(*) as cnt FROM songs");
  const dupeCheck = await client.execute(`
    SELECT COUNT(*) as cnt FROM (
      SELECT normalized_title FROM songs GROUP BY normalized_title HAVING COUNT(*) > 1
    )
  `);
  const rows0 = countResult.rows as unknown as { cnt: number }[];
  const rows1 = dupeCheck.rows as unknown as { cnt: number }[];
  console.log(`Songs remaining: ${rows0[0].cnt}`);
  console.log(`Dupe groups remaining: ${rows1[0].cnt}`);
}

run().catch(console.error);
