// Inspection sheets, one form per property type. Shared by the inspections app (client) and the API, which maps the
// answers onto property_features columns. No server code here.

/** 2: amplasament first, findings section and the fields the BCR / BRD reports ask for (October 2026). */
export const FORM_VERSION = 2;

export type SheetType = "apartament" | "casa" | "teren" | "comercial" | "accesoriu";

export const SHEET_TYPES: [SheetType, string][] = [
  ["apartament", "Apartament"],
  ["casa", "Casă"],
  ["teren", "Teren"],
  ["comercial", "Spațiu comercial / Hală"],
  ["accesoriu", "Accesoriu (parcare, garaj, boxă)"],
];
export const sheetTypeLabel = (t: string | null | undefined) => SHEET_TYPES.find(([k]) => k === t)?.[1] ?? "Proprietate";

/** Utility connections: connected yes/no; connected → meter fitted yes/no; not connected → distance to the network (ml). */
export type Utility = "water" | "sewer" | "gas" | "power";

/**
 * Set in the CRM sheet templates (Setări → Fișe de inspecție): required before sending, a free "Altele" text next to
 * the options, left out of the PDF sheet, options ticked when the sheet starts, a question added by the firm.
 */
export type FieldMeta = { req?: boolean; other?: boolean; pdf?: boolean; defaults?: string[]; custom?: boolean; photo?: boolean };

/**
 * A follow-up of a composite question, asked only after a given answer (like the utilities: „Branșat” → „Apometru montat”).
 * Its answer is kept at answers["<question>.<follow-up>"].
 */
export type SubKind = "one" | "many" | "text" | "num";
export type SubField = { k: string; label: string; kind: SubKind; opts?: string[]; unit?: string };
export const subKey = (k: string, s: string) => `${k}.${s}`;

export type Field = (
  | { k: string; label: string; kind: "one" | "many"; opts: string[] }
  | { k: string; label: string; kind: "num" | "int"; unit?: string; placeholder?: string }
  | { k: string; label: string; kind: "text"; placeholder?: string; long?: boolean }
  | { k: Utility; label: string; kind: "util"; meterLabel?: string }
  | { k: string; label: string; kind: "photo" }
  | { k: string; label: string; kind: "comp"; opts: string[]; sub: Record<string, SubField[]> }
) & FieldMeta;

/** Key of the free text next to the options of a question with "Altele". */
export const otherKey = (k: string) => `${k}.alt`;

export type Section = { id: string; title: string; fields: Field[] };

/** Answers as kept on the phone: choice → label, many → labels, num → text as typed, util → object. */
export type UtilAnswer = { on?: "da" | "nu"; meter?: "da" | "nu"; dist?: string };
/** One room of the floor survey (releveu): listed from the survey (by AI or by hand), then described at the visit. */
export type Room = {
  id: string; pos: string; name: string; level: string; area: string;
  floor?: string[]; walls?: string[]; ceiling?: string; condition?: string; notes?: string;
};
export type Answers = Record<string, string | string[] | UtilAnswer | Room[] | undefined>;

/** Answers key of the room list (apartment, house, commercial sheets). */
export const ROOMS_KEY = "incaperi";
export const hasRooms = (t: SheetType) => t === "apartament" || t === "casa" || t === "comercial";
export const ROOM_FIELDS = {
  floor: { label: "Pardoseală", opts: ["Parchet", "Laminat", "Gresie", "Mozaic", "Dușumea lemn", "Ciment", "Mochetă / PVC"] },
  walls: { label: "Pereți", opts: ["Vopsea lavabilă", "Faianță", "Tapet", "Tencuieli simple", "Lambriu", "Neterminat"] },
  ceiling: { label: "Plafon", opts: ["Vopsea lavabilă", "Gips-carton", "Tavan fals", "Lambriu", "Tencuială simplă"] },
} as const;
export const ROOM_LEVELS = ["Subsol", "Demisol", "Parter", "Etaj 1", "Etaj 2", "Etaj 3", "Mansardă", "Pod"];
/** "Dormitor · rlv 8": the room as written on its photos and in the inspection sheet. */
export const roomLabel = (r: Pick<Room, "name" | "pos">) => `${r.name || "Încăpere"}${r.pos ? ` · rlv ${r.pos}` : ""}`;
/** The room list of a sheet (empty when none). */
export const roomsOf = (a: Answers): Room[] => (Array.isArray(a[ROOMS_KEY]) ? (a[ROOMS_KEY] as unknown[]).filter((r): r is Room => !!r && typeof r === "object" && "name" in r) : []);

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

