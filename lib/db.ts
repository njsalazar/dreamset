import { createClient } from "@libsql/client";

let _client: ReturnType<typeof createClient> | null = null;

export function getClient() {
  if (!_client) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (url) {
      // Production: Turso
      _client = createClient({ url, authToken });
    } else {
      // Local dev: SQLite file via libsql
      _client = createClient({
        url: "file:data/gd.db",
      });
    }
  }
  return _client;
}

export function normalize(title: string): string {
  return title.trim().toLowerCase().replace(/^the\s+/i, "");
}
