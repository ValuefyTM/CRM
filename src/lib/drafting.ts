// Server-only: the drafting mode of a report (Rapoarte → Redactare). For each field of the report's template it
// gathers what the CRM knows (the report's framing, the asset, its inspection sheet, the legal check of its documents,
// the market parameters set by the evaluator, the firm's valuations nearby, the texts of similar reports) and writes the
// text for the bank's application with Claude, or lists the short values to copy. The texts are kept per report and
// asset (report_drafts); what is missing is left in the text as "[de completat: …]", never made up.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { now } from "./db";
import { getReport, reportAssets } from "./reports";
import { inspectionSheetDoc, type SheetDoc } from "./insp-sheet-doc";
import { latestChecks, type LegalCheck } from "./legal-check";
import { isProblem } from "./legal-groups";
import { similarReports, type SimilarRow } from "./similar-reports";
import { allFields, loadTemplates, pickTemplate, type Template, type TField } from "./report-templates";
import type { User } from "./users";

export const draftingEnabled = () => !!process.env.ANTHROPIC_API_KEY;
/** Model for the texts: Claude Opus 5.5 by default; DRAFT_MODEL can switch it. */
const model = () => process.env.DRAFT_MODEL?.trim() || "claude-opus-5-5";

export type DraftState = "draft" | "copied" | "stale";
export type Draft = { field: string; text: string; state: DraftState; missing: string[]; gen_at: string | null; copied_at: string | null; updated_at: string };

export type Market = {
  tip_bun: string; zona: string; cerere: string; oferta: string; tendinta: string; expunere: string; echilibru: string; segment: string;
  /** the offers found by the evaluator (count, min, max, average per m²), as typed */
  oferte_nr: string; oferte_min: string; oferte_max: string; oferte_mp: string; observatii: string;
};
export const MARKET_KEYS: (keyof Market)[] = ["tip_bun", "zona", "cerere", "oferta", "tendinta", "expunere", "echilibru", "segment", "oferte_nr", "oferte_min", "oferte_max", "oferte_mp", "observatii"];
export const emptyMarket = (): Market => Object.fromEntries(MARKET_KEYS.map((k) => [k, ""])) as Market;
export const cleanMarket = (x: unknown): Market => {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  return Object.fromEntries(MARKET_KEYS.map((k) => [k, typeof o[k] === "string" ? (o[k] as string).slice(0, 600) : ""])) as Market;
};

const parse = <T,>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };

export async function draftsOf(db: D1Database, reportId: string, assetId: string): Promise<Record<string, Draft>> {
  const { results } = await db.prepare("SELECT field, text, state, missing, gen_at, copied_at, updated_at FROM report_drafts WHERE report_id = ? AND asset_id = ?").bind(reportId, assetId)
    .all<{ field: string; text: string; state: DraftState; missing: string | null; gen_at: string | null; copied_at: string | null; updated_at: string }>().catch(() => ({ results: [] as never[] }));
  return Object.fromEntries(results.map((r) => [r.field, { ...r, missing: parse<string[]>(r.missing, []) }]));
}

