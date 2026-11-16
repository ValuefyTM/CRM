// The address of a results page, built from the kind of property, the transaction and the place (the "Propune adresa"
// helper of a search). The shapes follow the sites' own paths; the page is opened and checked before saving.
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const SUGGEST_KINDS: { key: string; label: string; category: string; type: string }[] = [
  { key: "apartamente", label: "Apartamente", category: "REZIDENTIAL", type: "APARTAMENT IN BLOC" },
  { key: "case", label: "Case", category: "REZIDENTIAL", type: "CASA CU TEREN" },
  { key: "terenuri", label: "Terenuri", category: "TEREN", type: "" },
  { key: "comerciale", label: "Spații comerciale", category: "COMERCIAL", type: "" },
  { key: "birouri", label: "Birouri", category: "COMERCIAL", type: "" },
  { key: "hale", label: "Hale / spații industriale", category: "INDUSTRIAL", type: "" },
];

type Deal = "vanzare" | "inchiriere";
const PATHS: Record<string, { kinds: Record<string, string>; url: (kind: string, deal: Deal, county: string, city: string) => string }> = {
  "storia.ro": {
    kinds: { apartamente: "apartament", case: "casa", terenuri: "teren", comerciale: "spatiu-comercial", birouri: "birou", hale: "depozite-hale" },
    url: (k, d, county, city) => `https://www.storia.ro/ro/rezultate/${d}/${k}/${county}${city ? `/${city}` : ""}`,
  },
  "publi24.ro": {
    kinds: { apartamente: "apartamente", case: "case", terenuri: "terenuri", comerciale: "spatii-comerciale", birouri: "birouri", hale: "spatii-comerciale/hala-industriala" },
    url: (k, d, county, city) => `https://www.publi24.ro/anunturi/imobiliare/${d === "vanzare" ? "de-vanzare" : "de-inchiriat"}/${k}/${county}/${city ? `${city}/` : ""}`,
  },
  "imobiliare.ro": {
    kinds: { apartamente: "apartamente", case: "case-vile", terenuri: "terenuri", comerciale: "spatii-comerciale", birouri: "birouri", hale: "spatii-industriale" },
    url: (k, d, county, city) => `https://www.imobiliare.ro/${d === "vanzare" ? "vanzare" : "inchirieri"}-${k}/${city || `judetul-${county}`}`,
  },
};
export const SUGGEST_SOURCES = Object.keys(PATHS);

/** The proposed search, or null when the site has no known shape or the county is missing. */
export function suggestSearch(source: string, kind: string, deal: Deal, county: string, city: string) {
  const p = PATHS[source], k = SUGGEST_KINDS.find((x) => x.key === kind);
  const c = slug(county), t = slug(city);
  if (!p || !k || !c) return null;
  const where = city.trim() || `jud. ${county.trim()}`;
  return { url: p.url(p.kinds[kind], deal, c, t), name: `${k.label} de ${deal === "vanzare" ? "vânzare" : "închiriat"}, ${where}`, category: k.category, type: k.type };
}
