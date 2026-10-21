// Vocabulary of the valued assets, as in the Glide data (categories and types in capitals). No server code: also used in forms.

export const ASSET_CATEGORIES: [code: string, label: string, types: string[]][] = [
  ["REZIDENTIAL", "Rezidențial", ["APARTAMENT IN BLOC", "APARTAMENT IN CASA", "CASA CU TEREN", "LOC DE PARCARE ( SUBTERAN )", "LOC DE PARCARE ( SUPRATERAN )", "ANSAMBLU REZIDENTIAL", "CURTE", "ACCESORIU"]],
  ["COMERCIAL", "Comercial", ["SPATIU COMERCIAL - PARTE DINTR-O CLADIRE", "SPATIU COMERCIAL - CLADIRE INDEPENDENTA", "SPATIU DE BIROURI - PARTE DINTR-O CLADIRE", "SPATIU DE BIROURI - CLADIRE INDEPENDENTA", "UNITATE CAZARE", "SPATIU DE AGREMENT", "BLOC APARTAMENTE CU SPATIU COMERCIAL (RETAIL)"]],
  ["INDUSTRIAL", "Industrial", ["SPATIU DE PRODUCTIE", "SPATIU DE DEPOZITARE SI LOGISTICA"]],
  ["TEREN", "Teren", ["TEREN INTRAVILAN CONSTRUCTII", "TEREN INTRAVILAN ARABIL", "TEREN EXTRAVILAN", "TEREN CU DESTINATIE AGRICOLA"]],
  ["PROPRIETATE AGRICOLA", "Proprietate agricolă", ["FERMA AGRICOLA", "FERMA AGRICOLA DE CULTURA", "SERE LEGUMICOLE/FLORICOLE", "CRAME/CENTRE DE VINIFICATIE"]],
  ["MIXT", "Mixt", []],
  ["BUN MOBIL", "Bun mobil", ["AUTOTURISM", "AUTOUTILITARA", "UTILAJ", "MOTOSCUTER"]],
];

export const APPROACHES: [string, string][] = [["", "—"], ["market", "Piață"], ["income", "Venit"], ["cost", "Cost"]];

/** "APARTAMENT IN BLOC" → "Apartament in bloc". */
export const capType = (s: string | null | undefined) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : "");

export type AssetInput = {
  property_id?: string | null;
  category: string | null; type: string; construction: string | null; county: string | null; city: string | null; full_address: string | null;
  cf_number: string | null; cad_building: string | null; cad_land: string | null; usable_area: number | null; year_built: number | null; description: string | null;
  land_area: number | null; rooms: number | null; floor: string | null; height_regime: string | null;
  vehicle_make: string | null; vehicle_model: string | null; reg_number: string | null; vin: string | null; mileage: number | null;
  is_main: boolean; value: number | null; approach: string | null; notes: string | null;
  contact_kind: string | null; contact_name: string | null; contact_phone: string | null;
  /** the point found while filling in the form ("lat, lng"): from the cadastral plans, else the address */
  geo?: string | null; geo_source?: "cadastru" | "adresa" | "localitate" | null; geo_note?: string | null;
};

/** Values of the asset form (strings, as typed). */
export type AssetForm = {
  // uid: the asset's key in a form not saved yet (its documents wait under it).
  id?: string; uid?: string; category: string; type: string; construction: string; county: string; city: string; full_address: string; cf_number: string;
  cad_building: string; cad_land: string; usable_area: string; year_built: string; description: string; is_main: boolean; value: string; approach: string; notes: string;
  contact_kind: string; contact_name: string; contact_phone: string;
  land_area: string; rooms: string; floor: string; height_regime: string; vehicle_make: string; vehicle_model: string; reg_number: string; vin: string; mileage: string;
  /** the point found on the small map ("lat, lng"), its source and note: saved with the asset */
  geo?: string; geo_source?: string; geo_note?: string;
};
export const emptyAsset = (near?: { county?: string | null; city?: string | null }): AssetForm => ({
  category: "REZIDENTIAL", type: "", construction: "existing", county: near?.county ?? "", city: near?.city ?? "", full_address: "", cf_number: "", cad_building: "", cad_land: "",
  usable_area: "", year_built: "", description: "", is_main: false, value: "", approach: "", notes: "",
  contact_kind: "client", contact_name: "", contact_phone: "",
  land_area: "", rooms: "", floor: "", height_regime: "", vehicle_make: "", vehicle_model: "", reg_number: "", vin: "", mileage: "",
});

/** The fields of an asset that depend on its type (the others are not asked and not kept). */
export type ProfileField = "usable_area" | "land_area" | "rooms" | "floor" | "height_regime" | "year_built" | "construction" | "cf_number" | "cad_building" | "cad_land"
  | "vehicle_make" | "vehicle_model" | "reg_number" | "vin" | "mileage";
export type AssetProfile = { key: string; fields: ProfileField[]; labels: Partial<Record<ProfileField, string>>; address: boolean };