async function put(db: D1Database, reportId: string, assetId: string, field: string, v: { text: string; state: DraftState; missing?: string[]; model?: string | null; gen?: boolean; copied?: boolean }, by: string) {
  const at = now();
  await db.prepare(`INSERT INTO report_drafts (report_id, asset_id, field, text, state, missing, model, gen_at, copied_at, updated_by, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
      ON CONFLICT(report_id, asset_id, field) DO UPDATE SET text = excluded.text, state = excluded.state, missing = COALESCE(excluded.missing, report_drafts.missing),
        model = COALESCE(excluded.model, report_drafts.model), gen_at = COALESCE(excluded.gen_at, report_drafts.gen_at), copied_at = COALESCE(excluded.copied_at, report_drafts.copied_at),
        updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
    .bind(reportId, assetId, field, v.text, v.state, v.missing ? JSON.stringify(v.missing) : null, v.model ?? null, v.gen ? at : null, v.copied ? at : null, by, at).run();
}

// ---------- what the CRM knows about the report ----------

export type Ctx = {
  report: NonNullable<Awaited<ReturnType<typeof getReport>>>;
  asset: Awaited<ReturnType<typeof reportAssets>>[number];
  assets: Awaited<ReturnType<typeof reportAssets>>;
  sheet: SheetDoc | null;
  legal: LegalCheck | null;
  similar: SimilarRow[];
  market: Market;
  drafts: Record<string, Draft>;
  template: Template & { changed: string | null };
  templates: (Template & { changed: string | null })[];
};

/** Everything a drafting page or a text needs; null when the report or the asset is not found. */
export async function draftContext(db: D1Database, user: User, reportId: string, assetId?: string | null): Promise<Ctx | null> {
  const [report, assets, templates] = await Promise.all([getReport(db, reportId), reportAssets(db, reportId), loadTemplates(db)]);
  if (!report || !assets.length) return null;
  const asset = assets.find((a) => a.id === assetId) ?? assets.find((a) => a.is_main) ?? assets[0];
  const [sheet, checks, similar, drafts] = await Promise.all([
    asset.inspection_status === "done" ? inspectionSheetDoc(db, reportId, asset.id).catch(() => null) : Promise.resolve(null),
    latestChecks(db, reportId),
    similarReports(db, user, reportId, { radius: "2", limit: 60 }).then((s) => s.rows).catch(() => [] as SimilarRow[]),
    draftsOf(db, reportId, asset.id),
  ]);
  const chosen = drafts._template?.text;
  const template = templates.find((t) => t.key === chosen) ?? pickTemplate(templates, asset);
  return {
    report, asset, assets, sheet, legal: checks.find((c) => c.asset_id === asset.id) ?? null,
    similar: [...similar].sort((a, b) => b.score - a.score), market: cleanMarket(parse(drafts._market?.text, {})), drafts, template: template as Ctx["template"], templates,
  };
}

const roDate = (s: string | null | undefined) => (s ? s.slice(0, 10).split("-").reverse().join(".") : "");
const num = (n: number | null | undefined, u: string) => (n ? `${n.toLocaleString("ro-RO")} ${u}` : "");

/** The short values of a facts field: found in the report, the asset or the sheet (the first source that has it). */
export function factValues(f: TField, c: Ctx): { label: string; value: string }[] {
  const r = c.report, a = c.asset;
  const rep: Record<string, string> = {
    purpose: r.purpose ?? "", value_type: r.value_type ?? "", valuation_date: roDate(r.valuation_date), inspection_date: roDate(c.sheet?.inspection.done_at ?? a.done_at),
    inspector: c.sheet?.inspection.inspector ?? a.inspector ?? "", currency: r.currency ?? "", bank: r.bank_name ?? "", client: r.client_name ?? "", report_type: r.report_type ?? "",
  };
  const ast: Record<string, string> = {
    usable_area: num(a.usable_area, "mp"), land_area: num(a.land_area, "mp"), rooms: a.rooms ? String(a.rooms) : "", floor: a.floor ?? "", height_regime: a.height_regime ?? "",
    year_built: a.year_built ? String(a.year_built) : "", cf_number: a.cf_number ?? "", cad_building: a.cad_building ?? "", address: a.full_address ?? "", type: a.type ?? "",
  };
  const rows = c.sheet?.sections.flatMap((s) => s.rows) ?? [];
  const sheet = (pat: string) => {
    let re: RegExp;
    try { re = new RegExp(pat, "i"); } catch { return ""; }
    const hit = rows.filter((x) => re.test(x.label));
    return hit.length > 1 ? hit.map((x) => `${x.label}: ${x.value}`).join("; ") : hit[0]?.value ?? "";
  };
  return (f.facts ?? []).map((x) => {
    let value = "";
    for (const s of x.from) {
      value = s.startsWith("r:") ? rep[s.slice(2)] ?? "" : s.startsWith("a:") ? ast[s.slice(2)] ?? "" : s.startsWith("s:") ? sheet(s.slice(2)) : "";
      if (value) break;
    }
    return { label: x.label, value };
  });
}

/** A legal field's text: the ownership right or the inventory of the documents, from the asset's latest legal check. */
export function legalValue(f: TField, c: Ctx): string {
  const res = c.legal?.result;
  if (!res) return "";
  if (f.legal === "opis") return res.opis.map((o) => `${o.n}. ${o.title}${o.number ? ` nr. ${o.number}` : ""}${o.date ? ` din ${roDate(o.date)}` : ""}${o.issuer ? `, emis de ${o.issuer}` : ""}`).join("\n");
  return res.rightText;
}

/** Whether a field counts as done in the table of contents. */
export function fieldDone(f: TField, c: Ctx) {
  const d = c.drafts[f.key];
  if (f.kind === "facts") {
    const vals = factValues(f, c).filter((x) => x.value);
    const copied = parse<string[]>(d?.text, []);
    return d?.state === "copied" || (vals.length > 0 && vals.every((x) => copied.includes(x.label)));
  }
  if (f.kind === "market") return d?.state === "copied";
  return d?.state === "copied";
}

// ---------- the text sent to Claude ----------

const lines = (rows: [string, string | number | null | undefined][]) => rows.filter(([, v]) => v != null && v !== "").map(([k, v]) => `- ${k}: ${v}`).join("\n");

function contextText(c: Ctx, f: TField): string {
  const r = c.report, a = c.asset, out: string[] = [];
  const has = (s: string) => f.sources.includes(s as never);
  if (has("raport")) out.push(`# Raportul\n${lines([["Nr.", r.number], ["Utilizator desemnat (banca)", r.bank_name], ["Agenția", r.bank_branch], ["Client", r.client_name], ["Scopul evaluării", r.purpose],
    ["Tipul valorii", r.value_type], ["Tipul raportului", r.report_type], ["Data evaluării", roDate(r.valuation_date)], ["Moneda", r.currency], ["Emitent", r.issuer_name]])}`);
  if (has("bun") || has("inspectie") || has("acte")) out.push(`# Bunul (din CRM)\n${lines([["Tip", a.type], ["Categorie", a.category], ["Construcție", a.construction === "under_construction" ? "în construcție" : null],
    ["Adresa", [a.full_address, a.city && !(a.full_address ?? "").toLowerCase().includes(a.city.toLowerCase()) ? a.city : null, a.county && `jud. ${a.county}`].filter(Boolean).join(", ")], ["Carte funciară", a.cf_number], ["Nr. cadastral construcție", a.cad_building], ["Nr. cadastral teren", a.cad_land],
    ["Suprafață utilă", num(a.usable_area, "mp")], ["Suprafață teren", num(a.land_area, "mp")], ["Camere", a.rooms], ["Etaj", a.floor], ["Regim de înălțime", a.height_regime], ["An construcție", a.year_built],
    ["Descriere", a.description], ["Valoarea propusă de evaluator", a.value ? `${a.value.toLocaleString("ro-RO")} lei${a.value_eur ? ` (${a.value_eur.toLocaleString("ro-RO")} EUR)` : ""}` : null], ["Abordare", a.approach]])}`);
  if (has("inspectie")) {
    const s = c.sheet;
    out.push(!s ? "# Fișa de inspecție\nNu există o fișă de inspecție finalizată pentru acest bun." : [
      `# Fișa de inspecție (${s.inspection.inspector ?? "inspector"}, ${roDate(s.inspection.done_at)}${s.sheet.present ? `, în prezența: ${s.sheet.present}${s.sheet.role ? ` (${s.sheet.role})` : ""}` : ""})`,
      ...s.sections.map((x) => `## ${x.title}\n${x.rows.map((y) => `- ${y.label}: ${y.value}`).join("\n")}`),
      s.rooms.length ? `## Încăperi (releveu)\n${s.rooms.map((m) => `- ${m.pos}. ${m.name}${m.area ? `, ${m.area} mp` : ""}${m.level ? `, ${m.level}` : ""}${m.floor?.length ? `; pardoseală: ${m.floor.join(", ")}` : ""}${m.walls?.length ? `; pereți: ${m.walls.join(", ")}` : ""}${m.ceiling ? `; plafon: ${m.ceiling}` : ""}${m.condition ? `; stare: ${m.condition}` : ""}${m.notes ? `; ${m.notes}` : ""}`).join("\n")}` : "",
      s.notes ? `## Observațiile inspectorului\n${s.notes}` : "",
    ].filter(Boolean).join("\n"));
  }
  if (has("acte")) {
    const l = c.legal?.result;
    out.push(!l ? "# Actele\nAnaliza juridică a actelor nu a fost rulată." : [
      `# Actele (analiza juridică din ${roDate(c.legal!.created_at)})`,
      `Dreptul de proprietate: ${l.rightText}`,
      l.owners.length ? `Proprietari: ${l.owners.map((o) => `${o.name}${o.share ? ` (${o.share})` : ""}`).join(", ")}` : "",
      l.encumbrances.length ? `Sarcini: ${l.encumbrances.map((e) => `${e.detail}${e.beneficiary ? `, în favoarea ${e.beneficiary}` : ""}`).join("; ")}` : "Sarcini: niciuna găsită în acte.",
      ...l.concordance.filter((x) => x.values.some((v) => v.off)).map((x) => `Neconcordanță la ${x.field}: ${x.values.map((v) => `${v.doc} = ${v.value ?? "—"}`).join("; ")}`),
      ...l.issues.filter((i) => isProblem(i) && !c.legal!.resolved[i.key]).map((i) => `Problemă (${i.level}): ${i.title}${/[.!?]$/.test(i.title) ? "" : "."} ${i.detail}`),
      `Documente: ${l.opis.map((o) => `${o.title}${o.number ? ` nr. ${o.number}` : ""}${o.date ? ` din ${roDate(o.date)}` : ""}`).join("; ")}`,
    ].filter(Boolean).join("\n"));
  }
  if (has("piata")) {
    const m = c.market;
    out.push(`# Parametrii pieței (stabiliți de evaluator)\n${lines([["Tipul bunului / segment", m.tip_bun], ["Zona", m.zona], ["Cererea", m.cerere], ["Oferta", m.oferta], ["Tendința prețului", m.tendinta],
      ["Timp de expunere", m.expunere], ["Echilibrul pieței", m.echilibru], ["Segment de preț", m.segment], ["Oferte identificate", m.oferte_nr], ["Oferta minimă", m.oferte_min], ["Oferta maximă", m.oferte_max],
      ["Preț mediu pe mp", m.oferte_mp], ["Observații", m.observatii]]) || "Nu au fost stabiliți."}`);
  }
  if (has("comparabile")) {
    const rows = c.similar.filter((x) => x.value).slice(0, 10);
    out.push(rows.length ? `# Proprietăți similare evaluate de firmă în zonă (valori în lei, din rapoarte anterioare; nu sunt oferte de piață)\n${rows.map((x) =>
      `- ${x.type ?? "bun"}, ${x.address ?? x.city ?? ""}, ${x.usable_area ? `${x.usable_area} mp utili` : x.land_area ? `${x.land_area} mp teren` : ""}${x.year_built ? `, an ${x.year_built}` : ""}, la ${x.km.toLocaleString("ro-RO")} km, evaluată ${roDate(x.date)}: ${x.value!.toLocaleString("ro-RO")} lei${x.sqm ? ` (${x.sqm.toLocaleString("ro-RO")} lei/mp)` : ""}`).join("\n")}`
      : "# Proprietăți similare evaluate de firmă în zonă\nNiciuna în raza de 2 km.");
  }
  if (has("capitole")) {
    const done = allFields(c.template).filter((x) => x.key !== f.key && x.kind === "ai" && c.drafts[x.key]?.text).map((x) => `## ${x.label}\n${c.drafts[x.key].text}`);
    if (done.length) out.push(`# Texte deja scrise în acest raport\n${done.join("\n")}`);
  }
  return out.join("\n\n");
}

