import { NextRequest, NextResponse } from "next/server";
import { getClient, normalize } from "@/lib/db";

interface ShowResult {
  date: string;
  venue: string;
  city: string;
  state: string;
  archive_url: string;
  match_pct: number;
  matched_songs: string[];
  missing_songs: string[];
}

export async function POST(request: NextRequest) {
  const { songs } = (await request.json()) as { songs: string[] };

  if (!songs || songs.length === 0) {
    return NextResponse.json({ shows: [] });
  }

  const client = getClient();
  const normalizedInput = songs.map(normalize);

  const placeholders = normalizedInput.map(() => "?").join(",");
  const matchedSongsResult = await client.execute({
    sql: `SELECT id, title, normalized_title FROM songs WHERE normalized_title IN (${placeholders})`,
    args: normalizedInput,
  });

  const matchedSongs = matchedSongsResult.rows as unknown as {
    id: number;
    title: string;
    normalized_title: string;
  }[];

  if (matchedSongs.length === 0) {
    return NextResponse.json({ shows: [] });
  }

  const matchedSongIds = matchedSongs.map((s) => s.id);
  const idPlaceholders = matchedSongIds.map(() => "?").join(",");

  const rowsResult = await client.execute({
    sql: `SELECT s.id, s.date, s.venue, s.city, s.state, s.archive_url,
                 ss.song_id
          FROM shows s
          JOIN show_songs ss ON s.id = ss.show_id
          WHERE ss.song_id IN (${idPlaceholders})`,
    args: matchedSongIds,
  });

  const rows = rowsResult.rows as unknown as {
    id: number;
    date: string;
    venue: string;
    city: string;
    state: string;
    archive_url: string | null;
    song_id: number;
  }[];

  const showMap = new Map<
    number,
    {
      date: string;
      venue: string;
      city: string;
      state: string;
      archive_url: string | null;
      matchedSongIds: Set<number>;
    }
  >();

  for (const row of rows) {
    if (!showMap.has(row.id)) {
      showMap.set(row.id, {
        date: row.date,
        venue: row.venue,
        city: row.city,
        state: row.state,
        archive_url: row.archive_url,
        matchedSongIds: new Set(),
      });
    }
    showMap.get(row.id)!.matchedSongIds.add(row.song_id);
  }

  const normToSongId = new Map<string, number>();
  for (const s of matchedSongs) {
    normToSongId.set(s.normalized_title, s.id);
  }

  const results: ShowResult[] = [];

  for (const [, show] of showMap) {
    const matched: string[] = [];
    const missing: string[] = [];

    for (let i = 0; i < songs.length; i++) {
      const songId = normToSongId.get(normalizedInput[i]);
      if (songId !== undefined && show.matchedSongIds.has(songId)) {
        matched.push(songs[i]);
      } else {
        missing.push(songs[i]);
      }
    }

    const match_pct = Math.round((matched.length / songs.length) * 100);

    results.push({
      date: show.date,
      venue: show.venue ?? "",
      city: show.city ?? "",
      state: show.state ?? "",
      archive_url: show.archive_url ?? "",
      match_pct,
      matched_songs: matched,
      missing_songs: missing,
    });
  }

  results.sort((a, b) => b.match_pct - a.match_pct || a.date.localeCompare(b.date));

  return NextResponse.json({ shows: results });
}
