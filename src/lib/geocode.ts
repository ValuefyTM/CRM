// Server-only: places an address on the map when the cadastral plans (geoportal, through the Tools locator) do not
// have the property. OpenStreetMap's Nominatim first (structured: street + number, locality, county), then Photon;
// a hit is kept only inside the property's locality. Without a match of the street, the centre of the locality,
// marked as approximate. Only points inside Romania are accepted.

export type AddressHit = { lat: number; lng: number; source: "adresa" | "localitate"; note: string };

const UA = "VALUEFY-CRM/1.0 (+https://valuefy.ro)";
const inRomania = (lat: number, lng: number) => lat > 43.5 && lat < 48.4 && lng > 20.2 && lng < 29.8;
/** lower case, without diacritics (ş/ș, ţ/ț too), for comparing names */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

async function get(url: string) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": UA, "Accept-Language": "ro" } });
    return r.ok ? await r.json() : null;
  } catch { return null; } finally { clearTimeout(t); }
}
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- reading the address ----------

const STREET_TYPES: [RegExp, string][] = [
  [/^(str|strada|st)$/, "Strada"], [/^(bd|bdul|blvd|b-dul|bulevardul|bulev)$/, "Bulevardul"], [/^(cal|calea)$/, "Calea"],
  [/^(al|alee|aleea)$/, "Aleea"], [/^(pta|p-ta|piata|piața)$/, "Piața"], [/^(int|intr|intrarea)$/, "Intrarea"],
  [/^(sos|şos|șos|soseaua|șoseaua|şoseaua)$/, "Șoseaua"], [/^(spl|splaiul)$/, "Splaiul"], [/^(drum|drumul)$/, "Drumul"], [/^(prel|prelungirea)$/, "Prelungirea"],
];
const TYPE_RE = /\b(str|strada|st|bd|bdul|b-dul|blvd|bulevardul|bulev|cal|calea|al|alee|aleea|pta|p-ta|pia[tț]a|int|intr|intrarea|[sșş]os|[sșş]oseaua|spl|splaiul|drum|drumul|prel|prelungirea)\b\.?\s*/i;

export type ParsedAddress = { street: string | null; number: string | null; locality: string | null; county: string | null };

/**
 * „Jud. Cluj, UAT Cluj-Napoca, Loc. Cluj-Napoca, Str CIOCARLIEI, Nr. 43-45, Et. demisol, Ap. 17” → street „Strada
 * Ciocarliei”, number „43”, locality „Cluj-Napoca”, county „Cluj”. The flat details (bloc, scara, etaj, ap.) are left
 * out: maps know buildings, not flats.
 */
export function parseAddress(raw: string | null | undefined): ParsedAddress {
  let s = ` ${(raw ?? "").replace(/\s+/g, " ")} `;
  const take = (re: RegExp) => { const m = s.match(re); if (m) s = s.replace(m[0], ", "); return m?.[1]?.trim().replace(/[.,;]+$/, "") || null; };
  const county = take(/\b(?:jud|judet|județ|judetul|județul)\b\.?\s*([^,;]+)/i);
  take(/\buat\b\.?\s*([^,;]+)/i);
  const locality = take(/\b(?:loc|localitatea|localitate|mun|municipiul|ora[sș]ul|ora[sș]|comuna|com|sat|satul)\b\.?\s*([^,;]+?)(?=,|;|\bnr\b|\bstr\b|$)/i);
  // the flat: bl./sc./et./ap./cam./corp and what follows each
  s = s.replace(/\b(bl|bloc|blocul|sc|scara|et|etaj|etajul|ap|apart|apartament|apartamentul|cam|camera|corp|tronson|lot)\b\.?\s*[\w/-]*(\s+(retras|demisol|parter|mansarda|mansardă))?/gi, ", ");
  // the number: „nr. 43-45” → 43, „nr 1B.” → 1B, „308C” → 308C
  const nm = s.match(/\bnr\b\.?\s*([0-9]+[a-z]?)/i);
  let number = nm ? nm[1].toUpperCase() : null;
  if (nm) s = s.replace(nm[0], ", ");
  // the street: after its type, else the first part that is not a place
  let street: string | null = null;
  const parts = s.split(/[,;]/).map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
  for (const part of parts) {
    const t = part.match(TYPE_RE);
    if (t && t.index === 0) {
      const kind = STREET_TYPES.find(([re]) => re.test(fold(t[1])))?.[1] ?? "Strada";
      let name = part.slice(t[0].length).trim();
      // „Somesului 1B” — a number written without „nr.”
      const tail = name.match(/\s+([0-9]+[a-z]?)$/i);
      if (tail && !number) { number = tail[1].toUpperCase(); name = name.slice(0, tail.index).trim(); }
      if (name) { street = `${kind} ${title(name)}`; break; }
    }
  }
  if (!street) {
    // a street written without its type („Sf. Iosif cel Nou de la Partoș, Nr. 42”, „CIOCARLIEI NR. 43-45”)
    const loose = parts.find((p) => /\p{L}{3,}/u.test(p) && (!locality || fold(p) !== fold(locality)));
    if (loose) {
      const tail = loose.match(/^(.*\D)\s+([0-9]+[a-z]?)$/i);
      if (tail) number ??= tail[2].toUpperCase();
      street = title((tail ? tail[1] : loose).trim());
    }
  }
  return { street, number, locality, county };
}
/** „CIOCARLIEI” → „Ciocarliei” (a name in capitals reads as a word); mixed case is kept. */
const title = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : s);

