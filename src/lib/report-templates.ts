// The report templates of the drafting mode (Rapoarte → Redactare): for each bank and type of property, the chapters
// of its report and, in each one, the fields filled in the bank's application. A field is written with AI from the
// sources it names (`ai`), is a list of short values taken from the CRM and the inspection sheet (`facts`), the
// market parameters set by the evaluator (`market`), or a text of the legal check (`legal`). The defaults are here;
// Setări → Machete de raport keeps the firm's changes (instructions, limits, style examples) in report_templates.
import { now } from "./db";

export type Src = "raport" | "bun" | "inspectie" | "acte" | "piata" | "comparabile" | "similare" | "capitole";
export const SOURCES: [Src, string][] = [
  ["raport", "încadrarea raportului"], ["bun", "datele bunului"], ["inspectie", "fișa de inspecție"], ["acte", "analiza juridică"],
  ["piata", "parametrii pieței"], ["comparabile", "evaluări din zonă"], ["similare", "rapoarte similare"], ["capitole", "celelalte capitole"],
];
export type FieldKind = "ai" | "facts" | "market" | "legal";
/** A short value: `from` = where it is taken, first found wins: "r:<report>", "a:<asset>", "s:<regex on the sheet's labels>"
 * (what was found at the inspection first; the areas from the documents, as kept on the asset). */
export type Fact = { label: string; from: string[] };
export type TField = {
  key: string; label: string; kind: FieldKind;
  /** the field's name in the bank's application */
  brd?: string;
  sources: Src[]; prompt: string; limit: number; required: boolean;
  facts?: Fact[]; legal?: "right" | "opis";
};
export type Chapter = { key: string; title: string; fields: TField[] };
export type Template = { key: string; name: string; bank: string; kind: "apartament" | "teren" | "casa"; chapters: Chapter[]; examples: Record<string, string[]> };

const ai = (key: string, label: string, sources: Src[], limit: number, prompt: string, brd?: string): TField => ({ key, label, kind: "ai", sources, limit, prompt, required: true, brd });
const facts = (key: string, label: string, list: Fact[], brd?: string): TField => ({ key, label, kind: "facts", sources: ["raport", "bun", "inspectie"], limit: 0, prompt: "", required: true, facts: list, brd });
const f = (label: string, ...from: string[]): Fact => ({ label, from });

const CADRU = facts("cadru", "Date generale", [
  f("Scopul evaluării", "r:purpose"), f("Tipul valorii", "r:value_type"), f("Data evaluării", "r:valuation_date"), f("Data inspecției", "r:inspection_date"),
  f("Inspecție realizată de", "r:inspector"), f("Moneda", "r:currency"), f("Utilizator desemnat", "r:bank"), f("Client", "r:client"), f("Tipul raportului", "r:report_type"),
], "Cap. I — obiect, scop, date, inspecție, monedă, beneficiar, tip valoare");

const INSPECTIE = ai("inspectie", "Descrierea inspecției", ["raport", "inspectie"], 500,
  "Cine a inspectat proprietatea, când, în prezența cui și ce a cuprins inspecția (interior, exterior, zona). Fără aprecieri despre stare.", "Inspecția proprietății");

const PIATA: Chapter = {
  key: "piata", title: "Cap. III · Piața", fields: [
    { key: "piata_parametri", label: "Parametrii pieței", kind: "market", sources: ["bun", "inspectie", "comparabile"], limit: 0, required: true,
      prompt: "Propune cererea, oferta, tendința prețului, timpul de expunere și echilibrul pieței pentru tipul de bun și zonă. Evaluatorul le confirmă." },
    ai("piata_definire", "Definirea pieței", ["piata", "bun", "inspectie"], 1000,
      "Piața relevantă: tipul de bun, segmentul, zona și caracterul ei (rezidențială, centrală / periferică, tipul clădirilor). 2–3 fraze.", "Definirea pieței"),
    ai("piata_cerere", "Analiza cererii solvabile", ["piata", "similare"], 1500,
      "Cine cumpără, cum finanțează, ce caută. Nivelul cererii din parametri. Fără cifre inventate; intervalul de preț doar din oferte.", "Analiza cererii solvabile"),
    ai("piata_oferta", "Oferta la vânzare", ["piata", "comparabile"], 1500,
      "Nivelul ofertei, numărul de oferte identificate, intervalul min–max și prețul mediu pe mp, doar din cifrele date de evaluator.", "Analiza ofertei la vânzare"),
    ai("piata_echilibru", "Echilibrul pieței · concluzie", ["piata", "capitole"], 1000,
      "Starea de echilibru, tendința, timpul de expunere și vandabilitatea. Coerent cu celelalte capitole.", "Echilibrul pieței și concluzii"),
  ],
};

