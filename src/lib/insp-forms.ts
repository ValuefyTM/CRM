// Inspection sheets, one form per property type. Shared by the inspections app (client) and the API, which maps the
// answers onto property_features columns. No server code here.

export const FORM_VERSION = 1;

export type SheetType = "apartament" | "casa" | "teren" | "comercial";

export const SHEET_TYPES: [SheetType, string][] = [
  ["apartament", "Apartament"],
  ["casa", "Casă"],
  ["teren", "Teren"],
  ["comercial", "Spațiu comercial / Hală"],
];
export const sheetTypeLabel = (t: string | null | undefined) => SHEET_TYPES.find(([k]) => k === t)?.[1] ?? "Proprietate";

/** Utility connections: connected yes/no; connected → meter fitted yes/no; not connected → distance to the network (ml). */
export type Utility = "water" | "sewer" | "gas" | "power";

export type Field =
  | { k: string; label: string; kind: "one" | "many"; opts: string[] }
  | { k: string; label: string; kind: "num" | "int"; unit?: string; placeholder?: string }
  | { k: string; label: string; kind: "text"; placeholder?: string; long?: boolean }
  | { k: Utility; label: string; kind: "util"; meterLabel?: string };

export type Section = { id: string; title: string; fields: Field[] };

/** Answers as kept on the phone: choice → label, many → labels, num → text as typed, util → object. */
export type UtilAnswer = { on?: "da" | "nu"; meter?: "da" | "nu"; dist?: string };
export type Answers = Record<string, string | string[] | UtilAnswer | undefined>;

const STARE = ["Foarte bună", "Bună", "Satisfăcătoare", "Deteriorată"];
const FINISAJ = ["Superioare", "Medii-superioare", "Medii", "Medii-inferioare", "Inferioare"];
const DA_NU = ["Da", "Nu"];
const VECINATATI = ["Deosebit de favorabile", "Civilizate", "Aspect dezolant"];

const util = (k: Utility, label: string, meterLabel?: string): Field => ({ k, label, kind: "util", meterLabel });
const UTILS = (power = "Curent electric", powerMeter = "Contor electric montat"): Field[] => [
  util("water", "Apă", "Apometru montat"),
  util("sewer", "Canalizare"),
  util("gas", "Gaz", "Contor gaz montat"),
  util("power", power, powerMeter),
];

