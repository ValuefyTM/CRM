// Vocabulary of the contract document (terms of reference, payment). No server code: also used by the terms editor.

/** VALUEFY as it appears on its contracts. */
export const FIRM = {
  name: "VALUEFY SRL",
  address: "Str. Bega, Nr. 25/4, Giroc, Jud. Timiș",
  mail: "Giroc, Strada Bega, Nr. 25/4, Județul Timiș",
  cui: "3825411",
  reg: "J35/3816/2017",
  iban: "RO11INGB0000999907244673 / ING BANK",
  rep: "Stan Claudiu-Bogdan",
  repRole: "Administrator",
  phone: "0766-225-936",
  email: "office@valuefy.ro",
  anevar: "0754",
  court: "București",
};

export const PURPOSE_BOXES: [key: string, label: string, match: RegExp][] = [
  ["garantare", "Garantarea împrumutului", /garant|credit/i],
  ["informare", "Informare", /informare/i],
  ["insolventa", "Insolvență", /insolven/i],
  ["executare", "Executare / lichidare", /execut|lichid/i],
  ["impozitare", "Impozitare", /impozit/i],
  ["esalonare", "Eșalonarea datoriilor către stat", /e[sș]alon/i],
  ["raportare", "Raportare financiară", /raportare/i],
];

export const VALUE_TYPES: [key: string, label: string, definition: string][] = [
  ["piata", "Valoarea de piață", "„Valoarea de piață este suma estimată pentru care un activ sau o datorie ar putea fi schimbat(ă) la data evaluării, între un cumpărător hotărât și un vânzător hotărât, într-o tranzacție nepărtinitoare, după un marketing adecvat și în care părțile au acționat fiecare în cunoștință de cauză, prudent și fără constrângere.”"],
  ["chirie", "Chiria de piață", "„Chiria de piață este suma estimată pentru care un drept asupra proprietății imobiliare ar putea fi închiriat, la data evaluării, între un locator hotărât și un locatar hotărât, într-o tranzacție nepărtinitoare, după un marketing adecvat și în care părțile au acționat fiecare în cunoștință de cauză, prudent și fără constrângere.”"],
  ["echitabila", "Valoarea echitabilă", "„Valoarea echitabilă este prețul estimat pentru transferul unui activ sau al unei datorii între părți identificate, aflate în cunoștință de cauză și hotărâte, preț care reflectă interesele acelor părți.”"],
  ["investitie", "Valoarea de investiție / subiectivă", "„Valoarea de investiție este valoarea unui activ pentru proprietarul acestuia sau pentru un proprietar potențial, pentru o anumită investiție sau pentru anumite scopuri de exploatare.”"],
  ["sinergie", "Valoarea sinergiei", "„Valoarea sinergiei reprezintă rezultatul creat în urma combinării a două sau mai multe active sau drepturi, atunci când valoarea rezultată în urma combinării este mai mare decât suma valorilor individuale.”"],
  ["lichidare", "Valoarea de lichidare", "„Valoarea de lichidare reprezintă suma care ar fi obținută când un activ sau grup de active se vinde în mod individual.”"],
  ["impozabila", "Valoarea impozabilă", "„Valoarea impozabilă este un tip al valorii estimat în scopul impozitării clădirilor nerezidențiale deținute de către persoane fizice sau juridice și a clădirilor rezidențiale deținute de persoane juridice.”"],
  ["justa", "Valoarea justă", "„Conform IFRS 13, valoarea justă este prețul care ar fi încasat pentru vânzarea unui activ sau plătit pentru transferul unei datorii într-o tranzacție reglementată între participanții de pe piață, la data evaluării.”"],
];

export const DELIVERABLES: [key: string, label: string][] = [
  ["raport", "Raport de evaluare"],
  ["nop", "Notă de opinie asupra valorii (NOP)"],
  ["nip", "Notă de inspecție a proprietății (NIP)"],
];

