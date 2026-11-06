// The site analysis of an asset (tab „Amplasament”): the shapes of the data, shared by the server and the page. No server code.

export type LL = [number, number];
/** The parcel: its contour (GPS), the coordinates inventory (Stereo 70: x = north, y = east), the buildings, the neighbours. */
export type Parcel = {
  source: "ancpi" | "doc";
  nr: string | null; uat: string | null; county: string | null; plan_date: string | null; doc_name: string | null;
  area_plan: number | null; area_calc: number; area_acte: number | null; perimeter: number;
  centre: LL; ring: LL[];
  pts: { pct: string; x: number; y: number; side: number | null }[];
  buildings: { name: string; area: number; ring: LL[] }[];
  neighbours: { nr: string; area: number | null; ring: LL[] }[];
  notes: string[];
  extra: Record<string, unknown> | null;
  geo: Geometry | null;
};
export type Geometry = {
  shape: string; regularity: number; vertices: number;
  frontage: { length: number; street: string | null; sides: number[] } | null;
  depth: number | null; width: number | null; orientation: string | null;
  sc: number; pot: number | null;
};
export type Poi = { cat: string; name: string; lat: number; lng: number; d: number };
export type Zone = {
  at: LL; date: string;
  pois: Poi[]; cats: { key: string; label: string }[];
  roads: { name: string; ref: string; kind: string; highway: string; surface: string; lanes: string; d: number; geom: LL[] }[];
  main: { label: string; d: number }[];
  neg: { key: string; label: string; d: number }[];
  locality: { name: string; d: number; lat: number; lng: number } | null;
  city: { name: string; d: number; lat: number; lng: number } | null;
};
export type Site = {
  source: "ancpi" | "doc" | "zone" | null; doc_ref: string | null;
  parcel: Parcel | null; zone: Zone | null;
  text: string | null; style: Style | null; unverified: string[];
  situated: "intravilan" | "extravilan" | null; in_annex: boolean; figures: string[]; sent_at: string | null;
  made_by: string | null; made_at: string | null; updated_at: string | null;
};
export type Style = "scurt" | "detaliat" | "academic";
export const STYLES: [Style, string][] = [["scurt", "Scurt"], ["detaliat", "Detaliat"], ["academic", "Academic"]];

export const fmt = (n: number | null | undefined, d = 0) => (n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("ro-RO", { minimumFractionDigits: d, maximumFractionDigits: d }));
export const dist = (m: number) => (m >= 1000 ? `${fmt(m / 1000, 1)} km` : `${fmt(Math.round(m / 10) * 10)} m`);

/** The nearest amenity of each category, in order (for the list and the numbered pins). */
export function nearest(z: Zone, max = 10) {
  const seen = new Set<string>(), out: (Poi & { label: string })[] = [];
  for (const p of [...z.pois].sort((a, b) => a.d - b.d)) {
    if (seen.has(p.cat) || p.d > 1500) continue;
    seen.add(p.cat);
    out.push({ ...p, label: z.cats.find((c) => c.key === p.cat)?.label ?? p.cat });
  }
  return out.slice(0, max);
}

/** The data the text is written from (and checked against): only what the analysis found. */
export function factsOf(s: Pick<Site, "parcel" | "zone" | "situated">, asset: { address: string | null; city: string | null; county: string | null; type: string | null }) {
  const p = s.parcel, g = p?.geo, z = s.zone;
  const street = z?.roads.find((r) => r.name && r.d <= 40);
  return {
    bun: { tip: asset.type, adresa: asset.address, localitate: asset.city, judet: asset.county, situare: s.situated ?? null },
    parcela: p ? {
      nr_cadastral: p.nr, suprafata_din_plan_mp: p.area_plan ?? Math.round(p.area_calc), suprafata_din_acte_mp: p.area_acte, perimetru_m: round(p.perimeter, 1),
      forma: g?.shape ?? null, regularitate_procent: g ? Math.round(g.regularity * 100) : null,
      deschidere_la_strada_m: g?.frontage ? round(g.frontage.length, 1) : null, strada_la_front: g?.frontage?.street ?? null,
      adancime_m: g?.depth != null ? round(g.depth, 1) : null, frontul_orientat_spre: g?.orientation ?? null,
      constructii: p.buildings.map((b) => ({ denumire: b.name, suprafata_la_sol_mp: round(b.area, 0) })), suprafata_construita_la_sol_mp: g ? round(g.sc, 0) : null, pot_procent: g?.pot != null ? round(g.pot, 1) : null,
      vecini_inscrisi: p.neighbours.map((n) => n.nr), sursa_conturului: p.source === "ancpi" ? `planul cadastral ANCPI${p.plan_date ? ` (${p.plan_date})` : ""}` : `documentul ${p.doc_name ?? ""}`.trim(),
    } : null,
    zona: z ? {
      localitatea: z.locality?.name ?? null, cel_mai_apropiat_oras: z.city && !inCity(z) ? { nume: z.city.name, distanta_m: z.city.d } : null,
      strada: street ? { nume: street.name, tip: street.kind, imbracaminte: surfaceRo(street.surface) || null, benzi: street.lanes || null } : null,
      drumuri_principale: z.main.map((m) => ({ drum: m.label, distanta_m: m.d })),
      dotari_cele_mai_apropiate: nearest(z, 12).map((x) => ({ dotare: x.label, nume: x.name || null, distanta_m: x.d })),
      factori_negativi: z.neg.map((n) => ({ factor: n.label, distanta_m: n.d })),
      nota: "Distanțele sunt în linie dreaptă, din OpenStreetMap.",
    } : null,
  };
}
const SURFACE: Record<string, string> = {
  asphalt: "asfalt", paved: "pavată", concrete: "beton", paving_stones: "pavele", sett: "piatră cubică", cobblestone: "piatră cubică", gravel: "pietriș",
  fine_gravel: "pietriș", compacted: "piatră compactată", unpaved: "nepavată", dirt: "pământ", ground: "pământ", grass: "iarbă", sand: "nisip",
};
/** The OSM surface of a road, in Romanian. */
export const surfaceRo = (s: string | null | undefined) => (s ? SURFACE[s] ?? s.replace(/_/g, " ") : "");

/** The point is in the city itself (its centre a few km away): no "distance to the city" then. */
export const inCity = (z: Zone) => !!z.city && z.locality?.name === z.city.name && z.city.d < 4000;
const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
