/**
 * One-time import script: downloads CSV data and populates data/gd.db
 * Run with: npx tsx scripts/import.ts
 */
import Database from "better-sqlite3";
import { parse } from "csv-parse/sync";
import * as fs from "node:fs";
import * as path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "gd.db");

const BASE = "https://raw.githubusercontent.com/ednunezg/deadlyarchive-data/master";
const SHOWS_URL = `${BASE}/shows.csv`;
const SETLISTS_URL = `${BASE}/setlists.csv`;

function normalize(title: string): string {
  return title.trim().toLowerCase().replace(/^the\s+/i, "");
}

async function downloadText(url: string): Promise<string> {
  console.log(`  Downloading ${url}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function parseArchiveUrl(iaSources: string): string | null {
  try {
    const arr = JSON.parse(iaSources);
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const first = arr[0];
    const raw =
      typeof first === "string"
        ? first
        : first?.identifier ?? first?.id ?? null;
    if (!raw) return null;
    // If it's already a URL, use it directly
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      // Normalize to https
      return raw.replace(/^http:\/\//, "https://");
    }
    return `https://archive.org/details/${raw}`;
  } catch {
    return null;
  }
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  // Remove existing db so we start fresh
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log("Removed existing gd.db");
  }

  console.log("Downloading data...");
  const [showsText, setlistsText] = await Promise.all([
    downloadText(SHOWS_URL),
    downloadText(SETLISTS_URL),
  ]);

  console.log("Parsing CSVs...");
  const showRows = parse(showsText, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  }) as Array<{
    date: string;
    venue: string;
    city: string;
    state: string;
    category: string;
    etree_comments: string;
    ia_sources: string;
  }>;

  const setlistRows = parse(setlistsText, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  }) as Array<{
    order: string;
    show_date: string;
    set_name: string;
    title: string;
    song_id: string;
  }>;

  console.log(`Parsed ${showRows.length} shows, ${setlistRows.length} setlist rows`);

  console.log("Creating database schema...");
  const db = new Database(DB_PATH);

  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE shows (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        TEXT    NOT NULL UNIQUE,
      venue       TEXT,
      city        TEXT,
      state       TEXT,
      archive_url TEXT
    );

    CREATE TABLE songs (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      title            TEXT NOT NULL UNIQUE,
      normalized_title TEXT NOT NULL
    );
    CREATE INDEX idx_songs_normalized ON songs(normalized_title);

    CREATE TABLE show_songs (
      show_id  INTEGER NOT NULL REFERENCES shows(id),
      song_id  INTEGER NOT NULL REFERENCES songs(id),
      set_name TEXT,
      position INTEGER
    );
    CREATE INDEX idx_show_songs_show ON show_songs(show_id);
    CREATE INDEX idx_show_songs_song ON show_songs(song_id);
  `);

  // Insert shows
  console.log("Inserting shows...");
  const insertShow = db.prepare(
    "INSERT OR IGNORE INTO shows (date, venue, city, state, archive_url) VALUES (?, ?, ?, ?, ?)"
  );
  const insertShowsMany = db.transaction(
    (rows: typeof showRows) => {
      for (const row of rows) {
        const archiveUrl = parseArchiveUrl(row.ia_sources ?? "[]");
        insertShow.run(
          row.date?.trim(),
          row.venue?.trim() || null,
          row.city?.trim() || null,
          row.state?.trim() || null,
          archiveUrl
        );
      }
    }
  );
  insertShowsMany(showRows);

  // Build show date -> id map
  const showIdMap = new Map<string, number>();
  const allShows = db.prepare("SELECT id, date FROM shows").all() as {
    id: number;
    date: string;
  }[];
  for (const s of allShows) showIdMap.set(s.date, s.id);

  // Insert songs + show_songs
  console.log("Inserting songs and setlist entries...");
  const insertSong = db.prepare(
    "INSERT OR IGNORE INTO songs (title, normalized_title) VALUES (?, ?)"
  );
  const getSongId = db.prepare("SELECT id FROM songs WHERE title = ?");
  const insertShowSong = db.prepare(
    "INSERT INTO show_songs (show_id, song_id, set_name, position) VALUES (?, ?, ?, ?)"
  );

  const insertAll = db.transaction((rows: typeof setlistRows) => {
    for (const row of rows) {
      const title = row.title?.trim();
      if (!title) continue;

      const showId = showIdMap.get(row.show_date?.trim());
      if (!showId) continue;

      const norm = normalize(title);
      insertSong.run(title, norm);
      const songRow = getSongId.get(title) as { id: number } | undefined;
      if (!songRow) continue;

      insertShowSong.run(
        showId,
        songRow.id,
        row.set_name?.trim() || null,
        parseInt(row.order) || 0
      );
    }
  });
  insertAll(setlistRows);

  const showCount = (
    db.prepare("SELECT COUNT(*) as c FROM shows").get() as { c: number }
  ).c;
  const songCount = (
    db.prepare("SELECT COUNT(*) as c FROM songs").get() as { c: number }
  ).c;
  const showSongCount = (
    db.prepare("SELECT COUNT(*) as c FROM show_songs").get() as { c: number }
  ).c;

  db.close();

  console.log("\n✓ Import complete:");
  console.log(`  Shows:       ${showCount}`);
  console.log(`  Songs:       ${songCount}`);
  console.log(`  Show-songs:  ${showSongCount}`);
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
