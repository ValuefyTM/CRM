// Server-only: how far an inspection was from its inspector's base address (their account), else from the office
// (the firm's correspondence address, Setări → Date firmă),
// by road, by car (OSRM on OpenStreetMap; a straight line until the router answers). The office is placed on the map
// once and kept (settings: office_geo) until its address changes; an inspection's place is the phone's GPS at the
// inspection, else the address given with it, else the property's pin.
import { now } from "./db";
import { getFirm } from "./settings";
import { geocodeAddress } from "./geocode";
import { parseGeo } from "./registry";

type Point = [number, number];

export function km(a: Point, b: Point) {
  const R = 6371, d = Math.PI / 180;
  const x = Math.sin(((b[0] - a[0]) * d) / 2) ** 2 + Math.cos(a[0] * d) * Math.cos(b[0] * d) * Math.sin(((b[1] - a[1]) * d) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** "Giroc, Strada Bega, Nr. 25/4, Județul Timiș" → street "Strada Bega 25", city "Giroc", county "Timiș". */
export function splitAddress(a: string) {
  const parts = a.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  let street = "", no = "", city = "", county = "";
  for (const x of parts) {
    const j = x.match(/^(?:jud(?:ețul|etul|\.)?|județ|judet)\s*\.?\s*(.+)$/i);
    if (j) { county = j[1].trim(); continue; }
    if (/^(?:mun(?:icipiul|\.)?|ora[sș]ul|com(?:una|\.)?|sat(?:ul)?|loc(?:alitatea|\.)?)\s/i.test(x) && !city) { city = x.replace(/^\S+\s+/, ""); continue; }
    const n = x.match(/^(?:nr|num[aă]rul)\.?\s*(\d+\w?)/i);
    if (n) { no = n[1]; continue; }
    if (/^\d{6}$/.test(x) || /^(?:cod|rom[aâ]nia)/i.test(x)) continue;
    if (/^(?:str|strada|bd|b-dul|bulevardul|calea|aleea|al|pia[tț]a|p-ta|[sș]os|[sș]oseaua|intrarea|splaiul|drumul|dn)\b/i.test(x) && !street) {
      const m = x.match(/^(.*?)(?:,?\s*nr\.?\s*|\s+)(\d+\w?)(?:\/\S*)?$/i);
      if (m && /\D/.test(m[1])) { street = m[1].trim(); no ||= m[2]; } else street = x;
      continue;
    }
    if (/^(?:bl|sc|et|ap|cam)\b/i.test(x)) continue;
    if (!city) city = x;
  }
  street = street.replace(/^str\.?\s+/i, "Strada ").replace(/^bd\.?\s+|^b-dul\s+/i, "Bulevardul ");
  return { street: [street, no].filter(Boolean).join(" "), city, county };
}

/**
 * The office's point: the coordinates in Setări → Date firmă when filled; else the correspondence address (then the
 * registered office) placed on the map once — the street, else the centre of the locality. A failed attempt is not
 * retried for 6 hours (so a page does not wait on the maps each time).
 */
export async function officePoint(db: D1Database): Promise<{ point: Point; address: string; approx?: boolean } | null> {
  const firm = await getFirm(db);
  const manual = parseGeo(firm.geo || null);
  if (manual) return { point: manual, address: "coordonatele din Setări" };
  const addresses = [...new Set([firm.mail, firm.address].map((x) => (x || "").trim()).filter(Boolean))];
  if (!addresses.length) return null;
  const sig = addresses.join(" | ");
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'office_geo'").first<{ value: string }>().catch(() => null);
  try {
    const kept = row ? (JSON.parse(row.value) as { address: string; lat?: number; lng?: number; source?: string; failed_at?: string }) : null;
    if (kept && kept.address === sig) {
      if (kept.lat != null && kept.lng != null) return { point: [kept.lat, kept.lng], address: sig, approx: kept.source === "localitate" };
      if (kept.failed_at && Date.now() - Date.parse(kept.failed_at) < 6 * 3600e3) return null;
    }
  } catch { /* placed again */ }
  let hit: Awaited<ReturnType<typeof geocodeAddress>> = null;
  for (const a of addresses) {
    const { street, city, county } = splitAddress(a);
    hit = await geocodeAddress({ address: street || a, city, county }).catch(() => null);
    if (hit) break;
  }
  const value = hit ? { address: sig, lat: hit.lat, lng: hit.lng, source: hit.source, note: hit.note } : { address: sig, failed_at: new Date().toISOString() };
  await db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('office_geo', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(JSON.stringify(value), now()).run().catch(() => null);
  if (!hit) console.error("office geocode failed", sig);
  return hit ? { point: [hit.lat, hit.lng], address: sig, approx: hit.source === "localitate" } : null;
}

/**
 * Where a person's inspections are measured from (their account page): the office, or their base address — placed on
 * the map (or the coordinates written) and kept on the account.
 */
export async function saveBase(db: D1Database, userId: string, from: string, address: string, coords: string) {
  if (from !== "base") {
    await db.prepare("UPDATE users SET distance_from = 'office' WHERE id = ?").bind(userId).run();
    return { ok: true as const, note: "Distanțele se calculează de la sediul firmei." };
  }
  const a = address.trim().replace(/\s+/g, " ").slice(0, 300), c = coords.trim();
  if (!a && !c) return { ok: false as const, error: "Scrie adresa lui (sau coordonatele)." };
  let p: Point | null = null, note = "";
  if (c) {
    p = parseGeo(c);
    if (!p) return { ok: false as const, error: "Coordonatele: „lat, lng”, ex. 45.7537, 21.2257." };
    note = "după coordonatele scrise";
  } else {
    const { street, city, county } = splitAddress(a);
    const hit = await geocodeAddress({ address: street || a, city, county }).catch(() => null);
    if (!hit) return { ok: false as const, error: "Adresa nu a fost găsită pe hartă. Scrie și localitatea și județul (ex. „Str. Bega 25, Giroc, jud. Timiș”) sau completează coordonatele." };
    p = [hit.lat, hit.lng]; note = hit.note;
  }
  await db.prepare("UPDATE users SET distance_from = 'base', base_address = ?, base_lat = ?, base_lng = ?, base_note = ? WHERE id = ?").bind(a || null, p[0], p[1], note.slice(0, 300), userId).run();
  return { ok: true as const, note, lat: p[0], lng: p[1] };
}

/** `from`: measured from the inspector's base address, or from the office. */
export type Distance = { km: number; road: boolean; from?: "base" | "office" };

/** Road distances (km) from one point to several, by car (OSRM, OpenStreetMap); null when the router does not answer. */
async function roadKm(from: Point, to: Point[]): Promise<(number | null)[] | null> {
  if (!to.length) return [];
  const base = (process.env.OSRM_URL || "https://router.project-osrm.org").replace(/\/$/, "");
  const coords = [from, ...to].map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(";");
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(`${base}/table/v1/driving/${coords}?sources=0&annotations=distance`, { signal: ctl.signal, headers: { "User-Agent": "VALUEFY-CRM/1.0 (+https://valuefy.ro)" } });
    if (!r.ok) return null;
    const d = (await r.json()) as { code?: string; distances?: (number | null)[][] };
    if (d.code !== "Ok" || !d.distances?.[0]) return null;
    return d.distances[0].slice(1).map((m) => (m == null ? null : Math.round(m / 100) / 10));
  } catch { return null; } finally { clearTimeout(t); }
}

/**
 * Distance to each inspection, in km (one decimal), from where its inspector's account says (their base address, or
 * the office): by road, by car, computed once and kept (inspection_routes); in a straight line
 * (`road: false`) while the router cannot be reached. Missing when the inspection's place, or the start, is not known.
 */
export async function inspectionDistances(db: D1Database, ids: string[]): Promise<Record<string, Distance>> {
  if (!ids.length) return {};
  const { results } = await db.prepare(`SELECT i.id, s.lat AS s_lat, s.lng AS s_lng, i.lat, i.lng, p.geo, u.distance_from, u.base_lat, u.base_lng, k.office AS k_office, k.lat AS k_lat, k.lng AS k_lng, k.road_km
      FROM inspections i LEFT JOIN assets a ON a.id = i.asset_id LEFT JOIN crm_properties p ON p.id = a.property_id
      LEFT JOIN users u ON u.id = i.inspector_id
      LEFT JOIN inspection_sheets s ON s.id = (SELECT y.id FROM inspection_sheets y WHERE y.inspection_id = i.id AND y.lat IS NOT NULL ORDER BY y.updated_at DESC LIMIT 1)
      LEFT JOIN inspection_routes k ON k.inspection_id = i.id
      WHERE i.id IN (${ids.map(() => "?").join(", ")})`).bind(...ids)
    .all<{ id: string; s_lat: number | null; s_lng: number | null; lat: number | null; lng: number | null; geo: string | null; distance_from: string | null; base_lat: number | null; base_lng: number | null; k_office: string | null; k_lat: number | null; k_lng: number | null; road_km: number | null }>()
    .catch(() => ({ results: [] as never[] }));
  let office: Point | null | undefined;
  const out: Record<string, Distance> = {};
  // the ones to ask the router, by their start
  const todo = new Map<string, { from: Point; kind: "base" | "office"; items: { id: string; p: Point }[] }>();
  for (const r of results) {
    const p: Point | null = r.s_lat != null && r.s_lng != null ? [r.s_lat, r.s_lng] : r.lat != null && r.lng != null ? [r.lat, r.lng] : parseGeo(r.geo);
    if (!p) continue;
    let from: Point | null, kind: "base" | "office";
    if (r.distance_from === "base") { from = r.base_lat != null && r.base_lng != null ? [r.base_lat, r.base_lng] : null; kind = "base"; }
    else { if (office === undefined) office = (await officePoint(db).catch(() => null))?.point ?? null; from = office; kind = "office"; }
    if (!from) continue;
    const key = `${from[0].toFixed(5)},${from[1].toFixed(5)}`;
    // kept: the same start, the same place
    if (r.road_km != null && r.k_office === key && r.k_lat === p[0] && r.k_lng === p[1]) { out[r.id] = { km: r.road_km, road: true, from: kind }; continue; }
    out[r.id] = { km: Math.round(km(from, p) * 10) / 10, road: false, from: kind };
    const g = todo.get(key) ?? { from, kind, items: [] };
    g.items.push({ id: r.id, p }); todo.set(key, g);
  }
  // one request to the router per start, for up to 80 places at a time
  for (const [key, g] of todo) {
    for (let i = 0; i < g.items.length; i += 80) {
      const part = g.items.slice(i, i + 80);
      const got = await roadKm(g.from, part.map((x) => x.p));
      if (!got) return out;
      const t = now(), stmts: D1PreparedStatement[] = [];
      part.forEach((x, j) => {
        const v = got[j];
        if (v == null) return;
        out[x.id] = { km: v, road: true, from: g.kind };
        stmts.push(db.prepare(`INSERT INTO inspection_routes (inspection_id, office, lat, lng, road_km, computed_at) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(inspection_id) DO UPDATE SET office = excluded.office, lat = excluded.lat, lng = excluded.lng, road_km = excluded.road_km, computed_at = excluded.computed_at`)
          .bind(x.id, key, x.p[0], x.p[1], v, t));
      });
      if (stmts.length) await db.batch(stmts).catch((e) => console.error("routes", e));
    }
  }
  return out;
}
