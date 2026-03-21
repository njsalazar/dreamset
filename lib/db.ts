import { createClient } from "@libsql/client/http";

export function getClient() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error("TURSO_DATABASE_URL is not set");
  }

  return createClient({ url, authToken });
}

export function normalize(title: string): string {
  return title.trim().toLowerCase().replace(/^the\s+/i, "");
}
