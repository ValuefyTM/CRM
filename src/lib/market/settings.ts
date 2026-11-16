// Server-only: the settings of the market crawler (Setări → Analize de piață), in the shared `settings` table.
export type MarketSettings = {
  /** the scheduled runs on / off (the runs on demand stay) */
  nightly: boolean;
  concurrency: number;
  /** start hours, Romanian time ("HH:MM") */
  times: string[];
  /** days of the week with scheduled runs: 1 = Monday … 7 = Sunday */
  weekdays: number[];
  /** a run stops by itself past this many Apify runs (0 = no limit) */
  max_apify: number;
  /** … or past this many hours (0 = no limit) */
  max_hours: number;
  /** complete runs in a row a listing may miss before it becomes inactive */
  missing_limit: number;
  /** tries of a page before it is given up */
  max_attempts: number;
  /** e-mail with the summary of a scheduled run: never | errors | always, to these addresses */
  notify: "never" | "errors" | "always";
  notify_to: string;
};
export const MARKET_DEFAULTS: MarketSettings = { nightly: true, concurrency: 2, times: ["01:07"], weekdays: [1, 2, 3, 4, 5, 6, 7], max_apify: 3000, max_hours: 6,
  missing_limit: 3, max_attempts: 3, notify: "never", notify_to: "" };

const int = (v: unknown, min: number, max: number, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d; };

/** Any input → valid settings. */
export function cleanSettings(v: Partial<MarketSettings>, envConcurrency?: number): MarketSettings {
  const D = MARKET_DEFAULTS;
  const times = [...new Set((Array.isArray(v.times) ? v.times : D.times).map(String).filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)))].sort().slice(0, 6);
  const days = [...new Set((Array.isArray(v.weekdays) ? v.weekdays : D.weekdays).map(Number).filter((d) => d >= 1 && d <= 7))].sort();
  return {
    nightly: v.nightly ?? D.nightly,
    concurrency: int(v.concurrency ?? envConcurrency, 1, 10, D.concurrency),
    times: times.length ? times : D.times,
    weekdays: days.length ? days : D.weekdays,
    max_apify: int(v.max_apify, 0, 50_000, D.max_apify),
    max_hours: int(v.max_hours, 0, 48, D.max_hours),
    missing_limit: int(v.missing_limit, 1, 10, D.missing_limit),
    max_attempts: int(v.max_attempts, 1, 5, D.max_attempts),
    notify: v.notify === "errors" || v.notify === "always" ? v.notify : "never",
    notify_to: String(v.notify_to ?? "").split(/[,;\s]+/).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)).slice(0, 5).join(", "),
  };
}

export async function getMarketSettings(db: D1Database): Promise<MarketSettings> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'market'").first<{ value: string }>().catch(() => null);
  let v: Partial<MarketSettings> = {};
  try { v = row ? JSON.parse(row.value) : {}; } catch { /* defaults */ }
  const env = Number(process.env.MARKET_CONCURRENCY);
  return cleanSettings(v, Number.isFinite(env) && env > 0 ? env : undefined);
}

export async function saveMarketSettings(db: D1Database, s: Partial<MarketSettings>, userId: string) {
  const v = cleanSettings(s);
  await db.prepare("INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('market', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by")
    .bind(JSON.stringify(v), new Date().toISOString(), userId).run();
  return v;
}

// ---------------------------------------------------------------- the schedule (Romanian time)

/** The date, hour and day of the week in Romania at a moment. */
export function roNow(at = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    weekday: "short", hourCycle: "h23" }).formatToParts(at).map((x) => [x.type, x.value]));
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday) + 1;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, minutes: Number(p.hour) * 60 + Number(p.minute), weekday };
}
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

/** The scheduled start due now, if any: an hour of today passed by less than `windowMin` minutes ("2026-11-16 01:07"). */
export function dueSlot(s: MarketSettings, at = new Date(), windowMin = 20) {
  if (!s.nightly) return null;
  const n = roNow(at);
  if (!s.weekdays.includes(n.weekday)) return null;
  const t = s.times.find((x) => n.minutes >= mins(x) && n.minutes < mins(x) + windowMin);
  return t ? `${n.date} ${t}` : null;
}

/** The next scheduled start (a moment), or null when the schedule is off. */
export function nextSlot(s: MarketSettings, from = new Date()): Date | null {
  if (!s.nightly) return null;
  // in 5-minute steps over the next 8 days
  for (let step = 1; step <= 8 * 24 * 12; step++) {
    const at = new Date(Math.floor(from.getTime() / 300_000) * 300_000 + step * 300_000);
    const n = roNow(at);
    if (!s.weekdays.includes(n.weekday)) continue;
    const t = s.times.find((x) => mins(x) > n.minutes - 5 && mins(x) <= n.minutes);
    if (t) return new Date(at.getTime() - (n.minutes - mins(t)) * 60_000);
  }
  return null;
}