const EVALUARE = (land: boolean): Chapter => ({
  key: "evaluare", title: "Cap. IV · Evaluare", fields: [
    ai("cmbu", "Cea mai bună utilizare", ["bun", "inspectie", "piata"], 1200, land
      ? "Analiza CMBU pentru teren: întâi ca teren liber (permisibil legal, posibil fizic, fezabil financiar, maxim productiv, cu PUG / certificatul de urbanism), apoi ca teren construit, dacă e cazul. Concluzia."
      : "Analiza CMBU: utilizarea actuală (rezidențială) comparată cu cele patru criterii (permisibilă legal, posibilă fizic, fezabilă financiar, maxim productivă). Concluzia: utilizarea actuală.", "Cea mai bună utilizare"),
    ai("procedura", "Procedura de evaluare", ["raport", "piata"], 800,
      "Abordarea aplicată (prin piață, comparația directă) și de ce celelalte nu sunt adecvate aici. Ipoteza de lucru.", "Procedura de evaluare"),
    ai("grila", "Justificarea corecțiilor din grilă", ["bun", "inspectie", "piata"], 3000, land
      ? "Câte o frază pentru fiecare element de comparație al terenului: drept, finanțare, condiții de vânzare, condiții de piață, localizare, suprafață, front / formă, utilități, acces, urbanism. Spune ce are subiectul și în ce sens se fac corecțiile; fără procente inventate."
      : "Câte o frază pentru fiecare element de comparație: negociere, componente non-imobiliare, drept, finanțare, condiții de vânzare, cheltuieli după cumpărare, condiții de piață, localizare, vechime, arie utilă, nivel, finisaje, compartimentare, parcare, boxă. Spune ce are subiectul și în ce sens se fac corecțiile; fără procente inventate.",
      "Justificarea ajustărilor"),
    ai("reconciliere", "Concluzia asupra valorii", ["raport", "bun", "piata"], 800,
      "Valoarea propusă (dacă e trecută la bun), abordarea pe care se bazează și încadrarea în intervalul ofertelor. Dacă valoarea lipsește, lasă [de completat: valoarea].", "Reconcilierea rezultatelor"),
  ],
});

const ANEXE: Chapter = {
  key: "anexe", title: "Anexe A · B · C", fields: [
    ai("ipoteze", "Ipoteze și ipoteze speciale", ["raport", "inspectie", "acte"], 1500,
      "Ipotezele de lucru standard ale evaluării pentru garantarea împrumutului și ipotezele speciale care rezultă din inspecție și din acte (diferențe, construcție nefinalizată, sarcini).", "Anexa A — ipoteze"),
    { key: "opis", label: "Opisul documentelor", kind: "legal", legal: "opis", sources: ["acte"], limit: 0, prompt: "", required: true, brd: "Anexa C — documente" },
  ],
};