/** Texts of the same field from the most similar reports (as copied into the bank's application), for the style. */
async function similarTexts(db: D1Database, c: Ctx, field: string) {
  const ids = c.similar.slice(0, 12).map((x) => x.report_id);
  if (!ids.length) return [];
  const { results } = await db.prepare(`SELECT text FROM report_drafts WHERE field = ? AND state = 'copied' AND text <> '' AND report_id IN (${ids.map(() => "?").join(", ")}) ORDER BY updated_at DESC LIMIT 3`)
    .bind(field, ...ids).all<{ text: string }>().catch(() => ({ results: [] as { text: string }[] }));
  return results.map((r) => r.text);
}

const SYSTEM = `Ești evaluator autorizat ANEVAR și scrii textele unui raport de evaluare imobiliară pentru garantarea unui împrumut bancar. Textele se copiază câmp cu câmp în aplicația băncii.
Reguli:
- Scrii în limba română, la persoana a III-a, în stilul tehnic al rapoartelor de evaluare, fără formulări de marketing.
- Folosești doar informațiile date. Nu inventezi cifre, ani, suprafețe, materiale, prețuri sau nume.
- Unde lipsește o informație necesară câmpului, scrii exact „[de completat: ce lipsește]” în text și o treci și în lista „missing”.
- Text simplu, fără markdown, fără titluri, fără liste cu simboluri; paragrafe separate prin rând nou doar dacă ajută.
- Respecți limita de caractere a câmpului.
- Dacă primești exemple de stil, imiți tonul și ordinea lor, nu le copiezi conținutul.`;

