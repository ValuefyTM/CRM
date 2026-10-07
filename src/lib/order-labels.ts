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
  kind === "other" ? "Alt document" : kind === "bank_screen" ? "Captură din aplicația băncii" : DOCS[type as PropertyType]?.find((d) => d.key === kind)?.label ?? kind;
export const orderRef = (seq: number) => `CO-${seq}`;

/** Stages of the order timeline (the real progress comes from orderProgress in src/lib/delivery.ts). */
export const STAGES = ["Comandă primită", "Ofertă acceptată", "Inspecție programată", "Inspecție realizată", "Raport în lucru", "În verificare", "Raport livrat"];

export const ACCEPT = ".pdf,.jpg,.jpeg,.png,.heic,.webp,.doc,.docx";
export const MAX_FILE_MB = 20;

/** Status pill for an order. New orders show whether documents are missing; processed ones (Glide) their outcome. */
export const orderStatus = (o: { docs_missing: number; status?: string }): [string, string] => {
  switch (o.status) {
    case "done": return ["Finalizată", "pillOk"];
    case "cancelled": return ["Anulată", "pillErr"];
    case "suspended": return ["Suspendată", "pillWarn"];
    case "in_progress": return ["În lucru", "pillInfo"];
    case "draft": return ["Draft", ""];
    default: return o.docs_missing ? ["Documente lipsă", "pillWarn"] : ["Comandă primită", ""];
  }
};

/** Reference shown for an order: CO-<n> for orders placed in the CRM, the bank's number for bank orders. */
export const orderCode = (o: { seq: number | null; bank_ref?: string | null; bank?: string | null; source?: string; id: string }) =>
  o.seq ? orderRef(o.seq) : o.bank_ref ? `${o.bank ?? "Bancă"} ${o.bank_ref}` : `${o.source === "collab" ? "COL" : "CMD"}-${o.id.replace(/^g-ord-\w-/, "").slice(0, 6).toUpperCase()}`;

export const SOURCE_LABEL: Record<string, string> = { partner: "Colaborator", client: "Client direct", bank: "Bancă · contract cadru", collab: "Colaborare firmă de evaluare", site: "Site valuefy.ro (asistent)" };

/** Address line of an order ("—" when the order came without one, e.g. bank orders from Glide). */
export const orderPlace = (o: { address: string | null; city: string | null }) => [o.address, o.city].filter(Boolean).join(", ") || "—";
/** What is valued: the property type for portal orders, else the requested report type. */
export const orderWhat = (o: { property_type: string | null; report_type?: string | null }) =>
  o.property_type ? propertyLabel(o.property_type) : o.report_type ?? "Evaluare";