/**
 * Accessories (parking space, garage, storage box): inspected on the sheet of the main property at the same address
 * (one section per accessory, keys "acc.<inspection id>.<field>"), or on their own "accesoriu" sheet when alone.
 */
export const ACC_FIELDS: Field[] = [
  { k: "acc_kind", label: "Tip", kind: "one", opts: ["Loc de parcare subteran", "Loc de parcare suprateran", "Garaj", "Boxă / debara"] },
  { k: "acc_ident", label: "Număr / identificare", kind: "text", placeholder: "ex. loc 12, boxa 3" },
  { k: "acc_level", label: "Nivel", kind: "text", placeholder: "ex. -1, parter" },
  { k: "acc_area", label: "Suprafață măsurată", kind: "num", unit: "m²" },
  { k: "acc_cover", label: "Acoperire", kind: "one", opts: ["Închis", "Acoperit, deschis", "Descoperit"] },
  { k: "acc_access", label: "Acces", kind: "many", opts: ["Rampă auto", "Lift auto", "Lift", "Scări", "Direct din curte / stradă", "Telecomandă / barieră"] },
  { k: "acc_condition", label: "Stare", kind: "one", opts: ["Foarte bună", "Bună", "Satisfăcătoare", "Deteriorată"] },
  { k: "acc_notes", label: "Observații", kind: "text", long: true },
];
/** Key of an accessory field on the main property's sheet. */
export const accKey = (inspectionId: string, k: string) => `acc.${inspectionId}.${k}`;
/** The accessory fields with the keys they have on the main property's sheet. */
export const accFields = (inspectionId: string): Field[] => ACC_FIELDS.map((f) => ({ ...f, k: accKey(inspectionId, f.k) }) as Field);
/** Parking spaces, garages, storage boxes (CRM / Glide property types). */
export const isAccessoryType = (type: string | null | undefined) => /PARCARE|GARAJ|\bBOX|ACCESORIU/i.test(type ?? "");

// ---------- sections shared by the forms ----------

const FINISAJ_EXT = ["Termosistem", "Tencuială decorativă", "Placaj", "Tencuială simplă", "Neterminat"];
const USA_EXT = ["Metalică / antiefracție", "PVC", "Lemn", "Aluminiu"];
const USI_INT = ["MDF / celular", "Lemn masiv", "PVC", "Sticlă"];
const TAMPLARIE = ["PVC cu termopan", "Aluminiu cu termopan", "Lemn stratificat", "Lemn simplu"];

/** First section of every form: where the property is (banks ask for position, zone type, transport and flood risk). */
const amplasament = (extra: Field[] = [], neighbours: Field = { k: "neighbourhood", label: "Vecinătăți", kind: "one", opts: VECINATATI }): Section => ({
  id: "amplasament", title: "Amplasament și zonă", fields: [
    { k: "locality_position", label: "Poziția în localitate", kind: "one", opts: ["Central", "Semicentral", "Median", "Periferic", "Izolat / extravilan"] },
    { k: "zone_type", label: "Tipul zonei", kind: "one", opts: ["Rezidențial", "Mixt rezidențial-comercial", "Comercial", "Industrial", "Agricol"] },
    neighbours,
    ...extra,
    { k: "public_transport", label: "Transport public în zonă", kind: "many", opts: ["Autobuz", "Troleibuz", "Tramvai", "Metrou", "Maxi-taxi", "Tren", "Nu există"] },
    { k: "transport_distance_m", label: "Distanța până la stația de transport public", kind: "num", unit: "m" },
    { k: "flood_risk", label: "Risc de inundație vizibil", kind: "one", opts: ["Fără risc vizibil", "Aproape de râu / canal, cu dig", "Aproape de râu / canal, fără dig", "Urme de băltire / inundații"] },
    { k: "water_body_distance_m", label: "Distanța până la cel mai apropiat râu / canal", kind: "num", unit: "m" },
  ],
});

