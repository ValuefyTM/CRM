// The county, town and zone of a listing as filter keys: lower case, no diacritics, without the words sites put in
// front ("Județul Timiș", "Mun. Timișoara", "Cartierul Fabric", "zona Lipovei").
import { norm } from "./util";

const PREFIX = /^(judetul|judet|jud|municipiul|municipiu|mun|orasul|oras|comuna|com|satul|sat|cartierul|cartier|zona|sector(?=ul\b)|localitatea)\b\.?\s*/;

export function placeKey(v: string | null | undefined): string | null {
  let t = norm(v).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 2; i++) t = t.replace(PREFIX, "").trim();
  return t || null;
}

/** A point a listing in Romania can have (a little over the borders); anything else — the ocean, 0 / 0 — is no point. */
export const inRomania = (lat: unknown, lng: unknown) => typeof lat === "number" && typeof lng === "number" && lat >= 43.5 && lat <= 48.4 && lng >= 20.2 && lng <= 29.8;
/** The point of a listing as it can be kept: as given, turned round when latitude and longitude came swapped, or none. */
export function goodPoint(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const a = typeof lat === "number" ? lat : Number.NaN, b = typeof lng === "number" ? lng : Number.NaN;
  return inRomania(a, b) ? { lat: a, lng: b } : inRomania(b, a) ? { lat: b, lng: a } : null;
}

/** The three keys of a listing; the zone is dropped when it only repeats the town. */
export function placeKeys(r: { county?: unknown; city?: unknown; zone?: unknown }) {
  const county = placeKey(r.county as string), city = placeKey(r.city as string), zone = placeKey(r.zone as string);
  return { county, city, zone: zone && zone !== city ? zone : null };
}
