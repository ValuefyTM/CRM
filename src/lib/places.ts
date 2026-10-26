// Counties and localities of Romania (public/data/localitati.json: 42 counties, every locality, villages included),
// loaded once in the browser, and finding the county and locality written inside an address. No server code.

export type Places = Record<string, string[]>;
let cache: Promise<Places> | null = null;

/**
 * Without diacritics (also the old ş / ţ), case and dashes kept: "Timișoara" → "Timisoara". Localities and counties are
 * kept this way in the CRM (the database also strips them on every save), so the pickers offer them the same way.
 */
export const plain = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").normalize("NFC");

export function loadPlaces(): Promise<Places> {
  cache ??= fetch("/data/localitati.json").then((r) => (r.ok ? r.json() : {}))
    .then((p: Places) => Object.fromEntries(Object.entries(p).map(([c, l]) => [plain(c), l.map(plain)])))
    .catch(() => { cache = null; return {}; }) as Promise<Places>;
  return cache;
}

/** Lower case, no diacritics (also the old ş / ţ), dashes as spaces: "Bistrița-Năsăud" → "bistrita nasaud". */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[-–]/g, " ").replace(/\s+/g, " ").trim();

// Where VALUEFY works most: a locality name found in several counties goes to the first of these.
const PRIORITY = ["Timiș", "Cluj", "Arad", "Bihor", "Caraș-Severin", "Hunedoara", "Alba", "Mureș", "Sibiu", "Sălaj", "București", "Ilfov"].map(fold);

const STREET = /(str|strada|bd|blvd|bulevardul|calea|aleea|al|piata|p ta|splaiul|intrarea|int|soseaua|sos|drumul|pasajul)\.?\s*$/;
/** The word is in the text, as a whole word, and not as the name of a street ("Str. Mihai Viteazu" is not the commune). */
const has = (text: string, word: string) => {
  const re = new RegExp(`(^|[^a-z0-9])(${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?=[^a-z0-9]|$)`, "g");
  for (const m of text.matchAll(re)) {
    const before = text.slice(Math.max(0, m.index + m[1].length - 14), m.index + m[1].length);
    if (!STREET.test(before)) return true;
  }
  return false;
};

/**
 * The county and locality written in an address ("Str. Bujorilor 4, Timișoara, jud. Timiș", "sat Bucovăț, com.
 * Remetea Mare"): the county when it is named, then the longest locality name of that county found in the text.
 * Without a county, a locality found in only one county (or in the first of the usual ones) gives the county too.
 */
export function extractPlace(address: string, places: Places, county?: string | null): { county: string; city: string } | null {
  const text = fold(address);
  if (text.length < 3) return null;
  const counties = Object.keys(places);
  let found = county && places[county] ? county : null;
  if (!found) {
    if (/\bbucuresti\b|\bsector(ul)? [1-6]\b/.test(text)) found = counties.find((c) => fold(c) === "bucuresti") ?? null;
    // "jud. Timiș", "județul Timiș", or just the county's name.
    const named = counties.filter((c) => has(text, `jud ${fold(c)}`) || has(text, `jud. ${fold(c)}`) || has(text, `judetul ${fold(c)}`) || has(text, `judet ${fold(c)}`));
    found ??= named[0] ?? null;
  }
  // "sat Bucovăț, com. Remetea Mare": the village is the locality.
  const best = (list: string[]) => {
    const all = list.filter((l) => has(text, fold(l)));
    return all.find((l) => has(text, `sat ${fold(l)}`) || has(text, `satul ${fold(l)}`)) ?? all.sort((a, b) => fold(b).length - fold(a).length)[0] ?? null;
  };
  if (found) {
    if (fold(found) === "bucuresti") {
      const s = text.match(/\bsector(?:ul)? ([1-6])\b/);
      return { county: found, city: s ? `Sector ${s[1]}` : "" };
    }
    const city = best(places[found] ?? []);
    if (city) return { county: found, city };
    if (!county) {
      // The county's name may just be a word of the address (a street "Timișului"): only trust it with a locality.
      return { county: found, city: "" };
    }
  }
  // No county: every county with a locality named in the address, the longest name first.
  const hits = counties.map((c) => ({ c, l: best(places[c]) })).filter((x): x is { c: string; l: string } => !!x.l);
  if (!hits.length) return found ? { county: found, city: "" } : null;
  const longest = Math.max(...hits.map((h) => fold(h.l).length));
  const top = hits.filter((h) => fold(h.l).length === longest);
  const pick = top.length === 1 ? top[0] : top.sort((a, b) => (PRIORITY.indexOf(fold(a.c)) + 1 || 99) - (PRIORITY.indexOf(fold(b.c)) + 1 || 99))[0];
  return { county: pick.c, city: pick.l };
}