export const FORMS: Record<SheetType, Section[]> = {
  apartament: [
    { id: "cladire", title: "Clădirea", fields: [
      { k: "year_built", label: "An construcție bloc", kind: "int", placeholder: "ex. 1978" },
      { k: "structure", label: "Structură", kind: "one", opts: ["Panouri mari prefabricate", "Cadre beton armat", "Zidărie portantă", "Metalică"] },
      { k: "height_regime", label: "Regim de înălțime", kind: "text", placeholder: "ex. P+10" },
      { k: "floor", label: "Etaj", kind: "text", placeholder: "ex. 3" },
      { k: "elevator", label: "Lift", kind: "one", opts: DA_NU },
      { k: "thermal_insulation", label: "Bloc anvelopat termic", kind: "one", opts: ["Da", "Parțial", "Nu"] },
      { k: "building_condition", label: "Starea clădirii", kind: "one", opts: STARE },
    ] },
    { id: "apartament", title: "Apartamentul", fields: [
      { k: "rooms", label: "Număr camere", kind: "int" },
      { k: "usable_area", label: "Suprafață utilă măsurată", kind: "num", unit: "m²" },
      { k: "bathrooms", label: "Băi", kind: "int" },
      { k: "layout", label: "Compartimentare", kind: "one", opts: ["Decomandat", "Semidecomandat", "Nedecomandat", "Circular"] },
      { k: "balconies", label: "Balcon / logie", kind: "one", opts: ["Nu", "1", "2", "3+", "Închis"] },
      { k: "orientation", label: "Orientare", kind: "many", opts: ["N", "S", "E", "V"] },
    ] },
    { id: "finisaje", title: "Finisaje", fields: [
      { k: "finish_level", label: "Nivelul finisajelor", kind: "one", opts: FINISAJ },
      { k: "floors_rooms", label: "Pardoseli camere", kind: "many", opts: ["Parchet", "Laminat", "Gresie", "Mozaic", "Dușumea lemn"] },
      { k: "floors_wet", label: "Pardoseli zone umede", kind: "many", opts: ["Gresie", "Mozaic", "Ciment"] },
      { k: "wall_finish", label: "Pereți", kind: "many", opts: ["Vopsea lavabilă", "Tapet", "Faianță", "Tencuieli simple"] },
      { k: "windows", label: "Tâmplărie exterioară", kind: "one", opts: ["PVC cu termopan", "Aluminiu cu termopan", "Lemn stratificat", "Lemn simplu"] },
      { k: "last_renovation", label: "Anul ultimei renovări", kind: "int" },
    ] },
    { id: "instalatii", title: "Instalații și branșamente", fields: [
      { k: "heating", label: "Încălzire", kind: "one", opts: ["Centrală proprie pe gaz", "Termoficare", "Centrală de bloc", "Sobe", "Electric", "Pompă de căldură"] },
      ...UTILS(),
      { k: "installations_condition", label: "Starea instalațiilor", kind: "one", opts: STARE },
      { k: "air_conditioning", label: "Climatizare", kind: "one", opts: DA_NU },
    ] },
    { id: "zona", title: "Zona și observații", fields: [
      { k: "neighbourhood", label: "Vecinătăți", kind: "one", opts: VECINATATI },
      { k: "public_transport", label: "Transport public în zonă", kind: "many", opts: ["Autobuz", "Troleibuz", "Tramvai", "Metrou", "Maxi-taxi"] },
      { k: "parking", label: "Parcare", kind: "one", opts: ["Loc propriu", "Stradă", "Garaj", "Lipsă"] },
      { k: "notes", label: "Observații", kind: "text", long: true },
    ] },
  ],
  casa: [
    { id: "teren", title: "Terenul", fields: [
      { k: "land_area", label: "Suprafață teren", kind: "num", unit: "m²" },
      { k: "frontage_m", label: "Front stradal", kind: "num", unit: "m" },
      { k: "shape", label: "Formă", kind: "one", opts: ["Regulată", "Neregulată"] },
      { k: "fencing", label: "Împrejmuire", kind: "many", opts: ["Gard beton", "Gard metalic", "Gard lemn", "Plasă", "Lipsă"] },
      { k: "access_road", label: "Drum de acces", kind: "one", opts: ["Asfalt", "Pavat", "Pietruit", "De pământ"] },
    ] },
    { id: "constructie", title: "Construcția principală", fields: [
      { k: "height_regime", label: "Regim de înălțime", kind: "text", placeholder: "ex. P+1" },
      { k: "year_built", label: "An construcție", kind: "int" },
      { k: "rooms", label: "Număr camere", kind: "int" },
      { k: "usable_area", label: "Suprafață utilă măsurată", kind: "num", unit: "m²" },
      { k: "built_area", label: "Suprafață construită la sol", kind: "num", unit: "m²" },
      { k: "foundation", label: "Fundație", kind: "one", opts: ["Fundații continue de beton", "Radier general", "Fundații izolate", "Fără fundație"] },
      { k: "structure", label: "Structură", kind: "one", opts: ["Zidărie portantă cu centuri", "Cadre beton armat", "Lemn", "Metalică", "Chirpici / paiantă"] },
      { k: "walls", label: "Închideri", kind: "one", opts: ["Cărămidă", "BCA", "Cărămidă și BCA", "Bolțari", "Lemn"] },
      { k: "roof", label: "Acoperiș", kind: "one", opts: ["Șarpantă de lemn", "Șarpantă metalică", "Terasă"] },
      { k: "roof_cover", label: "Învelitoare", kind: "one", opts: ["Țiglă", "Tablă", "Bitum", "Azbociment"] },
      { k: "building_condition", label: "Starea construcției", kind: "one", opts: STARE },
    ] },
    { id: "finisaje", title: "Finisaje", fields: [
      { k: "finish_level", label: "Nivelul finisajelor", kind: "one", opts: FINISAJ },
      { k: "exterior_finish", label: "Finisaj exterior", kind: "one", opts: ["Termosistem", "Tencuială decorativă", "Placaj", "Tencuială simplă", "Neterminat"] },
      { k: "floors_rooms", label: "Pardoseli", kind: "many", opts: ["Parchet", "Gresie", "Laminat", "Marmură", "Dușumea lemn"] },
      { k: "windows", label: "Tâmplărie exterioară", kind: "one", opts: ["PVC cu termopan", "Aluminiu cu termopan", "Lemn stratificat", "Lemn simplu"] },
    ] },
    { id: "instalatii", title: "Instalații și branșamente", fields: [
      { k: "heating", label: "Încălzire", kind: "one", opts: ["Centrală pe gaz", "Pompă de căldură", "Combustibil solid", "Sobe", "Electric"] },
      ...UTILS(),
      { k: "own_sources", label: "Surse proprii", kind: "many", opts: ["Puț", "Fosă septică", "Panouri fotovoltaice", "Nu există"] },
      { k: "installations_condition", label: "Starea instalațiilor", kind: "one", opts: STARE },
    ] },
    { id: "anexe", title: "Anexe și zona", fields: [
      { k: "annexes", label: "Anexe pe teren", kind: "many", opts: ["Garaj", "Magazie", "Foișor", "Piscină", "Nu există"] },
      { k: "neighbourhood", label: "Vecinătăți", kind: "one", opts: VECINATATI },
      { k: "notes", label: "Observații", kind: "text", long: true },
    ] },
  ],
  teren: [
    { id: "incadrare", title: "Încadrare", fields: [
      { k: "land_area", label: "Suprafață măsurată", kind: "num", unit: "m²" },
      { k: "urban_zone", label: "Încadrare", kind: "one", opts: ["Intravilan", "Extravilan"] },
      { k: "land_use", label: "Categorie de folosință", kind: "one", opts: ["Curți-construcții", "Arabil", "Pășune", "Livadă", "Vie", "Pădure"] },
      { k: "urban_docs", label: "Documente de urbanism", kind: "many", opts: ["PUG", "PUZ aprobat", "Certificat de urbanism", "Nu se cunosc"] },
    ] },
    { id: "configuratie", title: "Configurație", fields: [
      { k: "shape", label: "Formă", kind: "one", opts: ["Regulată", "Neregulată"] },
      { k: "frontage_m", label: "Front stradal", kind: "num", unit: "m" },
      { k: "depth_m", label: "Adâncime", kind: "num", unit: "m" },
      { k: "slope", label: "Planeitate", kind: "one", opts: ["Plan", "Ușor înclinat", "Înclinat"] },
      { k: "fencing", label: "Împrejmuire", kind: "many", opts: ["Gard", "Parțială", "Lipsă"] },
    ] },
    { id: "acces", title: "Acces și branșamente", fields: [
      { k: "access_road", label: "Drum de acces", kind: "one", opts: ["Asfalt", "Pietruit", "De pământ", "Fără acces direct"] },
      ...UTILS("Curent electric", "Contor electric montat (firidă)"),
    ] },
    { id: "zona", title: "Construcții și zonă", fields: [
      { k: "land_constructions", label: "Construcții pe teren", kind: "one", opts: ["Nu există", "Provizorii", "De demolat", "În construcție"] },
      { k: "surroundings", label: "Vecinătăți", kind: "many", opts: ["Rezidențial", "Agricol", "Industrial", "Comercial"] },
      { k: "notes", label: "Observații", kind: "text", long: true },
    ] },
  ],
  comercial: [
    { id: "spatiu", title: "Spațiul", fields: [
      { k: "use_type", label: "Destinație", kind: "one", opts: ["Comercial stradal", "Birouri", "Hală de producție", "Depozit / logistică", "Turism / cazare"] },
      { k: "built_area", label: "Suprafață construită", kind: "num", unit: "m²" },
      { k: "usable_area", label: "Suprafață utilă", kind: "num", unit: "m²" },
      { k: "clear_height_m", label: "Înălțime liberă", kind: "num", unit: "m" },
      { k: "height_regime", label: "Regim de înălțime", kind: "text", placeholder: "ex. P sau P+2" },
      { k: "year_built", label: "An construcție", kind: "int" },
      { k: "occupancy", label: "Utilizare curentă", kind: "one", opts: ["Ocupat de proprietar", "Închiriat", "Liber"] },
    ] },
    { id: "constructie", title: "Construcția", fields: [
      { k: "structure", label: "Structură", kind: "one", opts: ["Metalică", "Beton armat prefabricat", "Cadre beton armat", "Zidărie"] },
      { k: "walls", label: "Închideri", kind: "one", opts: ["Panouri sandwich", "Zidărie", "Tablă cutată", "Pereți cortină"] },
      { k: "roof", label: "Acoperiș", kind: "one", opts: ["Panouri sandwich", "Tablă", "Terasă"] },
      { k: "floor_type", label: "Pardoseală", kind: "one", opts: ["Beton elicopterizat", "Rășină epoxidică", "Gresie", "Mochetă / PVC"] },
      { k: "logistics", label: "Uși, rampe, echipamente", kind: "many", opts: ["Uși secționale", "Rampe de încărcare", "Acces TIR", "Pod rulant"] },
      { k: "building_condition", label: "Starea construcției", kind: "one", opts: STARE },
    ] },
    { id: "instalatii", title: "Instalații și branșamente", fields: [
      { k: "heating", label: "Încălzire", kind: "one", opts: ["Aeroterme pe gaz", "Centrală termică", "Pompă de căldură", "Termoficare", "Fără"] },
      ...UTILS("Curent electric (trifazic)"),
      { k: "power_kw", label: "Putere electrică", kind: "num", unit: "kW" },
      { k: "fire_safety", label: "Siguranță la incendiu", kind: "many", opts: ["Hidranți", "Sprinklere", "Detecție incendiu", "Avizat ISU"] },
    ] },
    { id: "birouri", title: "Birouri și anexe", fields: [
      { k: "offices_area", label: "Birouri incluse", kind: "num", unit: "m²" },
      { k: "offices_finish", label: "Finisaje birouri", kind: "one", opts: ["Superioare", "Medii", "Inferioare", "Nu există"] },
      { k: "sanitary", label: "Grupuri sanitare / vestiare", kind: "one", opts: DA_NU },
    ] },
    { id: "amplasament", title: "Amplasament", fields: [
      { k: "road_access", label: "Acces rutier", kind: "one", opts: ["Drum național", "Drum județean", "Stradă", "Drum de exploatare"] },
      { k: "yard_area", label: "Curte / parcare", kind: "num", unit: "m²" },
      { k: "visibility", label: "Vizibilitate de la drum", kind: "one", opts: ["Ridicată", "Medie", "Redusă"] },
      { k: "notes", label: "Observații", kind: "text", long: true },
    ] },
  ],
};