/** Installations shared by the residential forms (after heating and the utility connections). */
const RESIDENTIAL_EXTRA: Field[] = [
  { k: "telecom", label: "Telecomunicații", kind: "many", opts: ["Internet / cablu", "Telefon fix", "Nu există"] },
  { k: "renewables", label: "Surse regenerabile", kind: "many", opts: ["Panouri fotovoltaice", "Panouri solare apă caldă", "Pompă de căldură", "Nu există"] },
  { k: "thermal_renovation_year", label: "Anul renovării termice (dacă e cazul)", kind: "int" },
];

/** Last section of every form: what the inspector found compared with the documents. */
const constatari = (occupancy = true): Section => ({
  id: "constatari", title: "Constatări", fields: [
    { k: "inspection_scope", label: "Tipul inspecției", kind: "one", opts: ["Interior și exterior", "Doar exterior"] },
    ...(occupancy ? [{ k: "occupancy", label: "Utilizarea la data inspecției", kind: "one", opts: ["Locuit de proprietar", "Închiriat", "Nelocuit", "În construcție"] } as Field] : []),
    { k: "completed", label: "Construcție finalizată", kind: "one", opts: DA_NU },
    { k: "completion_pct", label: "Grad de finalizare (dacă nu e finalizată)", kind: "num", unit: "%" },
    { k: "doc_differences", label: "Diferențe față de acte", kind: "many", opts: ["Nu există", "Construcții / anexe neintabulate", "Extindere sau supraetajare", "Compartimentare modificată", "Mansardă / pod amenajat", "Suprafață diferită de acte", "Altă destinație decât în acte"] },
    { k: "doc_differences_notes", label: "Detalii diferențe", kind: "text", long: true, placeholder: "ex. anexă din lemn de cca 15 m² în curte, neintabulată" },
    { k: "defects", label: "Defecte vizibile", kind: "many", opts: ["Nu sunt", "Infiltrații", "Igrasie / umezeală", "Mucegai", "Fisuri", "Tencuieli căzute", "Instalații degradate", "Azbest (învelitoare / plăci)"] },
    { k: "notes", label: "Observații", kind: "text", long: true },
  ],
});