const SINTEZA: Chapter = {
  key: "sinteza", title: "Sinteză · rezultat", fields: [
    ai("sinteza", "Sinteza raportului", ["raport", "bun", "inspectie", "acte"], 700,
      "Pe scurt: ce bun e evaluat, unde, ce suprafață, proprietarul, scopul și data evaluării. Fără valoare dacă lipsește.", "Sinteza raportului"),
    ai("riscuri", "Situații speciale · riscul garanției", ["inspectie", "acte", "piata"], 1500,
      "Riscul tehnic (stare, risc seismic, defecte), juridic (sarcini, neconcordanțe) și de vandabilitate, fiecare cu concluzia scăzut / mediu / ridicat. Situațiile speciale din acte și inspecție.", "Situații speciale și riscul garanției"),
    ai("swot", "Analiza SWOT", ["bun", "inspectie", "piata"], 1200,
      "Puncte tari, puncte slabe, oportunități, amenințări: câte 2–4 scurte fiecare, din fișă și din parametrii pieței.", "Analiza SWOT"),
  ],
};

const JURIDIC: TField = { key: "juridic", label: "Situația juridică", kind: "legal", legal: "right", sources: ["acte"], limit: 0, prompt: "", required: true, brd: "Situația juridică" };
const AMPLASAMENT = ai("amplasament", "Amplasament · zona", ["bun", "inspectie"], 1200,
  "Poziția în localitate, tipul zonei, vecinătăți, accesul și transportul public, dotările din apropiere, riscurile vizibile (inundații). Doar ce e în fișă.", "Amplasament");
const DIFERENTE = ai("diferente", "Diferențe față de acte", ["inspectie", "acte"], 800,
  "Diferențele constatate la inspecție față de acte (suprafețe, compartimentare, extinderi) și cele dintre acte. Dacă nu sunt, spune că nu s-au constatat.", "Diferențe față de documente");