const Out = z.object({
  text: z.string().describe("Textul câmpului, gata de copiat în aplicația băncii"),
  missing: z.array(z.string()).describe("Informațiile lipsă marcate în text cu [de completat: …]; gol dacă nu lipsește nimic"),
});

export type Mode = "new" | "shorter" | "longer" | "rewrite";

/** Writes (or rewrites) one field with Claude and keeps the text. */
export async function writeField(db: D1Database, c: Ctx, field: string, mode: Mode, wish: string, by: string) {
  if (!draftingEnabled()) return { ok: false as const, error: "Scrierea cu AI nu este configurată (ANTHROPIC_API_KEY)." };
  const f = allFields(c.template).find((x) => x.key === field && x.kind === "ai");
  if (!f) return { ok: false as const, error: "Câmpul nu există în machetă." };
  const current = c.drafts[f.key]?.text ?? "";
  const examples = [...(c.template.examples[f.key] ?? []), ...(await similarTexts(db, c, f.key))].slice(0, 4);
  const ask = mode === "shorter" && current ? `Scurtează textul actual la aproximativ 60% din lungime, păstrând informațiile esențiale.`
    : mode === "longer" && current ? `Detaliază textul actual cu informațiile din date care nu au fost folosite încă (fără a inventa), în limita de caractere.`
    : mode === "rewrite" && current ? `Rescrie textul actual${wish ? ` după indicația evaluatorului: ${wish}` : " cu altă formulare"}.`
    : "Scrie textul câmpului.";
  const prompt = [
    `Câmpul: ${f.label}${f.brd ? ` (în aplicația băncii: „${f.brd}”)` : ""}`,
    `Macheta: ${c.template.name}`,
    `Ce trebuie să cuprindă: ${f.prompt}`,
    f.limit ? `Limita: maximum ${f.limit} caractere.` : "",
    contextText(c, f),
    examples.length ? `# Exemple de stil (din alte rapoarte ale firmei)\n${examples.map((e, i) => `Exemplul ${i + 1}:\n${e}`).join("\n\n")}` : "",
    current && mode !== "new" ? `# Textul actual\n${current}` : "",
    `# Cerința\n${ask}`,
  ].filter(Boolean).join("\n\n");
  try {
    const m = model();
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.beta.messages.parse({
      model: m,
      max_tokens: 8000,
      system: SYSTEM,
      output_config: { effort: "low", format: betaZodOutputFormat(Out) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: prompt }],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) return { ok: false as const, error: "Textul nu a putut fi scris. Încearcă din nou." };
    const text = res.parsed_output.text.trim(), missing = res.parsed_output.missing.filter((x) => x.trim()).slice(0, 12);
    await put(db, c.report.id, c.asset.id, f.key, { text, state: "draft", missing, model: m, gen: true }, by);
    return { ok: true as const, text, missing };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ok: false as const, error: "Serviciul AI e ocupat; încearcă din nou peste un minut." };
    if (e instanceof Anthropic.APIError) {
      console.error("draft", c.report.id, f.key, e.status, e.message);
      return { ok: false as const, error: `Serviciul AI a răspuns cu eroare (${e.status ?? "eroare"}).` };
    }
    throw e;
  }
}