export const FORMS: Record<SheetType, Section[]> = {
  apartament: [
    amplasament([
      { k: "access_road", label: "Drum de acces", kind: "one", opts: ["Asfalt", "Pavat", "Pietruit", "De pământ"] },
      { k: "parking", label: "Parcare", kind: "one", opts: ["Loc propriu", "Stradă", "Garaj", "Lipsă"] },
    ]),
    { id: "cladire", title: "Clădirea", fields: [
      { k: "building_kind", label: "Tipul clădirii", kind: "one", opts: ["Bloc de locuințe", "Casă / duplex", "Vilă"] },
      { k: "year_built", label: "An construcție", kind: "int", placeholder: "ex. 1978" },
      { k: "height_regime", label: "Regim de înălțime", kind: "text", placeholder: "ex. P+10" },
      { k: "floor", label: "Etaj", kind: "text", placeholder: "ex. 3" },
      { k: "structure", label: "Structură", kind: "one", opts: ["Panouri mari prefabricate", "Cadre beton armat", "Zidărie portantă", "Metalică"] },
      { k: "foundation", label: "Fundație", kind: "one", opts: ["Fundații continue de beton", "Radier general", "Fundații izolate", "Nu se cunoaște"] },
      { k: "walls", label: "Închideri", kind: "one", opts: ["Cărămidă", "BCA", "Cărămidă și BCA", "Panouri prefabricate", "Bolțari"] },
      { k: "roof", label: "Acoperiș", kind: "one", opts: ["Terasă", "Șarpantă de lemn", "Șarpantă metalică"] },
      { k: "roof_cover", label: "Învelitoare", kind: "one", opts: ["Țiglă", "Tablă", "Bitum / membrană", "Azbociment"] },
      { k: "elevator", label: "Lift", kind: "one", opts: DA_NU },
      { k: "thermal_insulation", label: "Clădire anvelopată termic", kind: "one", opts: ["Da", "Parțial", "Nu"] },
      { k: "seismic_class", label: "Risc seismic (plăcuța clădirii)", kind: "one", opts: ["Fără încadrare / neexpertizat", "Bulină roșie / clasa I", "Clasa II", "Clasa III", "Clasa IV"] },
      { k: "common_areas", label: "Spații comune", kind: "many", opts: ["Hol / casa scării", "Lift", "Curte comună", "Loc de parcare", "Boxă", "Terasă comună", "Nu există"] },
      { k: "building_condition", label: "Starea clădirii", kind: "one", opts: STARE },
    ] },
    { id: "apartament", title: "Apartamentul", fields: [
      { k: "rooms", label: "Număr camere", kind: "int" },
      { k: "usable_area", label: "Suprafață utilă măsurată", kind: "num", unit: "m²" },
      { k: "bathrooms", label: "Băi", kind: "int" },
      { k: "layout", label: "Compartimentare", kind: "one", opts: ["Decomandat", "Semidecomandat", "Nedecomandat", "Circular"] },
      { k: "balconies", label: "Balcon / logie / terasă", kind: "one", opts: ["Nu", "1", "2", "3+", "Închis"] },
      { k: "balcony_area", label: "Suprafață balcoane / terase", kind: "num", unit: "m²" },
      { k: "ceiling_height_m", label: "Înălțimea interioară", kind: "num", unit: "m" },
      { k: "orientation", label: "Orientare", kind: "many", opts: ["N", "S", "E", "V"] },
    ] },
    { id: "finisaje", title: "Finisaje", fields: [
      { k: "finish_level", label: "Nivelul finisajelor", kind: "one", opts: FINISAJ },
      { k: "floors_rooms", label: "Pardoseli camere", kind: "many", opts: ["Parchet", "Laminat", "Gresie", "Mozaic", "Dușumea lemn"] },
      { k: "floors_wet", label: "Pardoseli zone umede", kind: "many", opts: ["Gresie", "Mozaic", "Ciment"] },
      { k: "wall_finish", label: "Pereți", kind: "many", opts: ["Vopsea lavabilă", "Tapet", "Faianță", "Tencuieli simple"] },
      { k: "windows", label: "Tâmplărie exterioară", kind: "one", opts: TAMPLARIE },
      { k: "entrance_door", label: "Ușa de intrare", kind: "one", opts: USA_EXT },
      { k: "interior_doors", label: "Tâmplărie interioară", kind: "one", opts: USI_INT },
      { k: "last_renovation", label: "Anul ultimei renovări", kind: "int" },
    ] },
    { id: "instalatii", title: "Instalații și branșamente", fields: [
      { k: "heating", label: "Încălzire", kind: "one", opts: ["Centrală proprie pe gaz", "Termoficare", "Centrală de bloc", "Sobe", "Electric", "Pompă de căldură", "Fără sistem de încălzire"] },
      ...UTILS(),
      { k: "own_sources", label: "Surse proprii (apartament în casă)", kind: "many", opts: ["Puț", "Fosă septică", "Rezervor GPL", "Nu există"] },
      ...RESIDENTIAL_EXTRA,
      { k: "installations_condition", label: "Starea instalațiilor", kind: "one", opts: STARE },
      { k: "air_conditioning", label: "Climatizare", kind: "one", opts: DA_NU },
    ] },
    constatari(),
  ],
  casa: [
    amplasament(),
    { id: "teren", title: "Terenul", fields: [
      { k: "land_area", label: "Suprafață teren", kind: "num", unit: "m²" },
      { k: "frontage_m", label: "Front stradal", kind: "num", unit: "m" },
      { k: "shape", label: "Formă", kind: "one", opts: ["Regulată", "Neregulată"] },
      { k: "slope", label: "Planeitate", kind: "one", opts: ["Plan", "Ușor înclinat", "Înclinat"] },
      { k: "fencing", label: "Împrejmuire", kind: "many", opts: ["Gard beton", "Gard metalic", "Gard lemn", "Plasă", "Lipsă"] },
      { k: "access_road", label: "Drum de acces", kind: "one", opts: ["Asfalt", "Pavat", "Pietruit", "De pământ"] },
    ] },
    { id: "constructie", title: "Construcția principală", fields: [
      { k: "height_regime", label: "Regim de înălțime", kind: "text", placeholder: "ex. P+1" },
      { k: "year_built", label: "An construcție", kind: "int" },
      { k: "last_renovation", label: "Anul modernizării / renovării majore", kind: "int" },
      { k: "rooms", label: "Număr camere", kind: "int" },
      { k: "bathrooms", label: "Băi", kind: "int" },
      { k: "usable_area", label: "Suprafață utilă măsurată", kind: "num", unit: "m²" },
      { k: "built_area", label: "Suprafață construită la sol", kind: "num", unit: "m²" },
      { k: "balcony_area", label: "Suprafață terase / balcoane", kind: "num", unit: "m²" },
      { k: "ceiling_height_m", label: "Înălțimea interioară", kind: "num", unit: "m" },
      { k: "foundation", label: "Fundație", kind: "one", opts: ["Fundații continue de beton", "Radier general", "Fundații izolate", "Fără fundație"] },
      { k: "structure", label: "Structură", kind: "one", opts: ["Zidărie portantă cu centuri", "Cadre beton armat", "Lemn", "Metalică", "Chirpici / paiantă"] },
      { k: "walls", label: "Închideri", kind: "one", opts: ["Cărămidă", "BCA", "Cărămidă și BCA", "Bolțari", "Lemn"] },
      { k: "roof", label: "Acoperiș", kind: "one", opts: ["Șarpantă de lemn", "Șarpantă metalică", "Terasă"] },
      { k: "roof_cover", label: "Învelitoare", kind: "one", opts: ["Țiglă", "Tablă", "Bitum", "Azbociment"] },
      { k: "building_condition", label: "Starea construcției", kind: "one", opts: STARE },
    ] },
    { id: "finisaje", title: "Finisaje", fields: [
      { k: "finish_level", label: "Nivelul finisajelor", kind: "one", opts: FINISAJ },
      { k: "exterior_finish", label: "Finisaj exterior", kind: "one", opts: FINISAJ_EXT },
      { k: "floors_rooms", label: "Pardoseli camere", kind: "many", opts: ["Parchet", "Gresie", "Laminat", "Marmură", "Dușumea lemn", "Ciment"] },
      { k: "floors_wet", label: "Pardoseli zone umede", kind: "many", opts: ["Gresie", "Mozaic", "Ciment"] },
      { k: "wall_finish", label: "Pereți", kind: "many", opts: ["Vopsea lavabilă", "Tapet", "Faianță", "Tencuieli simple"] },
      { k: "windows", label: "Tâmplărie exterioară", kind: "one", opts: TAMPLARIE },
      { k: "entrance_door", label: "Ușa de intrare", kind: "one", opts: USA_EXT },
      { k: "interior_doors", label: "Tâmplărie interioară", kind: "one", opts: USI_INT },
    ] },
    { id: "instalatii", title: "Instalații și branșamente", fields: [
      { k: "heating", label: "Încălzire", kind: "one", opts: ["Centrală pe gaz", "Pompă de căldură", "Combustibil solid", "Sobe", "Electric", "Fără sistem de încălzire"] },
      ...UTILS(),
      { k: "own_sources", label: "Surse proprii", kind: "many", opts: ["Puț", "Fosă septică", "Rezervor GPL", "Generator", "Nu există"] },
      ...RESIDENTIAL_EXTRA,
      { k: "installations_condition", label: "Starea instalațiilor", kind: "one", opts: STARE },
    ] },
    { id: "anexe", title: "Anexe", fields: [
      { k: "annexes", label: "Anexe pe teren", kind: "many", opts: ["Garaj", "Magazie", "Foișor", "Piscină", "Nu există"] },
    ] },
    constatari(),
  ],
  teren: [
    amplasament([
      { k: "access_road", label: "Drum de acces", kind: "one", opts: ["Asfalt", "Pietruit", "De pământ", "Fără acces direct"] },
    ], { k: "surroundings", label: "Vecinătăți", kind: "many", opts: ["Rezidențial", "Agricol", "Industrial", "Comercial"] }),
    { id: "incadrare", title: "Încadrare", fields: [
      { k: "land_area", label: "Suprafață măsurată", kind: "num", unit: "m²" },
      { k: "urban_zone", label: "Încadrare", kind: "one", opts: ["Intravilan", "Extravilan"] },
      { k: "land_use", label: "Categorie de folosință", kind: "one", opts: ["Curți-construcții", "Arabil", "Pășune", "Livadă", "Vie", "Pădure"] },
      { k: "urban_docs", label: "Documente de urbanism", kind: "many", opts: ["PUG", "PUZ aprobat", "Certificat de urbanism", "Nu se cunosc"] },
    ] },
    { id: "configuratie", title: "Configurație", fields: [
      { k: "shape", label: "Formă", kind: "one", opts: ["Regulată", "Neregulată"] },
      { k: "frontage_m", label: "Front stradal", kind: "num", unit: "m" },
      { k: "street_fronts", label: "Număr de deschideri la stradă", kind: "int" },
      { k: "depth_m", label: "Adâncime", kind: "num", unit: "m" },
      { k: "slope", label: "Planeitate", kind: "one", opts: ["Plan", "Ușor înclinat", "Înclinat"] },
      { k: "fencing", label: "Împrejmuire", kind: "many", opts: ["Gard", "Parțială", "Lipsă"] },
      { k: "land_improvements", label: "Îmbunătățiri", kind: "many", opts: ["Pavaje / alei", "Platforme betonate", "Drenaje", "Nu există"] },
      { k: "easements", label: "Rețele care traversează terenul", kind: "many", opts: ["Linie electrică aeriană", "Conducte / rețele subterane", "Drum de servitute", "Nu există vizibile"] },
    ] },
    { id: "bransamente", title: "Branșamente", fields: UTILS("Curent electric", "Contor electric montat (firidă)") },
    { id: "constructii", title: "Construcții pe teren", fields: [
      { k: "land_constructions", label: "Construcții pe teren", kind: "one", opts: ["Nu există", "Provizorii", "De demolat", "În construcție"] },
    ] },
    { id: "constatari", title: "Constatări", fields: [
      { k: "inspection_scope", label: "Tipul inspecției", kind: "one", opts: ["La fața locului", "Doar de la limita terenului"] },
      { k: "doc_differences", label: "Diferențe față de acte", kind: "many", opts: ["Nu există", "Construcții neintabulate", "Suprafață / limite diferite de acte", "Altă folosință decât în acte"] },
      { k: "doc_differences_notes", label: "Detalii diferențe", kind: "text", long: true },
      { k: "notes", label: "Observații", kind: "text", long: true },
    ] },
  ],
  comercial: [
    amplasament([
      { k: "road_access", label: "Acces rutier", kind: "one", opts: ["Drum național", "Drum județean", "Stradă", "Drum de exploatare"] },
      { k: "visibility", label: "Vizibilitate de la drum", kind: "one", opts: ["Ridicată", "Medie", "Redusă"] },
      { k: "yard_area", label: "Curte / parcare", kind: "num", unit: "m²" },
    ]),
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
      { k: "renewables", label: "Surse regenerabile", kind: "many", opts: ["Panouri fotovoltaice", "Pompă de căldură", "Nu există"] },
      { k: "fire_safety", label: "Siguranță la incendiu", kind: "many", opts: ["Hidranți", "Sprinklere", "Detecție incendiu", "Avizat ISU"] },
    ] },
    { id: "birouri", title: "Birouri și anexe", fields: [
      { k: "offices_area", label: "Birouri incluse", kind: "num", unit: "m²" },
      { k: "offices_finish", label: "Finisaje birouri", kind: "one", opts: ["Superioare", "Medii", "Inferioare", "Nu există"] },
      { k: "sanitary", label: "Grupuri sanitare / vestiare", kind: "one", opts: DA_NU },
    ] },
    constatari(false),
  ],
  accesoriu: [
    { id: "accesoriu", title: "Accesoriul", fields: ACC_FIELDS.filter((f) => f.k !== "acc_notes") },
    { id: "obs", title: "Observații", fields: [{ k: "notes", label: "Observații", kind: "text", long: true }] },
  ],
};

