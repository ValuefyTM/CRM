// The points of an asset for the big map of „Localizare”, in this order of trust: the parcel from the geoportal plans
// (UVALO locator), the point of the address, the GPS the inspector's phone took at the inspection.
import { parseGeo } from "./registry";
import type { LL, Parcel } from "./site-shared";
import { cadastralRoot } from "./geolocate";

export type PinKind = "uvalo" | "adresa" | "inspectie";
export type AssetPin = { kind: PinKind; lat: number | null; lng: number | null; note: string };
/** What the client still needs to ask for a missing pin (no point saved yet): the cadastral numbers or the address. */
/** The land on the map: the parcel's contour and its buildings (geoportal plans, through UVALO). */
export type PinParcel = { nr: string | null; uat: string | null; area: number | null; ring: LL[]; buildings: LL[][] };
export const pinParcel = (p: Parcel | null | undefined): PinParcel | null => p?.ring?.length
  ? { nr: p.nr, uat: p.uat, area: p.area_plan ?? p.area_calc ?? null, ring: p.ring, buildings: (p.buildings ?? []).map((b) => b.ring).filter((r) => r?.length) } : null;
export type PinQuery = { nr: string | null; asset: string; uvalo: boolean; property: string | null; city: string | null; county: string | null; cad_building: string | null; cad_land: string | null; cf_number: string | null; address: string | null };

const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
const parse = <T,>(s: string | null | undefined): T | null => { try { return s ? (JSON.parse(s) as T) : null; } catch { return null; } };

export async function assetPins(db: D1Database, assetId: string): Promise<{ pins: AssetPin[]; query: PinQuery; parcel: PinParcel | null }> {
  const p = await db.prepare(`SELECT p.id, p.geo, p.geo_source, p.geo_note, p.city, p.county, p.full_address, p.cad_building, p.cad_land, p.cf_number,
      s.source AS site_source, s.parcel
      FROM assets a JOIN crm_properties p ON p.id = a.property_id LEFT JOIN asset_site s ON s.asset_id = a.id WHERE a.id = ?`).bind(assetId)
    .first<{ id: string; geo: string | null; geo_source: string | null; geo_note: string | null; city: string | null; county: string | null; full_address: string | null;
      cad_building: string | null; cad_land: string | null; cf_number: string | null; site_source: string | null; parcel: string | null }>().catch(() => null);
  const query: PinQuery = { nr: cadastralRoot(p?.cad_land) ?? cadastralRoot(p?.cad_building) ?? cadastralRoot(p?.cf_number) ?? null, asset: assetId, uvalo: false, property: p?.id ?? null, city: p?.city ?? null, county: p?.county ?? null, cad_building: p?.cad_building ?? null, cad_land: p?.cad_land ?? null, cf_number: p?.cf_number ?? null, address: p?.full_address ?? null };
  const geo = parseGeo(p?.geo ?? null);
  const pin = (kind: PinKind, ll: [number, number] | null, note: string): AssetPin => ({ kind, lat: ll ? r6(ll[0]) : null, lng: ll ? r6(ll[1]) : null, note });

  // 1. the geoportal plans: the parcel of the site analysis (its centre), else the property's point when it came from the plans
  const parcel = p?.site_source === "ancpi" ? parse<Parcel>(p.parcel) : null;
  const uvalo = parcel?.centre ? pin("uvalo", parcel.centre, `centrul parcelei${parcel.nr ? ` nr. ${parcel.nr}` : ""}${parcel.uat ? ` · UAT ${parcel.uat}` : ""}`)
    : geo && p?.geo_source === "cadastru" ? pin("uvalo", geo, p.geo_note || "din planurile geoportalului")
    : pin("uvalo", null, "");
  // 2. the address
  // (a point of the property from elsewhere — Glide, set by hand — stands here, said so)
  const other = geo && p?.geo_source !== "cadastru" && p?.geo_source !== "gps";
  const adresa = other && (p?.geo_source === "adresa" || p?.geo_source === "localitate") ? pin("adresa", geo, p?.geo_note || "după adresă")
    : other ? pin("adresa", geo, p?.geo_source === "manual" ? "punctul pus de mână la proprietate" : "punctul salvat la proprietate (din Glide)")
    : pin("adresa", null, "");
  // 3. the inspection: where the sheet was signed, else the photos' GPS (the middle of them)
  const sheet = await db.prepare(`SELECT s.lat, s.lng, COALESCE(i.done_at, s.updated_at) AS at, i.uvalo_id,
        json_extract(s.details, '$.uvalo.location.source') AS src, json_extract(s.details, '$.uvalo.location.accuracy_m') AS acc
      FROM inspection_sheets s JOIN inspections i ON i.id = s.inspection_id
      WHERE i.asset_id = ? AND s.lat IS NOT NULL AND s.lng IS NOT NULL ORDER BY COALESCE(i.done_at, s.updated_at) DESC LIMIT 1`).bind(assetId)
    .first<{ lat: number; lng: number; at: string | null; uvalo_id: string | null; src: string | null; acc: number | null }>().catch(() => null);
  const when = sheet?.at ? ` · ${sheet.at.slice(0, 10).split("-").reverse().join(".")}` : "";
  let insp = !sheet ? null
    : sheet.uvalo_id ? pin("inspectie", [sheet.lat, sheet.lng], sheet.src === "manual" ? `UVALO · pin pus de evaluator pe hartă${when}` : `UVALO · GPS-ul telefonului${sheet.acc ? ` (±${Math.round(sheet.acc)} m)` : ""}${when}`)
    : pin("inspectie", [sheet.lat, sheet.lng], `GPS la semnarea fișei${when}`);
  if (!insp) {
    const { results } = await db.prepare(`SELECT f.lat, f.lng FROM inspection_photos f JOIN inspections i ON i.id = f.inspection_id
        WHERE i.asset_id = ? AND f.deleted_at IS NULL AND f.lat IS NOT NULL AND f.lng IS NOT NULL LIMIT 200`).bind(assetId)
      .all<{ lat: number; lng: number }>().catch(() => ({ results: [] as { lat: number; lng: number }[] }));
    if (results.length) {
      const mid = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
      insp = pin("inspectie", [mid(results.map((r) => r.lat)), mid(results.map((r) => r.lng))], `GPS din ${results.length} ${results.length === 1 ? "fotografie" : "fotografii"} de la inspecție`);
    } else if (geo && p?.geo_source === "gps") insp = pin("inspectie", geo, p.geo_note || "GPS de la inspecție");
  }
  if (!sheet) query.uvalo = !!(await db.prepare("SELECT 1 AS x FROM inspections i JOIN inspection_sheets s ON s.inspection_id = i.id WHERE i.asset_id = ? AND i.uvalo_id IS NOT NULL AND i.status = 'done' AND s.lat IS NULL LIMIT 1")
    .bind(assetId).first().catch(() => null));
  return { pins: [uvalo, adresa, insp ?? pin("inspectie", null, "")], query, parcel: pinParcel(parcel) };
}
