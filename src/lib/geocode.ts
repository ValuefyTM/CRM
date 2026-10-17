// Server-only: places an address on the map when the cadastral plans (geoportal, through the Tools locator) do not
// have the property. OpenStreetMap's Nominatim first, then Photon; without a match of the address, the centre of the
// locality, marked as approximate. Only points inside Romania are accepted.

export type AddressHit = { lat: number; lng: number; source: "adresa" | "localitate"; note: string };

const UA = "VALUEFY-CRM/1.0 (+https://valuefy.ro)";
const inRomania = (lat: number, lng: number) => lat > 43.5 && lat < 48.4 && lng > 20.2 && lng < 29.8;

async function get(url: string) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": UA, "Accept-Language": "ro" } });
    return r.ok ? await r.json() : null;
  } catch { return null; } finally { clearTimeout(t); }
}

async function nominatim(q: string) {
  const d = (await get(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ro&q=${encodeURIComponent(q)}`)) as { lat: string; lon: string; display_name: string }[] | null;
  const h = d?.[0];
  if (!h) return null;
  const lat = Number(h.lat), lng = Number(h.lon);
  return Number.isFinite(lat) && inRomania(lat, lng) ? { lat, lng, label: h.display_name } : null;
}

async function photon(q: string) {
  const d = (await get(`https://photon.komoot.io/api/?limit=1&lang=default&q=${encodeURIComponent(q)}`)) as { features?: { geometry: { coordinates: [number, number] }; properties: { name?: string; city?: string; country?: string } }[] } | null;
  const f = d?.features?.[0];
  if (!f) return null;
  const [lng, lat] = f.geometry.coordinates;
  return inRomania(lat, lng) ? { lat, lng, label: [f.properties.name, f.properties.city].filter(Boolean).join(", ") } : null;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The point of an address ("Str. Bujorilor 4, ap. 8" in Timișoara, Timiș). The flat details (bloc, scara, ap.) are
 * left out: maps know buildings, not flats.
 */
export async function geocodeAddress(p: { address?: string | null; city?: string | null; county?: string | null }): Promise<AddressHit | null> {
  const city = (p.city ?? "").trim(), county = (p.county ?? "").trim();
  const street = (p.address ?? "")
    .replace(/\b(bl|bloc|sc|scara|et|etaj|ap|apartament|cam|camera)\.?\s*[\w/-]+/gi, "")
    .replace(/\s*,\s*,+/g, ",").replace(/[,\s]+$/, "").trim();
  const place = [city, county && !/bucure/i.test(county) ? `județul ${county}` : "", "România"].filter(Boolean).join(", ");
  if (street) {
    const q = street.toLowerCase().includes(city.toLowerCase()) && city ? `${street}, ${county ? `județul ${county}, ` : ""}România` : `${street}, ${place}`;
    const hit = (await nominatim(q)) ?? (await photon(q));
    if (hit) return { lat: hit.lat, lng: hit.lng, source: "adresa", note: `după adresă · ${hit.label}`.slice(0, 300) };
  }
  if (city) {
    await pause(1100); // Nominatim asks for at most one request a second
    const hit = (await nominatim(place)) ?? (await photon(place));
    if (hit) return { lat: hit.lat, lng: hit.lng, source: "localitate", note: `aproximativ: centrul localității ${city}` };
  }
  return null;
}