/** Photo categories offered for every sheet; the ones marked required are needed before the sheet is sent. */
export const PHOTO_CATEGORIES: { k: string; label: string; types?: SheetType[]; required?: boolean }[] = [
  { k: "exterior", label: "Exterior / fațadă", required: true },
  { k: "accessories", label: "Accesorii (parcare, garaj, boxă)" },
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
  if (isAccessoryType(t)) return "accesoriu";
  if (orderType === "apartment") return "apartament";
  if (orderType === "house") return "casa";
  if (orderType === "land") return "teren";
  if (orderType === "commercial" || orderType === "industrial") return "comercial";
  if (c === "TEREN" || c === "PROPRIETATE AGRICOLA" || t.startsWith("TEREN")) return "teren";
  if (c === "COMERCIAL" || c === "INDUSTRIAL" || c === "MIXT") return "comercial";
  if (t.includes("CASA") && !t.includes("APARTAMENT")) return "casa";
  return "apartament";
}

/** "Every asset" in the list of asset types a sheet is for. */
export const ALL_ASSETS = "*";

/** The asset types a built-in sheet is for by default: the types whose sheet it would be (movable goods have none). */
export const defaultSheetAssets = (t: SheetType, nomen: [cat: string, types: string[]][]) =>
  nomen.filter(([c]) => c !== "BUN MOBIL").flatMap(([c, types]) => types.filter((x) => guessSheetType(c, x) === t).map((x) => `${c}|${x}`));