/** Photo categories offered for every sheet; the ones marked required are needed before the sheet is sent. */
export const PHOTO_CATEGORIES: { k: string; label: string; types?: SheetType[]; required?: boolean }[] = [
  { k: "exterior", label: "Exterior / fațadă", required: true },
  { k: "interior", label: "Interior", types: ["apartament", "casa", "comercial"] },
  { k: "kitchen", label: "Bucătărie", types: ["apartament", "casa"] },
  { k: "bathroom", label: "Baie", types: ["apartament", "casa"] },
  { k: "installations", label: "Instalații" },
  { k: "meters", label: "Contoare / branșamente" },
  { k: "defects", label: "Degradări" },
  { k: "surroundings", label: "Vecinătăți / acces" },
  { k: "documents", label: "Documente" },
  { k: "other", label: "Altele" },
];
export const photoCategories = (t: SheetType) => PHOTO_CATEGORIES.filter((c) => !c.types || c.types.includes(t));

export const PRESENT_ROLES: [string, string][] = [
  ["owner", "Proprietar"],
  ["client", "Client"],
  ["tenant", "Chiriaș"],
  ["agent", "Agent imobiliar"],
  ["other", "Altă persoană"],
];

/** Guesses the form from the CRM property category / type (Glide vocabulary) or the order property type. */
export function guessSheetType(category: string | null, type: string | null, orderType?: string | null): SheetType {
  const c = (category ?? "").toUpperCase(), t = (type ?? "").toUpperCase();
  if (orderType === "apartment") return "apartament";
  if (orderType === "house") return "casa";
  if (orderType === "land") return "teren";
  if (orderType === "commercial" || orderType === "industrial") return "comercial";
  if (c === "TEREN" || c === "PROPRIETATE AGRICOLA" || t.startsWith("TEREN")) return "teren";
  if (c === "COMERCIAL" || c === "INDUSTRIAL" || c === "MIXT") return "comercial";
  if (t.includes("CASA") && !t.includes("APARTAMENT")) return "casa";
  return "apartament";
}