export const DEFAULT_TEMPLATES: Template[] = [
  {
    key: "brd-apartament", name: "BRD · Apartament", bank: "BRD", kind: "apartament", examples: {},
    chapters: [SINTEZA, { key: "cadru", title: "Cap. I · Prezentare generală", fields: [CADRU, INSPECTIE] }, {
      key: "proprietate", title: "Cap. II · Proprietatea", fields: [
        ai("descriere", "Descrierea tehnică", ["bun", "inspectie", "acte"], 2000,
          "Ordinea BRD: localizare și CF, compunere și suprafețe, clădire (regim, an, structură, închideri), exterior, finisaje interioare, uși și tâmplărie, încălzire, acces. Fără aprecieri care nu sunt în fișă.",
          "Identificarea și descrierea proprietății — caracteristici tehnice"),
        facts("caracteristici", "Caracteristici", [
          f("Tip structură", "s:^Structură$"), f("Regim de înălțime", "s:Regim de înălțime", "a:height_regime"), f("Anul construirii", "s:^An construcție", "a:year_built"),
          f("Etaj", "s:^Etaj$", "a:floor"), f("Număr camere", "s:^Număr camere", "a:rooms"), f("Compartimentare", "s:^Compartimentare"), f("Arie utilă", "a:usable_area", "s:Suprafață utilă"),
          f("Băi", "s:^Băi$"), f("Balcon / terasă", "s:^Balcon"), f("Grad de finisare", "s:Nivelul finisajelor"), f("Încălzire", "s:^Încălzire"), f("Lift", "s:^Lift$"),
          f("Risc seismic", "s:Risc seismic"), f("Starea clădirii", "s:^Starea clădirii"), f("Anul renovării", "s:renovării"),
        ], "Caracteristici — câmpuri scurte"),
        ai("utilitati", "Utilități · utilizare", ["inspectie"], 800, "Branșamentele (apă, canalizare, gaz, curent), sursa de încălzire și utilizarea la data inspecției (locuit, liber, închiriat).", "Utilități și utilizarea curentă"),
        DIFERENTE, JURIDIC, AMPLASAMENT,
      ],
    }, PIATA, EVALUARE(false), ANEXE],
  },
  {
    key: "brd-teren", name: "BRD · Teren", bank: "BRD", kind: "teren", examples: {},
    chapters: [SINTEZA, { key: "cadru", title: "Cap. I · Prezentare generală", fields: [CADRU, INSPECTIE] }, {
      key: "proprietate", title: "Cap. II · Proprietatea", fields: [
        facts("fisa_teren", "Fișa tehnică a terenului", [
          f("Suprafața terenului", "a:land_area", "s:^Suprafață (măsurată|teren)"), f("Amplasament", "s:Poziția în localitate", "s:Tipul zonei"),
          f("Utilități", "s:^(Apă|Canalizare|Gaz|Curent electric)$"), f("Drum de acces", "s:^Drum de acces"), f("Geometrie / front", "s:^Formă$", "s:^Front stradal"),
          f("Restricții PUG", "s:^Încadrare$"), f("Categorie de folosință", "s:Categorie de folosință"), f("POT / CUT / certificat de urbanism", "s:Documente de urbanism"), f("Înclinare", "s:^Planeitate"),
        ], "Fișa tehnică teren — 9 parametri"),
        ai("descriere_teren", "Descrierea terenului", ["bun", "inspectie", "acte"], 1500,
          "Localizare și CF, suprafață, formă și front, acces, utilități, încadrare urbanistică (PUG, POT/CUT, certificat de urbanism), construcții sau îmbunătățiri pe teren, rețele care îl traversează.", "Identificarea și descrierea terenului"),
        DIFERENTE, JURIDIC, AMPLASAMENT,
      ],
    }, PIATA, EVALUARE(true), ANEXE],
  },
  {
    key: "brd-casa", name: "BRD · Casă cu teren", bank: "BRD", kind: "casa", examples: {},
    chapters: [SINTEZA, { key: "cadru", title: "Cap. I · Prezentare generală", fields: [CADRU, INSPECTIE] }, {
      key: "proprietate", title: "Cap. II · Proprietatea", fields: [
        ai("descriere_teren", "Descrierea terenului", ["bun", "inspectie", "acte"], 1200, "Suprafața, forma și frontul, accesul, împrejmuirea, utilitățile și anexele de pe teren.", "Descrierea terenului"),
        ai("descriere", "Descrierea construcției", ["bun", "inspectie", "acte"], 2000,
          "Regim de înălțime, an, compunere și suprafețe, structură, fundație, închideri, acoperiș și învelitoare, finisaje exterioare și interioare, tâmplărie, instalații și încălzire, starea construcției.", "Descrierea construcției — caracteristici tehnice"),
        facts("caracteristici", "Caracteristici", [
          f("Suprafața terenului", "a:land_area", "s:^Suprafață teren"), f("Regim de înălțime", "s:Regim de înălțime", "a:height_regime"), f("Anul construirii", "s:^An construcție", "a:year_built"),
          f("Anul modernizării", "s:modernizării"), f("Arie utilă", "a:usable_area", "s:Suprafață utilă"), f("Arie construită la sol", "s:construită la sol"), f("Număr camere", "s:^Număr camere", "a:rooms"),
          f("Băi", "s:^Băi$"), f("Structură", "s:^Structură$"), f("Grad de finisare", "s:Nivelul finisajelor"), f("Încălzire", "s:^Încălzire"), f("Starea construcției", "s:^Starea construcției"),
        ], "Caracteristici — câmpuri scurte"),
        ai("utilitati", "Utilități · utilizare", ["inspectie"], 800, "Branșamentele, sursele proprii, încălzirea și utilizarea la data inspecției.", "Utilități și utilizarea curentă"),
        DIFERENTE, JURIDIC, AMPLASAMENT,
      ],
    }, PIATA, EVALUARE(false), ANEXE],
  },
];

export const allFields = (t: Template) => t.chapters.flatMap((c) => c.fields);