// ---------- answers ----------

/** The sections of a sheet: the ones it was started with (template snapshot), else the built-in form. */
export const formOf = (t: SheetType, form?: Section[] | null): Section[] => (form && form.length ? form : FORMS[t]);
export const allFields = (t: SheetType, form?: Section[] | null) => formOf(t, form).flatMap((s) => s.fields);

/** A field counts as filled when it has an answer; a utility needs the meter (connected) or the distance (not connected). */
export function isFilled(f: Field, a: Answers[string]): boolean {
  if (Array.isArray(a) && a.some((x) => typeof x !== "string")) return false; // a room list is not a field answer
  if (f.kind === "util") {
    const u = (a ?? {}) as UtilAnswer;
    if (u.on === "da") return f.k === "sewer" || !!u.meter;
    if (u.on === "nu") return !!u.dist?.toString().trim();
    return false;
  }
  if (Array.isArray(a)) return a.length > 0;
  return typeof a === "string" && a.trim() !== "";
}

/** Filled, counting the "Altele" text of a question that has one. */
export const answered = (f: Field, answers: Answers) =>
  isFilled(f, answers[f.k]) || (!!f.other && typeof answers[otherKey(f.k)] === "string" && (answers[otherKey(f.k)] as string).trim() !== "");

/** Free text and answers needed only in some cases (details, completion %) do not count towards completion. */
export const isOptional = (f: Field) => !f.req && (f.k === "notes" || f.k.endsWith("acc_notes") || f.k.endsWith("_notes") || f.k === "completion_pct");

