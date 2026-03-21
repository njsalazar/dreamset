import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
    const client = getClient();

    let result;
    if (q) {
      result = await client.execute({
        sql: "SELECT title FROM songs WHERE LOWER(title) LIKE ? ORDER BY title LIMIT 50",
        args: [`%${q}%`],
      });
    } else {
      result = await client.execute({
        sql: "SELECT title FROM songs ORDER BY title LIMIT 200",
        args: [],
      });
    }

    const songs = (result.rows as unknown as { title: string }[]).map((s) => s.title);
    return NextResponse.json({ songs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("songs route error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
