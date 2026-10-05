// Order vocabulary shared by the portal wizard, the portal and the CRM. No server code: also used by client components.

export const PROPERTY_TYPES = [
  ["apartment", "Apartament"],
  ["house", "Casă"],
  ["land", "Teren"],
  ["commercial", "Spațiu comercial"],
  ["industrial", "Hală / industrial"],
  ["other", "Altă proprietate"],
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number][0];

export const PURPOSES = [
  "Credit bancar",
  "Vânzare / cumpărare",
  "Impozitare",
  "Raportare financiară",
  "Succesiune / partaj",
  "Expertiză / litigiu",
  "Garanție eșalonare ANAF",
  "Alt scop",
] as const;

export const BANKS = ["BCR", "BRD", "Banca Transilvania", "ING Bank", "Raiffeisen Bank", "UniCredit Bank", "CEC Bank", "Altă bancă"] as const;

/** Which area fields a property type asks for. */
export const AREA_FIELDS: Record<PropertyType, { surface: boolean; rooms: boolean; land: boolean }> = {
  apartment: { surface: true, rooms: true, land: false },
  house: { surface: true, rooms: true, land: true },
  land: { surface: false, rooms: false, land: true },
  commercial: { surface: true, rooms: false, land: false },
  industrial: { surface: true, rooms: false, land: true },
  other: { surface: true, rooms: false, land: false },
};

export type DocSpec = { key: string; label: string; optional?: boolean };

const COMMON: DocSpec[] = [
  { key: "cf", label: "Extras CF pentru informare (max. 30 de zile)" },
  { key: "title", label: "Act de proprietate" },
  { key: "id", label: "Act de identitate proprietar" },
];

/** Documents to upload, by property type (from the design handoff). */
export const DOCS: Record<PropertyType, DocSpec[]> = {
  apartment: [...COMMON, { key: "plan", label: "Releveu / plan apartament" }, { key: "energy", label: "Certificat energetic", optional: true }],
  house: [
    ...COMMON,
    { key: "cadastre", label: "Releveu / documentație cadastrală" },
    { key: "permit", label: "Autorizație de construire / PV de recepție", optional: true },
    { key: "energy", label: "Certificat energetic", optional: true },
  ],
  land: [...COMMON, { key: "site_plan", label: "Plan de amplasament și delimitare" }, { key: "urbanism", label: "Certificat de urbanism", optional: true }],
  commercial: [...COMMON, { key: "cadastre", label: "Releveu / documentație cadastrală" }, { key: "lease", label: "Contracte de închiriere", optional: true }],
  industrial: [
    ...COMMON,
    { key: "cadastre", label: "Documentație cadastrală" },
    { key: "permit", label: "Autorizație de construire / PV de recepție" },
    { key: "lease", label: "Contracte de închiriere", optional: true },
  ],
  other: [...COMMON, { key: "cadastre", label: "Documentație cadastrală" }],
};

export const propertyLabel = (t: string) => PROPERTY_TYPES.find(([k]) => k === t)?.[1] ?? t;
export const docLabel = (type: string, kind: string) =>
  kind === "other" ? "Alt document" : DOCS[type as PropertyType]?.find((d) => d.key === kind)?.label ?? kind;
export const orderRef = (seq: number) => `CO-${seq}`;

/** The six stages shown on the order timeline. Orders stay on the first one until processing is built. */
export const STAGES = ["Comandă primită", "Documente complete", "Inspecție programată", "Inspecție realizată", "Raport în lucru", "Raport livrat"];

export const ACCEPT = ".pdf,.jpg,.jpeg,.png,.heic,.webp,.doc,.docx";
export const MAX_FILE_MB = 20;

/** Status pill for an order (only the first stage exists until processing is built). */
export const orderStatus = (o: { docs_missing: number }): [string, string] => (o.docs_missing ? ["Documente lipsă", "pillWarn"] : ["Comandă primită", ""]);
