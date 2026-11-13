// Server-only: reading the market listings (Piață page, a listing's page, comparables of a property, Claude).
import { parseJson } from "../db";

export type MarketFilters = { q?: string; cat?: string; tip?: string; tr?: string; src?: string; st?: string; dup?: string; min?: string; max?: string; loc?: string; p?: string; vezi?: string };
export type MarketRow = {
  id: string; source: string; url: string; title: string | null; category: string | null; type: string | null; transaction: string | null;
  price: number | null; currency: string | null; price_sqm: number | null; area: number | null; county: string | null; city: string | null; zone: string | null;
  lat: number | null; lng: number | null; geo_precision: string | null; status: string; dup_group: string | null; dup_reason: string | null; photo_count: number;
  cover_key: string | null; first_seen_at: string; changed_at: string | null; fetched_at: string | null; seller_name: string | null; km?: number;
};

export const PAGE = 50;
export const TRANSACTIONS: [string, string][] = [["vanzare", "Vânzare"], ["inchiriere", "Închiriere"]];
export const STATUSES: [string, string][] = [["activ", "Active"], ["inactiv", "Dispărute"], ["expirat", "Expirate"], ["all", "Toate"]];
export const marketFile = (key: string | null | undefined) => (key ? `/api/crm/market/file/${key.split("/").map(encodeURIComponent).join("/")}` : null);

const AREA = "COALESCE(l.usable_area, l.built_area, l.land_area)";
const COLS = `l.id, l.source, l.url, l.title, l.category, l.type, l.deal AS "transaction", l.price, l.currency, l.price_sqm, ${AREA} AS area, l.county, l.city, l.zone,
  l.lat, l.lng, l.geo_precision, l.status, l.dup_group, l.dup_reason, l.photo_count, l.cover_key, l.first_seen_at, l.changed_at, l.fetched_at, l.seller_name`;

