// The county, town and zone of a listing as filter keys: lower case, no diacritics, without the words sites put in
// front ("Județul Timiș", "Mun. Timișoara", "Cartierul Fabric", "zona Lipovei").
import { norm } from "./util";

const PREFIX = /^(judetul|judet|jud|municipiul|municipiu|mun|orasul|oras|comuna|com|satul|sat|cartierul|cartier|zona|sector(?=ul\b)|localitatea)\b\.?\s*/;

export function placeKey(v: string | null | undefined): string | null {
  let t = norm(v).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 2; i++) t = t.replace(PREFIX, "").trim();
  return t || null;
}

/** The three keys of a listing; the zone is dropped when it only repeats the town. */
export function placeKeys(r: { county?: unknown; city?: unknown; zone?: unknown }) {
  const county = placeKey(r.county as string), city = placeKey(r.city as string), zone = placeKey(r.zone as string);
  return { county, city, zone: zone && zone !== city ? zone : null };
}