// ---------- answers ----------

export const allFields = (t: SheetType) => FORMS[t].flatMap((s) => s.fields);

/** A field counts as filled when it has an answer; a utility needs the meter (connected) or the distance (not connected). */
export function isFilled(f: Field, a: Answers[string]): boolean {
  if (f.kind === "util") {
    const u = (a ?? {}) as UtilAnswer;
    if (u.on === "da") return f.k === "sewer" || !!u.meter;
    if (u.on === "nu") return !!u.dist?.toString().trim();
    return false;
  }
  if (Array.isArray(a)) return a.length > 0;
  return typeof a === "string" && a.trim() !== "";
}

export function progress(t: SheetType, answers: Answers) {
  const fields = allFields(t).filter((f) => f.k !== "notes");
  const done = fields.filter((f) => isFilled(f, answers[f.k])).length;
  return { done, total: fields.length };
}

const toNum = (v: unknown) => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const n = Number(String(v).replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Maps the answers onto property_features columns. Only fields of the chosen form are kept; values are checked. */
export function featureColumns(t: SheetType, answers: Answers): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  for (const f of allFields(t)) {
    const a = answers[f.k];
    if (f.kind === "util") {
      const u = (a && typeof a === "object" && !Array.isArray(a) ? a : {}) as UtilAnswer;
      const on = u.on === "da" ? 1 : u.on === "nu" ? 0 : null;
      out[`${f.k}_connected`] = on;
      if (f.k !== "sewer") out[`${f.k}_meter`] = on === 1 ? (u.meter === "da" ? 1 : u.meter === "nu" ? 0 : null) : null;
      out[`${f.k}_distance_m`] = on === 0 ? toNum(u.dist) : null;
    } else if (f.kind === "one") {
      out[f.k] = typeof a === "string" && f.opts.includes(a) ? a : null;
    } else if (f.kind === "many") {
      const list = Array.isArray(a) ? f.opts.filter((o) => a.includes(o)) : [];
      out[f.k] = list.length ? list.join(", ") : null;
    } else if (f.kind === "num") {
      const n = toNum(a);
      out[f.k] = n !== null && n >= 0 && n < 1e7 ? n : null;
    } else if (f.kind === "int") {
      const n = toNum(a);
      out[f.k] = n !== null && n >= 0 && n < 1e5 ? Math.round(n) : null;
    } else if (f.kind === "text") {
      out[f.k] = typeof a === "string" && a.trim() ? a.trim().slice(0, f.long ? 4000 : 200) : null;
    }
  }
  return out;
}

/** Every property_features column the forms can write (for the INSERT). */
export const FEATURE_COLUMNS = Array.from(
  new Set(SHEET_TYPES.flatMap(([t]) => Object.keys(featureColumns(t, {})))),
);
