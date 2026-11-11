// The map of prices (Hartă prețuri): the values given in the valuation reports finished in the last 12 months, in and
// around Timișoara, as euro per square metre (usable area; the land's area for land), by type of property. Only the
// assets whose value is written in the report (not the report's total spread over its assets).

export type PriceType = "apartament" | "casa" | "teren" | "comercial" | "birouri" | "industrial" | "altele";
export const PRICE_TYPES: [PriceType, string][] = [
  ["apartament", "Apartamente"], ["casa", "Case și vile"], ["teren", "Terenuri"], ["comercial", "Spații comerciale"],
  ["birouri", "Birouri"], ["industrial", "Hale și industrial"], ["altele", "Alte proprietăți"],
];
export type PricePoint = {
  id: string; lat: number; lng: number; type: PriceType; typeLabel: string; eur: number; sqm: number; area: number;
  address: string; date: string; report: string; number: string | null; inCity: boolean;
};

/** Timișoara's centre (Piața Victoriei): the metropolitan area is within 15 km of it. */
export const TM_CENTRE: [number, number] = [45.7537, 21.2257];
export const METRO_KM = 15;
const fold = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const km = (a: [number, number], b: [number, number]) => {
  const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

/** The kind of property, from its type and category as written in the CRM ("APARTAMENT IN BLOC", "CASA CU TEREN", "TEREN EXTRAVILAN"…). */
export function priceType(type: string | null, category: string | null): PriceType {
  const t = fold(`${type ?? ""} ${category ?? ""}`);
  if (/apartament|garsonier|duplex|penthouse|studio/.test(t)) return "apartament";
  if (/\bteren\b/.test(fold(type)) && !/casa|vila|cladire|constructi/.test(fold(type))) return "teren";
  if (/\bcas[ae]\b|vila|locuint|insiruit|cuplat/.test(t)) return "casa";
  if (/birou|office/.test(t)) return "birouri";
  if (/comercial|magazin|retail|restaurant|hotel|spatiu/.test(t)) return "comercial";
  if (/hala|industrial|depozit|productie|logistic/.test(t)) return "industrial";
  if (/\bteren\b/.test(t)) return "teren";
  return "altele";
}

/** Prices outside these bounds (€/m²) are typing errors or special cases: left out of the map. */
const SANE: Record<PriceType, [number, number]> = {
  apartament: [250, 8000], casa: [150, 8000], teren: [2, 1500], comercial: [100, 12000], birouri: [100, 10000], industrial: [20, 4000], altele: [5, 12000],
};
/** The euro rate when the report has none recorded (BNR, roughly, for the last year). */
const EUR_FALLBACK = 4.97;

export async function pricePoints(db: D1Database, months = 12): Promise<PricePoint[]> {
  const since = new Date(); since.setMonth(since.getMonth() - months);
  const { results } = await db.prepare(`SELECT a.id, a.value, a.value_eur, r.eur_rate, r.currency, r.glide_id, r.id AS report, r.number,
        COALESCE(r.report_date, substr(r.delivered_at, 1, 10), substr(r.updated_at, 1, 10)) AS d,
        p.type, p.category, p.geo, p.usable_area, p.land_area, p.full_address, p.city
      FROM assets a JOIN reports r ON r.id = a.report_id JOIN crm_properties p ON p.id = a.property_id
      WHERE r.status = 'done' AND (a.value > 0 OR a.value_eur > 0) AND p.geo LIKE '%_,_%' AND p.category IS NOT 'BUN MOBIL'
        AND COALESCE(r.report_date, substr(r.delivered_at, 1, 10), substr(r.updated_at, 1, 10)) >= ?`)
    .bind(since.toISOString().slice(0, 10))
    .all<{ id: string; value: number | null; value_eur: number | null; eur_rate: number | null; currency: string | null; glide_id: string | null; report: string; number: string | null; d: string;
      type: string | null; category: string | null; geo: string; usable_area: number | null; land_area: number | null; full_address: string | null; city: string | null }>();
  const out: PricePoint[] = [];
  for (const x of results) {
    const m = x.geo.match(/(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)/);
    if (!m) continue;
    const ll: [number, number] = [Number(m[1]), Number(m[2])];
    if (km(ll, TM_CENTRE) > METRO_KM) continue;
    const t = priceType(x.type, x.category);
    const area = t === "teren" ? x.land_area ?? 0 : x.usable_area ?? 0;
    if (!(area > 0)) continue;
    // the value in euro: as given at delivery; the values imported from the old CRM (Glide) are in euro already;
    // else the value in lei at the report's BNR rate
    const eur = x.value_eur && x.value_eur > 0 ? x.value_eur : x.glide_id || x.currency === "EUR" ? x.value! : x.value! / (x.eur_rate && x.eur_rate > 3 ? x.eur_rate : EUR_FALLBACK);
    const sqm = eur / area;
    if (!(sqm >= SANE[t][0] && sqm <= SANE[t][1])) continue;
    out.push({
      id: x.id, lat: ll[0], lng: ll[1], type: t, typeLabel: (x.type ?? "").trim() || PRICE_TYPES.find(([k]) => k === t)![1], eur: Math.round(eur), sqm: Math.round(sqm), area: Math.round(area * 10) / 10,
      address: x.full_address ?? x.city ?? "", date: x.d, report: x.report, number: x.number, inCity: x.city?.trim() ? /timisoara/.test(fold(x.city)) : km(ll, TM_CENTRE) <= 4,
    });
  }
  return out;
}
