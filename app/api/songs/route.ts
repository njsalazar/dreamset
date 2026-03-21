import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";

  const db = getDb();

  let songs: { title: string }[];
  if (q) {
    songs = db
      .prepare(
        "SELECT title FROM songs WHERE LOWER(title) LIKE ? ORDER BY title LIMIT 50"
      )
      .all(`%${q}%`) as { title: string }[];
  } else {
    songs = db
      .prepare("SELECT title FROM songs ORDER BY title LIMIT 200")
      .all() as { title: string }[];
  }

  return NextResponse.json({ songs: songs.map((s) => s.title) });
}