const Proposal = z.object({
  tip_bun: z.string().describe("Tipul bunului și segmentul, scurt: ex. „Apartament 3 camere, bloc nou”"),
  zona: z.string().describe("Zona și caracterul ei, scurt: ex. „Aradului Est · periferică”"),
  cerere: z.enum(["mică", "medie", "mare"]),
  oferta: z.enum(["redusă", "medie", "ridicată"]),
  tendinta: z.string().describe("Tendința prețului în ultimele 12 luni, scurt"),
  expunere: z.string().describe("Timpul de expunere estimat, ex. „3–9 luni”"),
  echilibru: z.enum(["Oferta > Cererea", "Oferta ≈ Cererea", "Oferta < Cererea"]),
  segment: z.string().describe("Segmentul de preț, doar dacă reiese din date; altfel „”"),
});

/** Proposes the market parameters from the asset, its sheet and the firm's valuations nearby (the evaluator confirms them). */
export async function proposeMarket(c: Ctx) {
  if (!draftingEnabled()) return { ok: false as const, error: "Scrierea cu AI nu este configurată (ANTHROPIC_API_KEY)." };
  const f: TField = { key: "piata_parametri", label: "Parametrii pieței", kind: "market", sources: ["bun", "inspectie", "comparabile", "piata"], prompt: "", limit: 0, required: true };
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.beta.messages.parse({
      model: model(),
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { effort: "low", format: betaZodOutputFormat(Proposal) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: `Propune parametrii pieței relevante pentru acest bun, pe baza datelor de mai jos. Sunt o propunere pe care evaluatorul o verifică; unde datele nu ajung, alege varianta prudentă.\n\n${contextText(c, f)}` }],
    });
    if (!res.parsed_output) return { ok: false as const, error: "Parametrii nu au putut fi propuși." };
    return { ok: true as const, market: { ...c.market, ...res.parsed_output } };
  } catch (e) {
    if (e instanceof Anthropic.APIError) { console.error("market", c.report.id, e.status, e.message); return { ok: false as const, error: `Serviciul AI a răspuns cu eroare (${e.status ?? "eroare"}).` }; }
    throw e;
  }
}

