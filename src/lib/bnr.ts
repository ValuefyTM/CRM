// Server-only: the BNR reference rate of the euro for a day (the rate published on that day, else the last one before
// it). Read from the bank's XML feeds and kept in settings, so a day's rate is fetched once.
import { now } from "./db";

const num = (s: string | undefined) => { const n = parseFloat(s ?? ""); return Number.isFinite(n) && n > 0 ? n : null; };

/** `<Cube date="2026-10-17">…<Rate currency="EUR">5.0812</Rate>…</Cube>` → [date, rate][] */
function parseCubes(xml: string): [string, number][] {
  const out: [string, number][] = [];
  for (const m of xml.matchAll(/<Cube date="(\d{4}-\d{2}-\d{2})">([\s\S]*?)<\/Cube>/g)) {
    const r = num(m[2].match(/<Rate currency="EUR"[^>]*>([\d.]+)<\/Rate>/)?.[1]);
    if (r) out.push([m[1], r]);
  }
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}

async function fetchXml(url: string) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { Accept: "application/xml,text/xml" } });
    return r.ok ? await r.text() : null;
  } catch { return null; } finally { clearTimeout(t); }
}

/** The EUR rate for `day` (YYYY-MM-DD): the rate of that day, or the last one published before it; null when BNR cannot be reached. */
export async function eurRate(db: D1Database, day: string): Promise<{ rate: number; date: string } | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const key = `bnr_eur:${day}`;
  const hit = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>().catch(() => null);
  if (hit) { try { const j = JSON.parse(hit.value) as { rate: number; date: string }; if (j.rate) return j; } catch {} }
  // The year's file has every day; the short feed (last 10 days) is enough for recent dates and is smaller.
  const recent = Date.now() - new Date(`${day}T12:00:00Z`).getTime() < 8 * 86400000;
  let cubes = recent ? parseCubes((await fetchXml("https://www.bnr.ro/nbrfxrates10days.xml")) ?? "") : [];
  if (!cubes.some(([d]) => d <= day)) cubes = parseCubes((await fetchXml(`https://www.bnr.ro/files/xml/years/nbrfxrates${day.slice(0, 4)}.xml`)) ?? "");
  if (!cubes.some(([d]) => d <= day) && day.slice(5) < "01-05") cubes = parseCubes((await fetchXml(`https://www.bnr.ro/files/xml/years/nbrfxrates${Number(day.slice(0, 4)) - 1}.xml`)) ?? "");
  const found = cubes.filter(([d]) => d <= day).pop();
  if (!found) return null;
  const v = { rate: found[1], date: found[0] };
  // Only a day whose rate is final is kept (today's may still be published later in the day).
  if (found[0] === day || day < now().slice(0, 10)) {
    await db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, 'system')").bind(key, JSON.stringify(v), now()).run().catch(() => {});
  }
  return v;
}
