// Server-only: the settings of the market crawler (Setări → Anunțuri de piață), in the shared `settings` table.
export type MarketSettings = { nightly: boolean; concurrency: number };
const DEFAULTS: MarketSettings = { nightly: true, concurrency: 2 };

export async function getMarketSettings(db: D1Database): Promise<MarketSettings> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'market'").first<{ value: string }>().catch(() => null);
  let v: Partial<MarketSettings> = {};
  try { v = row ? JSON.parse(row.value) : {}; } catch { /* defaults */ }
  const env = Number(process.env.MARKET_CONCURRENCY);
  return {
    nightly: v.nightly ?? DEFAULTS.nightly,
    concurrency: Math.max(1, Math.min(10, Math.round(Number(v.concurrency) || (Number.isFinite(env) && env > 0 ? env : DEFAULTS.concurrency)))),
  };
}

export async function saveMarketSettings(db: D1Database, s: MarketSettings, userId: string) {
  const v = { nightly: !!s.nightly, concurrency: Math.max(1, Math.min(10, Math.round(Number(s.concurrency) || 2))) };
  await db.prepare("INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('market', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by")
    .bind(JSON.stringify(v), new Date().toISOString(), userId).run();
  return v;
}