// ---------- the evaluator's changes ----------

export async function saveText(db: D1Database, c: Ctx, field: string, text: string, by: string) {
  if (!allFields(c.template).some((x) => x.key === field && x.kind === "ai")) return false;
  const t = text.slice(0, 20000);
  await put(db, c.report.id, c.asset.id, field, { text: t, state: "draft", missing: [...t.matchAll(/\[de completat:\s*([^\]]+)\]/gi)].map((m) => m[1].trim()) }, by);
  return true;
}

/** Marks a field as copied into the bank's application (a facts field: one more value copied). */
export async function markCopied(db: D1Database, c: Ctx, field: string, value: string | null, by: string) {
  const f = allFields(c.template).find((x) => x.key === field);
  if (!f) return false;
  const d = c.drafts[field];
  if (f.kind === "facts") {
    const list = parse<string[]>(d?.text, []);
    const next = value ? [...new Set([...list, value])] : factValues(f, c).filter((x) => x.value).map((x) => x.label);
    const all = factValues(f, c).filter((x) => x.value).every((x) => next.includes(x.label));
    await put(db, c.report.id, c.asset.id, field, { text: JSON.stringify(next), state: all ? "copied" : "draft", copied: all }, by);
    return true;
  }
  if (f.kind === "legal") { await put(db, c.report.id, c.asset.id, field, { text: legalValue(f, c), state: "copied", copied: true }, by); return true; }
  if (f.kind !== "ai" || !d?.text) return false;
  await put(db, c.report.id, c.asset.id, field, { text: d.text, state: "copied", copied: true }, by);
  return true;
}

/** Keeps the market parameters (confirmed by the evaluator); the market texts written before become "de rescris". */
export async function saveMarket(db: D1Database, c: Ctx, m: Market, by: string) {
  const before = JSON.stringify(c.market), after = JSON.stringify(m);
  await put(db, c.report.id, c.asset.id, "_market", { text: after, state: "copied", copied: true }, by);
  const market = allFields(c.template).find((x) => x.kind === "market");
  if (market) await put(db, c.report.id, c.asset.id, market.key, { text: "", state: "copied", copied: true }, by);
  if (before !== after) {
    const keys = allFields(c.template).filter((x) => x.kind === "ai" && x.sources.includes("piata")).map((x) => x.key);
    if (keys.length) await db.prepare(`UPDATE report_drafts SET state = 'stale' WHERE report_id = ? AND asset_id = ? AND text <> '' AND field IN (${keys.map(() => "?").join(", ")})`)
      .bind(c.report.id, c.asset.id, ...keys).run();
  }
}

export async function chooseTemplate(db: D1Database, c: Ctx, key: string, by: string) {
  if (!c.templates.some((t) => t.key === key)) return false;
  await put(db, c.report.id, c.asset.id, "_template", { text: key, state: "copied" }, by);
  return true;
}
