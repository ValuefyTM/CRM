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
