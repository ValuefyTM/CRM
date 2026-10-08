import { getCloudflareContext } from "@opennextjs/cloudflare";

/** The shared D1 database (valuefy-db), or null when unavailable. */
export async function getDb(): Promise<D1Database | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return (env as { DB?: D1Database }).DB ?? null;
  } catch {
    return null;
  }
}

export async function requireDb(): Promise<D1Database> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}

export const now = () => new Date().toISOString();
export const uuid = () => crypto.randomUUID();

/** The calendar day in Romania (YYYY-MM-DD) of a moment, by default now: dates of documents follow Bucharest time, not UTC. */
export const bucharestDay = (iso?: string | null) => new Date(iso ?? Date.now()).toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });

/** JSON from a database column; a malformed value counts as empty instead of breaking the page. */
export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}