/** FTS5 query from free text: each word as a prefix, all required. */
const ftsQuery = (q: string) => q.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/["*()^:{}\-+]/g, " ").split(/\s+/).filter((w) => w.length > 1).map((w) => `"${w}"*`).join(" ");

function whereOf(f: MarketFilters) {
  const w: string[] = [], a: (string | number)[] = [];
  const st = STATUSES.some(([k]) => k === f.st) ? f.st! : "activ";
  if (st !== "all") { w.push("l.status = ?"); a.push(st); }
  if (f.cat) { w.push("l.category = ?"); a.push(f.cat); }
  if (f.tip) { w.push("l.type = ?"); a.push(f.tip); }
  if (f.tr) { w.push("l.deal = ?"); a.push(f.tr); }
  if (f.src) { w.push("l.source = ?"); a.push(f.src); }
  if (f.loc) { w.push("(l.city LIKE ? OR l.zone LIKE ? OR l.address LIKE ?)"); a.push(`%${f.loc}%`, `%${f.loc}%`, `%${f.loc}%`); }
  const min = Number(f.min), max = Number(f.max);
  if (f.min && Number.isFinite(min)) { w.push(`${AREA} >= ?`); a.push(min); }
  if (f.max && Number.isFinite(max)) { w.push(`${AREA} <= ?`); a.push(max); }
  // one listing per group of duplicates (the main one), unless asked otherwise
  if (f.dup !== "1") w.push("(l.dup_group IS NULL OR l.dup_group = l.id OR NOT EXISTS (SELECT 1 FROM market_listings m WHERE m.id = l.dup_group AND m.status = l.status))");
  const q = f.q?.trim() ? ftsQuery(f.q) : "";
  if (q) { w.push("l.id IN (SELECT listing_id FROM market_listings_fts WHERE market_listings_fts MATCH ?)"); a.push(q); }
  return { where: w.length ? `WHERE ${w.join(" AND ")}` : "", binds: a };
}

export async function listMarket(db: D1Database, f: MarketFilters) {
  const { where, binds: a } = whereOf(f);
  const page = Math.max(1, Number(f.p) || 1);
  const [rows, total] = await Promise.all([
    db.prepare(`SELECT ${COLS} FROM market_listings l ${where} ORDER BY COALESCE(l.changed_at, l.first_seen_at) DESC LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`).bind(...a).all<MarketRow>(),
    db.prepare(`SELECT COUNT(*) AS n FROM market_listings l ${where}`).bind(...a).first<{ n: number }>(),
  ]);
  return { rows: rows.results, total: total?.n ?? 0, page };
}

export type MarketPoint = { id: string; lat: number; lng: number; price: number | null; currency: string | null; title: string | null; status: string; area: number | null; source: string };

/** Every filtered listing that has a point (the map shows them all, not only the page of the list). */
export async function marketPoints(db: D1Database, f: MarketFilters, limit = 1500) {
  const { where, binds } = whereOf(f);
  const w = where ? `${where} AND l.lat IS NOT NULL AND l.lng IS NOT NULL` : "WHERE l.lat IS NOT NULL AND l.lng IS NOT NULL";
  const { results } = await db.prepare(`SELECT l.id, l.lat, l.lng, l.price, l.currency, l.title, l.status, ${AREA} AS area, l.source FROM market_listings l ${w}
    ORDER BY COALESCE(l.changed_at, l.first_seen_at) DESC LIMIT ${limit}`).bind(...binds).all<MarketPoint>();
  return results;
}

/** The values the filters offer (categories, types, sites), with how many listings each. */
export async function marketFacets(db: D1Database) {
  const q = (col: string) => db.prepare(`SELECT ${col} AS k, COUNT(*) AS n FROM market_listings WHERE ${col} IS NOT NULL AND ${col} <> '' GROUP BY ${col} ORDER BY n DESC`).all<{ k: string; n: number }>().then((r) => r.results);
  const [cats, types, sources] = await Promise.all([q("category"), q("type"), q("source")]);
  return { cats, types, sources };
}

export async function getMarketListing(db: D1Database, id: string) {
  const l = await db.prepare(`SELECT l.*, l.deal AS "transaction", ${AREA} AS area FROM market_listings l WHERE l.id = ?`).bind(id).first<MarketRow & Record<string, unknown>>();
  if (!l) return null;
  const [photos, history, dups, search] = await Promise.all([
    db.prepare("SELECT position, url, r2_key, error FROM market_listing_photos WHERE listing_id = ? ORDER BY position").bind(id).all<{ position: number; url: string; r2_key: string | null; error: string | null }>(),
    db.prepare("SELECT at, event, price, currency, area, title, source_key FROM market_listing_history WHERE listing_id = ? ORDER BY at DESC").bind(id)
      .all<{ at: string; event: string; price: number | null; currency: string | null; area: number | null; title: string | null; source_key: string | null }>(),
    l.dup_group ? db.prepare(`SELECT ${COLS} FROM market_listings l WHERE l.dup_group = ? AND l.id <> ?`).bind(l.dup_group, id).all<MarketRow>() : Promise.resolve({ results: [] as MarketRow[] }),
    l.search_id ? db.prepare("SELECT id, name FROM market_searches WHERE id = ?").bind(l.search_id).first<{ id: string; name: string }>() : Promise.resolve(null),
  ]);
  return { listing: l, features: parseJson<Record<string, unknown>>(l.features as string, {}), photos: photos.results, history: history.results, duplicates: dups.results, search };
}

const km = (a: [number, number], b: [number, number]) => {
  const R = 6371, d = Math.PI / 180;
  const x = Math.sin(((b[0] - a[0]) * d) / 2) ** 2 + Math.cos(a[0] * d) * Math.cos(b[0] * d) * Math.sin(((b[1] - a[1]) * d) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

/** Market listings around a point, for the comparables of a property: same category, similar area, one per duplicate group. */
export async function nearbyMarket(db: D1Database, ll: [number, number], o: { category?: string | null; transaction?: string | null; area?: number | null; tol?: number; radiusKm?: number; status?: string; limit?: number }) {
  const r = o.radiusKm ?? 5, tol = o.tol ?? 50;
  const dLat = r / 111, dLng = r / (111 * Math.cos((ll[0] * Math.PI) / 180));
  const w = ["l.lat BETWEEN ? AND ?", "l.lng BETWEEN ? AND ?"], a: (string | number)[] = [ll[0] - dLat, ll[0] + dLat, ll[1] - dLng, ll[1] + dLng];
  if (o.status !== "all") { w.push("l.status = ?"); a.push(o.status ?? "activ"); }
  if (o.category) { w.push("l.category = ?"); a.push(o.category); }
  if (o.transaction) { w.push("l.deal = ?"); a.push(o.transaction); }
  if (tol && o.area) { w.push(`${AREA} BETWEEN ? AND ?`); a.push(o.area * (1 - tol / 100), o.area * (1 + tol / 100)); }
  const { results } = await db.prepare(`SELECT ${COLS} FROM market_listings l WHERE ${w.join(" AND ")} LIMIT 800`).bind(...a).all<MarketRow>();
  const seen = new Set<string>(), rows: MarketRow[] = [];
  for (const x of results.map((x) => ({ ...x, km: Math.round(km(ll, [x.lat!, x.lng!]) * 1000) / 1000 })).filter((x) => x.km <= r).sort((p, q) => p.km - q.km)) {
    if (x.dup_group) { if (seen.has(x.dup_group)) continue; seen.add(x.dup_group); }
    rows.push(x);
  }
  const list = rows.slice(0, o.limit ?? 80);
  const s = list.map((x) => x.price_sqm).filter((x): x is number => x != null && x > 0).sort((p, q) => p - q);
  const q = (k: number) => (s.length ? s[Math.floor((s.length - 1) * k)] : null);
  return { rows: list, stats: { n: list.length, withSqm: s.length, median: q(0.5), p25: q(0.25), p75: q(0.75) } };
}

export async function marketStatus(db: D1Database) {
  const [searches, runs, queue, counts] = await Promise.all([
    db.prepare(`SELECT s.*, s.deal AS "transaction", (SELECT COUNT(*) FROM market_listings l WHERE l.search_id = s.id AND l.status = 'activ') AS active FROM market_searches s ORDER BY s.name, s.source`)
      .all<{ id: string; name: string; source: string; url: string; category: string | null; type: string | null; transaction: string; enabled: number; max_pages: number;
        last_run_at: string | null; last_complete: number | null; last_count: number | null; last_error: string | null; active: number }>(),
    db.prepare("SELECT id, trigger, status, started_at, finished_at, stats FROM market_runs ORDER BY started_at DESC LIMIT 5")
      .all<{ id: string; trigger: string; status: string; started_at: string; finished_at: string | null; stats: string }>(),
    db.prepare("SELECT kind, status, COUNT(*) AS n FROM market_jobs WHERE run_id IN (SELECT id FROM market_runs WHERE status = 'running') GROUP BY kind, status")
      .all<{ kind: string; status: string; n: number }>(),
    db.prepare("SELECT status, COUNT(*) AS n FROM market_listings GROUP BY status").all<{ status: string; n: number }>(),
  ]);
  return {
    searches: searches.results,
    runs: runs.results.map((r) => ({ ...r, stats: parseJson<Record<string, number>>(r.stats, {}) })),
    queue: queue.results,
    counts: Object.fromEntries(counts.results.map((c) => [c.status, c.n])) as Record<string, number>,
  };
}

/** What the analysis needs around one listing (like a comparable's card in UVALO's market analysis): the similar
 * listings nearby (same category and transaction, area ±50%, 2 km, one per duplicate group), their median per m²,
 * the listing against it, days on the market, on how many portals, the change since it was listed. */
export async function listingContext(db: D1Database, l: { id: string; lat: number | null; lng: number | null; category: string | null; transaction: string | null;
  area: number | null; price: number | null; price_sqm: number | null; dup_group: string | null; status: string; src_created_at: string | null; first_seen_at: string; last_seen_at: string; source: string },
  dupSources: string[], history: { at: string; price: number | null }[]) {
  const near = l.lat != null && l.lng != null
    ? await nearbyMarket(db, [l.lat, l.lng], { category: l.category, transaction: l.transaction, area: l.area, tol: 50, radiusKm: 2, limit: 41, status: "all" })
    : null;
  const rows = (near?.rows ?? []).filter((r) => r.id !== l.id && (!l.dup_group || r.dup_group !== l.dup_group)).slice(0, 40);
  // the median: the active listings only (the ones gone from the sites are shown, not counted)
  const s = rows.filter((r) => r.status === "activ").map((r) => r.price_sqm).filter((x): x is number => x != null && x > 0).sort((a, b) => a - b);
  const median = s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
  const vsMedian = median && l.price_sqm ? (l.price_sqm - median) / median : null;
  const start = Date.parse(l.src_created_at ?? "") || Date.parse(l.first_seen_at);
  const end = l.status === "activ" ? Date.now() : Date.parse(l.last_seen_at);
  const days = Number.isFinite(start) ? Math.max(0, Math.round((end - start) / 864e5)) : null;
  const priced = [...history].filter((h) => h.price != null).sort((a, b) => a.at.localeCompare(b.at));
  const first = priced[0]?.price ?? null;
  const change = first && l.price && priced.length > 1 ? (l.price - first) / first : null;
  return { nearby: rows, median, n: s.length, vsMedian, days, portals: new Set([l.source, ...dupSources]).size, change };
}