/** What can be set on a contract; anything left empty takes the default worked out from the contract and its reports. */
export type ContractTerms = {
  users?: string; others?: string; value_type?: string; deliverable?: string; nop_inspection?: boolean; reports?: number; term_days?: number;
  limitations?: string; special?: string; sources?: string; payment_when?: string; tranches?: string; print?: string;
};

export const DEFAULT_LIMITATIONS = "În urma discuției cu reprezentanții Clientului nu au fost identificate limitări sau restricții referitoare la inspecția, documentarea și analizele necesare pentru realizarea misiunii de evaluare.";
export const DEFAULT_TRANCHES = "Tranșa 1: 100% la data semnării contractului";
export const DEFAULT_PAYMENT_WHEN = "la data semnării prezentului contract";

export function purposeKey(purpose: string | null | undefined) {
  return PURPOSE_BOXES.find(([, , re]) => re.test(purpose ?? ""))?.[0] ?? null;
}

/** The type of value that fits the purpose (taxation → taxable value, financial reporting → fair value, else market value). */
export function defaultValueType(purpose: string | null | undefined) {
  const k = purposeKey(purpose);
  return k === "impozitare" ? "impozabila" : k === "raportare" ? "justa" : "piata";
}

export function defaultDeliverable(reportType: string | null | undefined) {
  const t = (reportType ?? "").toLowerCase();
  return t.includes("opinie") ? "nop" : t.includes("inspec") ? "nip" : "raport";
}

/** Documents the client provides, by purpose (taxation needs the taxpayer's statement and the asset register). */
export function defaultSources(purpose: string | null | undefined, movable: boolean) {
  if (movable) return "facturi de achiziție, fișe tehnice, certificate de înmatriculare / cărți de identitate ale bunurilor, fișa mijloacelor fixe, documente privind reparațiile și starea tehnică, după caz";
  if (purposeKey(purpose) === "impozitare")
    return "declarația contribuabilului – conform Codului Fiscal, lista imobilizărilor corporale de natura terenurilor și construcțiilor, titlu de proprietate, documentație cadastrală (PAD și/sau relevee construcții), planuri arhitecturale, fișa mijloacelor fixe – după caz, extras de carte funciară pentru informare la zi, autorizație de construire, proces-verbal de recepție la terminarea lucrărilor, certificat de urbanism etc.";
  return "titlu de proprietate, extras de carte funciară pentru informare la zi, documentație cadastrală (PAD și/sau relevee construcții), autorizație de construire și proces-verbal de recepție la terminarea lucrărilor, certificat de urbanism, alte documente relevante – după caz";
}

/** Only the fields the editor knows, trimmed. */
export function cleanTerms(raw: unknown): ContractTerms {
  const b = (raw ?? {}) as Record<string, unknown>;
  const s = (k: string, max = 2000) => (typeof b[k] === "string" ? (b[k] as string).trim().slice(0, max) : "") || undefined;
  const n = (k: string, max: number) => { const v = Number(b[k]); return Number.isFinite(v) && v >= 1 && v <= max ? Math.round(v) : undefined; };
  return {
    users: s("users", 400), others: s("others", 400), value_type: VALUE_TYPES.some(([k]) => k === b.value_type) ? (b.value_type as string) : undefined,
    deliverable: DELIVERABLES.some(([k]) => k === b.deliverable) ? (b.deliverable as string) : undefined, nop_inspection: b.nop_inspection === false ? false : undefined,
    reports: n("reports", 50), term_days: n("term_days", 120), limitations: s("limitations"), special: s("special"), sources: s("sources"),
    payment_when: s("payment_when", 200), tranches: s("tranches", 1000), print: s("print", 300),
  };
}

/** Terms kept per report (its Annex 1) and per contract (payment, Annex 2). */
export const REPORT_FIELDS = ["users", "others", "value_type", "deliverable", "nop_inspection", "reports", "term_days", "limitations", "special", "sources"] as const;
export const PAYMENT_FIELDS = ["payment_when", "tranches", "print"] as const;