export function progress(t: SheetType, answers: Answers, form?: Section[] | null) {
  const fields = allFields(t, form).filter((f) => !isOptional(f));
  const done = fields.filter((f) => answered(f, answers)).length;
  return { done, total: fields.length };
}

/** Questions marked required in the template that are still empty. */
export const missingRequired = (t: SheetType, answers: Answers, form?: Section[] | null) =>
  allFields(t, form).filter((f) => f.req && !answered(f, answers));

/** Answers the sheet starts with: the options the template ticks by default. */
export function defaultAnswers(sections: Section[]): Answers {
  const out: Answers = {};
  for (const f of sections.flatMap((s) => s.fields)) {
    if (!f.defaults?.length || (f.kind !== "one" && f.kind !== "many")) continue;
    const d = f.defaults.filter((o) => f.opts.includes(o));
    if (d.length) out[f.k] = f.kind === "many" ? d : d[0];
  }
  return out;
}

const toNum = (v: unknown) => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const n = Number(String(v).replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/**
 * Fields added in form v2: property_features is close to D1's 100-column limit, so their values are kept together
 * as JSON in its "extra" column (same names and value rules as the other columns).
 */
export const EXTRA_FEATURES = new Set([
  "locality_position", "zone_type", "transport_distance_m", "flood_risk", "water_body_distance_m", "building_kind", "seismic_class",
  "common_areas", "balcony_area", "ceiling_height_m", "entrance_door", "interior_doors", "telecom", "renewables", "thermal_renovation_year",
  "street_fronts", "land_improvements", "easements", "inspection_scope", "completed", "completion_pct", "doc_differences",
  "doc_differences_notes", "defects",
]);

/** Maps the answers onto property_features columns (v2 fields → "extra" JSON). Only fields of the chosen form are kept; values are checked. */
export function featureColumns(t: SheetType, answers: Answers, form?: Section[] | null): Record<string, string | number | null> {
  const all = featureValues(t, answers, form);
  const out: Record<string, string | number | null> = {};
  const extra: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(all)) {
    if (!EXTRA_FEATURES.has(k)) out[k] = v;
    else if (v !== null) extra[k] = v;
  }
  if (t !== "accesoriu") out.extra = Object.keys(extra).length ? JSON.stringify(extra) : null;
  return out;
}

function featureValues(t: SheetType, answers: Answers, form?: Section[] | null): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  if (t === "accesoriu") return out; // accessories keep their answers on the sheet only
  // Only the built-in questions have columns; the firm's own questions stay in the sheet's answers.
  for (const f of allFields(t, form).filter((x) => !x.custom)) {
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
      const list = Array.isArray(a) ? f.opts.filter((o) => (a as unknown[]).includes(o)) : [];
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

/** Reasons an asset is valued without an inspection in the CRM. */
export const NO_INSPECTION_REASONS = ["Evaluare desktop, fără vizionare", "Inspecție făcută anterior", "Inspecție făcută de bancă / terț", "Inspecție în afara CRM", "Inspecție comună cu alt raport din contract"];