// ---------- the map services ----------

type Hit = { lat: number; lng: number; label: string; places: string[]; road: boolean };

async function nominatim(params: Record<string, string>) {
  const q = new URLSearchParams({ format: "jsonv2", limit: "3", countrycodes: "ro", addressdetails: "1", ...params });
  const d = (await get(`https://nominatim.openstreetmap.org/search?${q}`)) as
    { lat: string; lon: string; display_name: string; addresstype?: string; address?: Record<string, string> }[] | null;
  return (d ?? []).map((h): Hit => ({
    lat: Number(h.lat), lng: Number(h.lon), label: h.display_name,
    places: Object.entries(h.address ?? {}).filter(([k]) => /city|town|village|municipality|suburb|hamlet|county|state|city_district|quarter/.test(k)).map(([, v]) => v),
    road: !!(h.address?.road || h.address?.house_number) || /road|house|building|street/.test(h.addresstype ?? ""),
  })).filter((h) => Number.isFinite(h.lat) && inRomania(h.lat, h.lng));
}

async function photon(q: string) {
  const d = (await get(`https://photon.komoot.io/api/?limit=3&lang=default&lat=45.9&lon=24.9&q=${encodeURIComponent(q)}`)) as
    { features?: { geometry: { coordinates: [number, number] }; properties: Record<string, string> }[] } | null;
  return (d?.features ?? []).map((f): Hit => {
    const [lng, lat] = f.geometry.coordinates, p = f.properties;
    return { lat, lng, label: [p.street ?? p.name, p.housenumber, p.city ?? p.town ?? p.village].filter(Boolean).join(" "),
      places: [p.city, p.town, p.village, p.district, p.county, p.state, p.locality].filter(Boolean), road: !!(p.street || p.housenumber) || p.osm_key === "highway" };
  }).filter((h) => inRomania(h.lat, h.lng));
}

/** the hit inside the locality (and county), when they are known */
function inPlace(hits: Hit[], locality: string, county: string) {
  const L = fold(locality).replace(/^(municipiul|orasul|comuna|sat) /, ""), C = fold(county);
  return hits.find((h) => {
    const ps = h.places.map(fold);
    const okL = !L || ps.some((p) => p === L || p.includes(L) || L.includes(p)) || fold(h.label).includes(L);
    const okC = !C || /bucure/.test(C) || ps.some((p) => p.includes(C) || C.includes(p.replace(/^judetul /, "")));
    return okL && okC;
  }) ?? null;
}

/**
 * The point of an address („Loc. Timisoara, str. Ana Ipatescu, Nr. 18, Sc. A, Et. I, Ap. 6”, in Timișoara, Timiș):
 * the street and number, checked to be in the locality; else the street alone; else the centre of the locality.
 */
export async function geocodeAddress(p: { address?: string | null; city?: string | null; county?: string | null }): Promise<AddressHit | null> {
  const a = parseAddress(p.address);
  const city = (p.city ?? "").trim() || a.locality || "";
  // „Sacalaz” alone is the locality, not a street
  if (a.street && city && fold(a.street) === fold(city)) a.street = null;
  const county = (p.county ?? "").trim() || a.county || "";
  const countyQ = county && !/bucure/i.test(county) ? county : "";
  const at = (h: Hit, what: string): AddressHit => ({ lat: h.lat, lng: h.lng, source: "adresa", note: `după adresă (${what}) · ${h.label}`.slice(0, 300) });

  if (a.street) {
    const withNr = a.number ? `${a.street} ${a.number}` : a.street;
    // 1. structured: street + number, locality, county
    const s1 = inPlace((await nominatim({ street: a.number ? `${a.number} ${a.street}` : a.street, ...(city && { city }), ...(countyQ && { county: countyQ }) })).filter((h) => h.road), city, county);
    if (s1) return at(s1, a.number ? "stradă și număr" : "stradă");
    await pause(1100); // Nominatim asks for at most one request a second
    // 2. free text, then Photon
    const q = [withNr, city, countyQ && `județul ${countyQ}`, "România"].filter(Boolean).join(", ");
    const s2 = inPlace((await nominatim({ q })).filter((h) => h.road), city, county) ?? inPlace((await photon([withNr, city, countyQ].filter(Boolean).join(", "))).filter((h) => h.road), city, county);
    if (s2) return at(s2, a.number ? "stradă și număr" : "stradă");
    // 3. the street without the number (its middle is better than the locality's)
    if (a.number) {
      await pause(1100);
      const s3 = inPlace((await nominatim({ street: a.street, ...(city && { city }), ...(countyQ && { county: countyQ }) })).filter((h) => h.road), city, county);
      if (s3) return { ...at(s3, "doar strada, numărul nu e pe hartă"), source: "adresa" };
    }
  }
  if (city) {
    await pause(1100);
    const hit = inPlace(await nominatim({ city, ...(countyQ && { county: countyQ }) }), city, county) ?? inPlace(await photon([city, countyQ, "România"].filter(Boolean).join(", ")), city, "");
    if (hit) return { lat: hit.lat, lng: hit.lng, source: "localitate", note: `aproximativ: centrul localității ${city}${a.street ? ` (strada ${a.street} nu a fost găsită)` : ""}` };
  }
  return null;
}