const BUILDING: ProfileField[] = ["construction", "usable_area", "land_area", "height_regime", "year_built", "cf_number", "cad_building", "cad_land"];
/** What to ask for an asset: an apartment has rooms and floor but no land; land has only its area; a car has make, model, plate. */
export function assetProfile(category: string | null | undefined, type: string | null | undefined): AssetProfile {
  const t = (type ?? "").toUpperCase(), c = (category ?? "").toUpperCase();
  if (c === "BUN MOBIL" || /AUTOTURISM|AUTOUTILITARA|UTILAJ|MOTOSCUTER/.test(t))
    return { key: "vehicle", fields: ["vehicle_make", "vehicle_model", "year_built", "reg_number", "vin", "mileage"], labels: { year_built: "An fabricație" }, address: false };
  if (c === "TEREN" || t.startsWith("TEREN") || t === "CURTE")
    return { key: "land", fields: ["land_area", "cf_number", "cad_land"], labels: { land_area: "Suprafață teren (mp)" }, address: true };
  if (t.startsWith("APARTAMENT"))
    return { key: "apartment", fields: ["construction", "usable_area", "rooms", "floor", "year_built", "cf_number", "cad_building"], labels: {}, address: true };
  if (t.startsWith("LOC DE PARCARE") || t === "ACCESORIU")
    return { key: "parking", fields: ["construction", "usable_area", "floor", "cf_number", "cad_building"], labels: {}, address: true };
  if (t === "CASA CU TEREN")
    return { key: "house", fields: ["construction", "usable_area", "land_area", "rooms", "height_regime", "year_built", "cf_number", "cad_building", "cad_land"], labels: {}, address: true };
  if (t.includes("PARTE DINTR-O CLADIRE"))
    return { key: "unit", fields: ["construction", "usable_area", "floor", "year_built", "cf_number", "cad_building"], labels: {}, address: true };
  if (c === "PROPRIETATE AGRICOLA")
    return { key: "farm", fields: ["land_area", "usable_area", "year_built", "cf_number", "cad_building", "cad_land"], labels: { usable_area: "Suprafață construită (mp)" }, address: true };
  return { key: "building", fields: BUILDING, labels: {}, address: true };
}

/**
 * What an order must say about each asset (Lucrare nouă, procesare, contract direct): its type, where it is and, by kind,
 * its area, CF and cadastral number. Each group is satisfied by any of its fields (a house: the construction's or the
 * land's cadastral number).
 */
export function assetRequired(category: string | null | undefined, type: string | null | undefined): ProfileField[][] {
  const p = assetProfile(category, type);
  if (p.key === "vehicle") return [["vehicle_make"], ["vehicle_model"], ["year_built"]];
  const area: ProfileField[][] = p.key === "land" ? [["land_area"]] : p.key === "house" ? [["usable_area"], ["land_area"]] : [["usable_area", "land_area"]];
  const cad: ProfileField[] = (["cad_building", "cad_land"] as ProfileField[]).filter((k) => p.fields.includes(k));
  return [...area, ["cf_number"], ...(cad.length ? [cad] : [])];
}

/** The required things an asset still lacks, by their labels (empty: complete). */
export function assetMissing(a: AssetForm): string[] {
  const p = assetProfile(a.category, a.type);
  const m: string[] = [];
  if (!a.type.trim()) return ["tipul (subtipul) bunului"];
  if (p.address) {
    if (!a.full_address.trim()) m.push("adresa");
    if (!a.county.trim()) m.push("județul");
    if (!a.city.trim()) m.push("localitatea");
  }
  for (const g of assetRequired(a.category, a.type))
    if (!g.some((k) => String(a[k] ?? "").trim())) m.push(g.map((k) => (p.labels[k] ?? FIELD_LABELS[k]).replace(/ \(mp\)$/, "").replace(/^Suprafață/, "suprafața").replace(/^An /, "anul ").replace(/^Marcă/, "marca").replace(/^Model/, "modelul")).join(" sau "));
  return m;
}

export const FIELD_LABELS: Record<ProfileField, string> = {
  usable_area: "Suprafață utilă (mp)", land_area: "Suprafață teren (mp)", rooms: "Nr. camere", floor: "Etaj", height_regime: "Regim de înălțime",
  year_built: "An construcție", construction: "Stadiu", cf_number: "Nr. CF", cad_building: "Nr. cad. construcție", cad_land: "Nr. cad. teren",
  vehicle_make: "Marcă", vehicle_model: "Model", reg_number: "Nr. înmatriculare", vin: "Serie șasiu (VIN)", mileage: "Kilometraj",
};
export const FIELD_HINTS: Partial<Record<ProfileField, string>> = { floor: "ex. 2 / P / D", height_regime: "ex. P+1E+M", reg_number: "ex. TM 12 ABC", rooms: "ex. 3" };

/** Drops the values of the fields an asset of this type does not have (a land area left on an apartment…). */
export function trimToProfile<T extends Record<string, unknown>>(a: T & { category?: string | null; type?: string | null }, empty: unknown): T {
  const keep = new Set<string>(assetProfile(a.category, a.type).fields);
  const out: Record<string, unknown> = { ...a };
  for (const f of Object.keys(FIELD_LABELS)) if (f !== "construction" && !keep.has(f)) out[f] = empty;
  return out as T;
}

/** Who shows the asset at the inspection. */
export const CONTACT_KINDS: [string, string][] = [["client", "Clientul"], ["owner", "Proprietarul"], ["agent", "Agent imobiliar"], ["other", "Altă persoană"]];