/** A template kept by the firm, checked against the default (unknown kinds and fields dropped, limits kept sane). */
function merged(def: Template, raw: unknown): Template {
  const x = (raw && typeof raw === "object" ? raw : {}) as Partial<Template>;
  const str = (v: unknown, d: string, max = 2000) => (typeof v === "string" ? v.slice(0, max) : d);
  const chapters = Array.isArray(x.chapters) ? x.chapters.map((c) => ({
    key: str(c?.key, "").slice(0, 40), title: str(c?.title, "Capitol", 80),
    fields: (Array.isArray(c?.fields) ? c.fields : []).map((y): TField | null => {
      if (!y || typeof y !== "object" || !["ai", "facts", "market", "legal"].includes(y.kind)) return null;
      const d = allFields(def).find((z) => z.key === y.key);
      return {
        key: str(y.key, "").slice(0, 40) || `camp_${Math.random().toString(36).slice(2, 8)}`, label: str(y.label, d?.label ?? "Câmp", 120), kind: y.kind,
        brd: str(y.brd, d?.brd ?? "", 200) || undefined,
        sources: (Array.isArray(y.sources) ? y.sources : []).filter((s): s is Src => SOURCES.some(([k]) => k === s)),
        prompt: str(y.prompt, d?.prompt ?? ""), limit: Math.max(0, Math.min(20000, Number(y.limit) || 0)), required: y.required !== false,
        facts: Array.isArray(y.facts) ? y.facts.filter((q) => q && typeof q.label === "string").map((q) => ({ label: q.label.slice(0, 80), from: (Array.isArray(q.from) ? q.from : []).filter((s): s is string => typeof s === "string").slice(0, 6) })) : d?.facts,
        legal: y.legal === "opis" || y.legal === "right" ? y.legal : d?.legal,
      };
    }).filter((y): y is TField => !!y),
  })).filter((c) => c.key) : def.chapters;
  const examples: Record<string, string[]> = {};
  if (x.examples && typeof x.examples === "object") for (const [k, v] of Object.entries(x.examples)) if (Array.isArray(v)) examples[k] = v.filter((s): s is string => typeof s === "string" && !!s.trim()).map((s) => s.slice(0, 4000)).slice(0, 6);
  return { ...def, name: str(x.name, def.name, 80), chapters, examples };
}

/** The templates as the firm uses them: the defaults with the changes from Setări. */
export async function loadTemplates(db: D1Database): Promise<(Template & { changed: string | null })[]> {
  const { results } = await db.prepare("SELECT key, data, updated_at FROM report_templates").all<{ key: string; data: string; updated_at: string }>().catch(() => ({ results: [] as { key: string; data: string; updated_at: string }[] }));
  return DEFAULT_TEMPLATES.map((d) => {
    const row = results.find((r) => r.key === d.key);
    if (!row) return { ...d, changed: null };
    try { return { ...merged(d, JSON.parse(row.data)), changed: row.updated_at }; } catch { return { ...d, changed: null }; }
  });
}

export async function saveTemplate(db: D1Database, key: string, data: unknown, by: string) {
  const def = DEFAULT_TEMPLATES.find((t) => t.key === key);
  if (!def) return null;
  const t = merged(def, data);
  await db.prepare("INSERT INTO report_templates (key, data, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_by = excluded.updated_by, updated_at = excluded.updated_at")
    .bind(key, JSON.stringify(t), by, now()).run();
  return t;
}

export const resetTemplate = (db: D1Database, key: string) => db.prepare("DELETE FROM report_templates WHERE key = ?").bind(key).run();

/** Adds a text to a field's style examples (the newest first, at most 6). */
export async function addExample(db: D1Database, key: string, field: string, text: string, by: string) {
  const t = (await loadTemplates(db)).find((x) => x.key === key);
  if (!t || !allFields(t).some((x) => x.key === field) || !text.trim()) return false;
  const list = [text.trim().slice(0, 4000), ...(t.examples[field] ?? []).filter((s) => s.trim() !== text.trim())].slice(0, 6);
  await saveTemplate(db, key, { ...t, examples: { ...t.examples, [field]: list } }, by);
  return true;
}

/** The template a report starts with: by the type of its main asset (land, house, else apartment). */
export function pickTemplate(list: Template[], asset: { category: string | null; type: string | null } | null) {
  const t = `${asset?.type ?? ""} ${asset?.category ?? ""}`.toLowerCase();
  const kind = /teren/.test(t) && !/cas|vil|locuin/.test(t) ? "teren" : /cas|vil|locuin.*individual/.test(t) ? "casa" : "apartament";
  return list.find((x) => x.kind === kind) ?? list[0];
}
