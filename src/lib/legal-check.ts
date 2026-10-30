// Server-only: the legal check of an asset's documents (Acte & livrare → Analiză juridică), run on demand. Each document
// is read once with Claude (what it is, its number, date and issuer, the owners, the transfers, the encumbrances) and
// the reading is kept (doc_extracts); then fixed rules in code — not the model's opinion — check that the file is
// complete, that nothing has expired, that the documents agree with each other and with the CRM, and rebuild the chain
// of ownership. The result also gives the inventory of the documents (opis) and the description of the ownership right,
// ready to paste into the report. An assisted check, not a legal opinion: every finding names its document.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { now, uuid } from "./db";
import { bucket } from "./orders";
import { validCnp } from "./id-card";
import { fold } from "./places";
import { groupOf, verdictOf } from "./legal-groups";

export const legalEnabled = () => !!process.env.ANTHROPIC_API_KEY;
/** Model for reading the documents: Claude Sonnet 5.5 by default; LEGAL_MODEL can switch it (e.g. claude-opus-5-5). */
const model = () => process.env.LEGAL_MODEL?.trim() || "claude-sonnet-5-5";

// ---------- what is read from one document ----------

export const DOC_TYPES = [
  ["extras_cf", "Extras de carte funciară"], ["contract_vanzare", "Contract de vânzare-cumpărare"], ["certificat_mostenitor", "Certificat de moștenitor"],
  ["donatie", "Contract de donație"], ["partaj", "Act de partaj"], ["hotarare", "Hotărâre judecătorească"], ["titlu_alt", "Alt titlu de proprietate"],
  ["autorizatie_construire", "Autorizație de construire"], ["pv_receptie", "Proces-verbal de recepție"], ["releveu", "Releveu"],
  ["documentatie_cadastrala", "Documentație cadastrală"], ["certificat_energetic", "Certificat de performanță energetică"],
  ["certificat_fiscal", "Certificat de atestare fiscală"], ["act_identitate", "Act de identitate"], ["alt", "Alt document"],
] as const;
type DocType = (typeof DOC_TYPES)[number][0];
const TYPE_LABEL = Object.fromEntries(DOC_TYPES) as Record<DocType, string>;
const TITLES: DocType[] = ["contract_vanzare", "certificat_mostenitor", "donatie", "partaj", "hotarare", "titlu_alt"];

// The schema asks for plain values ("" / 0 / false when missing), never null: structured outputs allow only a few
// optional (union-typed) fields, and a document has dozens. `clean` turns the blanks into nulls afterwards.
const S = (d: string) => z.string().describe(`${d}; "" dacă lipsește`);
const N = (d: string) => z.number().describe(`${d}; 0 dacă lipsește`);
const Person = z.object({
  name: z.string().describe("Numele complet, exact cum e scris"),
  id_code: S("CNP sau CUI, exact cum apare"),
  share: S("Cota-parte, ex. 1/1, 1/2"),
});
const Raw = z.object({
  doc_type: z.enum(DOC_TYPES.map(([k]) => k) as [DocType, ...DocType[]]),
  readable: z.boolean().describe("false dacă actul e în mare parte ilizibil sau incomplet scanat"),
  unreadable_note: S("Ce nu se poate citi (ex. pagina 2 neclară)"),
  title: z.string().describe("Denumirea actului, scurtă, ca într-un opis: ex. „Contract de vânzare-cumpărare autentificat”, „Extras de carte funciară pentru informare”"),
  act_number: S("Numărul actului (nr. autentificare, nr. certificat, nr. cerere / încheiere la CF)"),
  issue_date: S("Data emiterii / autentificării, YYYY-MM-DD"),
  issuer: S("Emitentul: notarul public (BNP …), OCPI / BCPI, primăria, instanța, auditorul energetic, firma de cadastru"),
  valid_until: S("Valabil până la, YYYY-MM-DD, dacă e scris"),
  cf_number: S("Numărul cărții funciare"),
  cf_locality: S("UAT-ul / localitatea cărții funciare"),
  cad_numbers: z.array(z.string()).describe("Numere cadastrale / topografice ale imobilului"),
  address: S("Adresa imobilului"),
  usable_area: N("Suprafața utilă, mp"),
  built_area: N("Suprafața construită, mp"),
  land_area: N("Suprafața terenului, mp"),
  current_owners: z.array(Person.extend({
    acquired_by: S("Actul prin care a dobândit, ex. „contract de vânzare-cumpărare aut. nr. 1234/08.03.2021 de BNP X”"),
    cf_entry: S("Încheierea de intabulare, nr. și data"),
  })).describe("Proprietarii actuali conform actului (la extrasul CF: înscrierile în vigoare din partea a II-a; la un contract: cumpărătorii)"),
  transfers: z.array(z.object({
    from: z.array(z.string()).describe("Cei care transmit dreptul (vânzător, defunct, donator); gol la prima înscriere sau construire"),
    to: z.array(Person),
    act: z.string().describe("Tipul actului: contract de vânzare-cumpărare, certificat de moștenitor, donație, partaj, hotărâre, Legea 112/1995, construire…"),
    act_number: S("Numărul actului"), act_date: S("Data actului, YYYY-MM-DD"),
    issuer: S("Emitentul actului"),
    registered_in_cf: z.boolean().describe("true doar dacă documentul arată înscrierea în CF (încheiere / intabulare)"),
    page: N("Pagina"),
  })).describe("Toate transmisiunile de proprietate (la extrasul CF: istoricul din partea a II-a, inclusiv cele radiate; la un act: transmisiunea lui și titlul anterior invocat)"),
  encumbrances: z.array(z.object({
    kind: z.enum(["ipoteca", "sechestru", "litigiu", "interdictie", "servitute", "uzufruct", "alta"]),
    detail: z.string(), beneficiary: S("Beneficiarul"), date: S("Data, YYYY-MM-DD"),
    active: z.boolean().describe("false dacă e radiată"), page: N("Pagina"),
  })).describe("Sarcini: CF partea a III-a, sau menționate în act"),
  notes: S("Erori vizibile, ștersături, mențiuni neobișnuite, pe scurt"),
});

type P = { name: string; id_code: string | null; share: string | null };
/** What is kept from a document: the schema's blanks as nulls. */
export type DocRead = {
  doc_type: DocType; readable: boolean; unreadable_note: string | null; title: string; act_number: string | null; issue_date: string | null; issuer: string | null;
  valid_until: string | null; cf_number: string | null; cf_locality: string | null; cad_numbers: string[]; address: string | null;
  usable_area: number | null; built_area: number | null; land_area: number | null;
  current_owners: (P & { acquired_by: string | null; cf_entry: string | null })[];
  transfers: { from: string[]; to: P[]; act: string; act_number: string | null; act_date: string | null; issuer: string | null; registered_in_cf: boolean | null; page: number | null }[];
  encumbrances: { kind: "ipoteca" | "sechestru" | "litigiu" | "interdictie" | "servitute" | "uzufruct" | "alta"; detail: string; beneficiary: string | null; date: string | null; active: boolean; page: number | null }[];
  notes: string | null;
};

/** "" → null, 0 → null (deep), keeping the names and the lists. */
function clean(v: unknown, key = ""): unknown {
  if (typeof v === "string") return v.trim() === "" && !["name", "title", "act", "detail"].includes(key) ? null : v.trim();
  if (typeof v === "number") return v === 0 ? null : v;
  if (Array.isArray(v)) return v.map((x) => clean(x)).filter((x) => x !== null); // a blank name in a list: dropped
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x, k)]));
  return v;
}

const PROMPT = `Este un act al unui imobil din România, pentru evaluarea lui (extras de carte funciară, act de proprietate, releveu, certificat energetic etc.).
Citește-l cu atenție și extrage datele cerute. Completează doar ce apare scris în act; lasă null sau listă goală ce lipsește sau e ilizibil — nu ghici și nu completa din presupuneri.
Păstrează exact numele, CNP-urile, numerele de CF, cadastrale și de acte. Datele în format YYYY-MM-DD.
La extrasul de carte funciară: partea a II-a dă proprietarii și istoricul transmisiunilor (cu încheierile), partea a III-a sarcinile (ipoteci, sechestre, litigii, interdicții, radiate sau nu).`;

// ---------- the documents of an asset ----------

export type LegalDoc = { ref: string; name: string; kind: string | null; key: string; type: string | null; at: string | null; size: number | null; read?: DocRead | null; error?: string };

/** The source documents of the asset (its own, the report's and the order's), uploaded and with a file. */
export async function assetDocs(db: D1Database, reportId: string, assetId: string): Promise<LegalDoc[]> {
  const [rd, od] = await Promise.all([
    db.prepare(`SELECT id, filename, doc_type, r2_key, content_type, size_bytes, created_at FROM report_documents
      WHERE report_id = ? AND kind = 'source' AND status = 'uploaded' AND r2_key IS NOT NULL AND r2_key <> '' AND (asset_id = ? OR asset_id IS NULL OR asset_id = '')
      ORDER BY created_at`).bind(reportId, assetId)
      .all<{ id: string; filename: string; doc_type: string | null; r2_key: string; content_type: string | null; size_bytes: number | null; created_at: string }>(),
    db.prepare(`SELECT d.id, d.filename, d.kind, d.r2_key, d.content_type, d.size_bytes, d.created_at FROM order_documents d JOIN reports r ON r.order_id = d.order_id
      WHERE r.id = ? ORDER BY d.created_at`).bind(reportId)
      .all<{ id: string; filename: string; kind: string; r2_key: string; content_type: string | null; size_bytes: number | null; created_at: string }>(),
  ]);
  return [
    ...rd.results.map((d) => ({ ref: `r:${d.id}`, name: d.filename, kind: d.doc_type, key: d.r2_key, type: d.content_type, at: d.created_at, size: d.size_bytes })),
    ...od.results.map((d) => ({ ref: `o:${d.id}`, name: d.filename, kind: d.kind, key: d.r2_key, type: d.content_type, at: d.created_at, size: d.size_bytes })),
  ];
}

const IMAGE = /^image\/(png|jpe?g|webp|gif)$/;
// base64 grows a file by a third: 20 MB stays under the 32 MB of a request
const MAX_BYTES = 20_000_000;

/** Reads one document (or takes what was read before: an uploaded file does not change). */
async function readDoc(db: D1Database, client: Anthropic, d: LegalDoc): Promise<LegalDoc> {
  const kept = await db.prepare("SELECT data FROM doc_extracts WHERE ref = ?").bind(d.ref).first<{ data: string }>().catch(() => null);
  if (kept) { try { return { ...d, read: JSON.parse(kept.data) as DocRead }; } catch { /* read again */ } }
  if (d.size && d.size > MAX_BYTES) return { ...d, error: "Fișier prea mare pentru citire (peste 20 MB): încarcă o variantă comprimată." };
  const obj = await (await bucket())?.get(d.key);
  if (!obj) return { ...d, error: "Fișierul nu a fost găsit în stocare." };
  const type = (obj.httpMetadata?.contentType ?? d.type ?? (/\.pdf$/i.test(d.name) ? "application/pdf" : "")).toLowerCase().replace("image/jpg", "image/jpeg");
  const data = Buffer.from(await obj.arrayBuffer()).toString("base64");
  let block: Anthropic.Beta.BetaContentBlockParam;
  if (type === "application/pdf") block = { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  else if (IMAGE.test(type)) block = { type: "image", source: { type: "base64", media_type: type as "image/png" | "image/jpeg" | "image/webp" | "image/gif", data } };
  else return { ...d, error: "Doar PDF sau imagini (PNG, JPG) pot fi citite." };
  try {
    const m = model();
    const res = await client.beta.messages.parse({
      model: m,
      max_tokens: 16000,
      output_config: { effort: "medium", format: betaZodOutputFormat(Raw) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: [block, { type: "text", text: `${PROMPT}\nNumele fișierului: ${d.name}` }] }],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) return { ...d, error: res.stop_reason === "max_tokens" ? "Actul e prea lung pentru o singură citire." : "Actul nu a putut fi citit." };
    const read = clean(res.parsed_output) as DocRead;
    await db.prepare("INSERT INTO doc_extracts (ref, model, data, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(ref) DO UPDATE SET model = excluded.model, data = excluded.data, created_at = excluded.created_at")
      .bind(d.ref, m, JSON.stringify(read), now()).run();
    return { ...d, read };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ...d, error: "Serviciul de citire e ocupat; rulează din nou peste un minut." };
    if (e instanceof Anthropic.APIError) {
      console.error("legal read", d.ref, e.status, e.message);
      // the service's own reason (e.g. a PDF it cannot open, too many pages), so it can be acted on
      const why = (e.error as { error?: { message?: string } } | undefined)?.error?.message ?? e.message;
      return { ...d, error: `Actul nu a putut fi citit de serviciul AI (${e.status ?? "eroare"}): ${String(why).slice(0, 200)}` };
    }
    throw e;
  }
}

// ---------- the rules ----------

export type Level = "critic" | "atentie" | "info";
export type Issue = { key: string; level: Level; title: string; detail: string; source: string; request?: string };
export type ChainStep = { from: string[]; to: { name: string; share: string | null }[]; act: string; number: string | null; date: string | null; issuer: string | null; registered: boolean; broken: boolean; source: string };
export type Encumbrance = { kind: string; detail: string; beneficiary: string | null; date: string | null; source: string };
export type OpisRow = { n: number; title: string; number: string | null; date: string | null; issuer: string | null; ref: string };
export type DocSummary = { ref: string; name: string; type: string | null; title: string | null; number: string | null; date: string | null; issuer: string | null; ok: boolean; error: string | null };
export type LegalResult = {
  verdict: "ok" | "incomplete" | "problems";
  refDate: string; issues: Issue[];
  concordance: { field: string; values: { doc: string; value: string | null; off: boolean }[] }[];
  chain: ChainStep[]; owners: { name: string; share: string | null }[]; encumbrances: Encumbrance[];
  opis: OpisRow[]; rightText: string; clientRequest: string; docs: DocSummary[];
};

type Subject = { category: string | null; type: string | null; construction: string | null; year_built: number | null; cf_number: string | null; cad_building: string | null; cad_land: string | null;
  usable_area: number | null; land_area: number | null; full_address: string | null; city: string | null; purpose: string | null; valuation_date: string | null; bank: string | null };

const day = (s: string | null | undefined) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
const ro = (s: string | null) => (s ? s.split("-").reverse().join(".") : "");
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const label = (d: LegalDoc) => (d.read ? `${d.read.title}${d.read.act_number ? ` nr. ${d.read.act_number}` : ""}` : d.name);

/** "Popescu Ioan" ≈ "POPESCU ION": same tokens, each equal or one letter apart. */
function lev(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const m = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = m[0]; m[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = m[j]; m[j] = Math.min(m[j] + 1, m[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return m[b.length];
}
const toks = (n: string) => fold(n).replace(/[^a-z ]/g, " ").split(" ").filter((t) => t.length > 1).sort();
/** 2: the same name, 1: almost (a letter apart, a name missing), 0: someone else. */
export function sameName(a: string, b: string) {
  const x = toks(a), y = toks(b);
  if (!x.length || !y.length) return 0;
  if (x.join(" ") === y.join(" ")) return 2;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  const all = s.every((t) => l.some((u) => u === t || lev(t, u) <= 1));
  return all ? 1 : 0;
}
const shareVal = (s: string | null) => { const m = s?.match(/(\d+)\s*\/\s*(\d+)/); return m ? Number(m[1]) / Number(m[2]) : null; };

export function evaluate(docs: LegalDoc[], s: Subject): LegalResult {
  const ref = day(s.valuation_date) ?? now().slice(0, 10);
  const issues: Issue[] = [];
  const add = (i: Issue) => { if (!issues.some((x) => x.key === i.key)) issues.push(i); };
  const read = docs.filter((d) => d.read && d.read.readable);
  const of = (t: DocType) => read.filter((d) => d.read!.doc_type === t);
  const building = !/TEREN/.test(s.category ?? "") && !/^TEREN/.test(s.type ?? "");
  const bankUse = /credit|garan|ipotec|banc/i.test(s.purpose ?? "") || !!s.bank;

  // unread documents
  for (const d of docs) {
    if (d.error) add({ key: `read:${d.ref}`, level: "atentie", title: `Actul „${d.name}” nu a putut fi citit.`, detail: d.error, source: d.name, request: `o copie lizibilă a actului „${d.name}”` });
    else if (d.read && !d.read.readable) add({ key: `read:${d.ref}`, level: "atentie", title: `„${d.name}” e greu lizibil.`, detail: d.read.unreadable_note ?? "Scan neclar sau incomplet.", source: d.name, request: `o copie lizibilă a actului „${d.read.title}”` });
  }

  // 1. complete file
  const cfs = of("extras_cf").sort((a, b) => (day(b.read!.issue_date) ?? "").localeCompare(day(a.read!.issue_date) ?? ""));
  const cf = cfs[0];
  if (!cf) add({ key: "miss:cf", level: "critic", title: "Lipsește extrasul de carte funciară.", detail: "Fără extras CF nu se pot verifica proprietarii și sarcinile.", source: "dosar", request: "extras de carte funciară pentru informare, emis în ultimele 30 de zile" });
  if (!TITLES.some((t) => of(t).length)) add({ key: "miss:title", level: "critic", title: "Lipsește actul de proprietate.", detail: "Niciun contract, certificat de moștenitor, donație, partaj sau hotărâre între actele citite.", source: "dosar", request: "actul de proprietate (contract, certificat de moștenitor, donație etc.)" });
  if (building && !of("releveu").length && !of("documentatie_cadastrala").length) add({ key: "miss:rlv", level: "atentie", title: "Lipsește releveul / documentația cadastrală.", detail: "Necesar pentru suprafețe și compartimentare.", source: "dosar", request: "releveul sau documentația cadastrală a imobilului" });
  if (building && bankUse && !of("certificat_energetic").length) add({ key: "miss:cpe", level: "info", title: "Lipsește certificatul energetic.", detail: "De regulă cerut de bănci pentru credite cu garanție imobiliară.", source: "dosar", request: "certificatul de performanță energetică" });
  const newBuild = s.construction === "under_construction" || (!!s.year_built && s.year_built >= new Date().getFullYear() - 3);
  if (building && newBuild) {
    if (!of("autorizatie_construire").length) add({ key: "miss:ac", level: "atentie", title: "Lipsește autorizația de construire.", detail: "Construcție nouă sau în curs.", source: "dosar", request: "autorizația de construire" });
    if (s.construction !== "under_construction" && !of("pv_receptie").length) add({ key: "miss:pv", level: "atentie", title: "Lipsește procesul-verbal de recepție.", detail: "Construcție nouă finalizată.", source: "dosar", request: "procesul-verbal de recepție la terminarea lucrărilor" });
  }

  // 2. expired
  const cfDate = cf ? day(cf.read!.issue_date) : null;
  if (cf && cfDate) {
    const age = days(cfDate, ref);
    if (age > 30) add({ key: "exp:cf", level: "atentie", title: `Extras CF de acum ${age} de zile.`, detail: `Emis ${ro(cfDate)}${bankUse ? `; ${s.bank ?? "banca"} cere de regulă un extras de cel mult 30 de zile la data evaluării` : "; peste 30 de zile la data evaluării"}.`, source: label(cf), request: "un extras de carte funciară pentru informare nou (cel mult 30 de zile)" });
  }
  for (const d of read) {
    const r = d.read!, at = day(r.issue_date), until = day(r.valid_until);
    if (r.doc_type === "certificat_energetic" && at && !until && days(at, ref) > 3652) add({ key: `exp:${d.ref}`, level: "atentie", title: `Certificat energetic expirat (emis ${ro(at)}, valabil 10 ani).`, detail: "Pentru credit sau vânzare e nevoie de unul valabil.", source: label(d), request: "un certificat de performanță energetică valabil" });
    if (until && until < ref) add({ key: `exp:${d.ref}`, level: "atentie", title: `${r.title} expirat la ${ro(until)}.`, detail: `Data evaluării: ${ro(ref)}.`, source: label(d), request: `${r.title.toLowerCase()} valabil` });
    if (at && at > ref) add({ key: `late:${d.ref}`, level: "info", title: `${r.title} e emis după data evaluării (${ro(at)}).`, detail: `Data evaluării: ${ro(ref)}.`, source: label(d) });
    if (r.doc_type === "autorizatie_construire" && until && until < ref && !of("pv_receptie").length) add({ key: `ac:${d.ref}`, level: "atentie", title: "Autorizația de construire a expirat, fără recepție.", detail: `Valabilă până la ${ro(until)}.`, source: label(d), request: "prelungirea autorizației sau procesul-verbal de recepție" });
  }

  // 3. errors in the documents
  for (const d of read) {
    const r = d.read!;
    for (const p of [...r.current_owners, ...r.transfers.flatMap((t) => t.to)]) {
      const c = digits(p.id_code);
      if (c.length === 13 && !validCnp(c)) add({ key: `cnp:${c}`, level: "atentie", title: `CNP invalid pentru ${p.name}: ${c}.`, detail: "Cifra de control nu se potrivește: eroare în act sau la citire; de verificat pe act.", source: label(d) });
    }
    if (r.notes) add({ key: `note:${d.ref}`, level: "info", title: `Observație la ${r.title}.`, detail: r.notes, source: label(d) });
  }
  if (cf) {
    const shares = cf.read!.current_owners.map((o) => shareVal(o.share));
    if (shares.length && shares.every((x) => x != null)) {
      const sum = shares.reduce((t, x) => t + x!, 0);
      if (Math.abs(sum - 1) > 0.001) add({ key: "shares", level: "atentie", title: `Cotele proprietarilor din CF însumează ${Math.round(sum * 1000) / 10}%, nu 100%.`, detail: cf.read!.current_owners.map((o) => `${o.name} ${o.share}`).join(", "), source: label(cf) });
    }
  }

  // 4. agreement between the documents (and with the CRM)
  const cols: { doc: string; r: Partial<DocRead> & { owners?: string } }[] = [
    { doc: "CRM", r: { cf_number: s.cf_number, cad_numbers: [s.cad_building, s.cad_land].filter((x): x is string => !!x), usable_area: s.usable_area, land_area: s.land_area, address: s.full_address } },
    ...read.filter((d) => ["extras_cf", "releveu", "documentatie_cadastrala", "certificat_energetic", ...TITLES].includes(d.read!.doc_type)).slice(0, 6)
      .map((d) => ({ doc: TYPE_LABEL[d.read!.doc_type].replace("Contract de ", "").replace("Certificat de performanță energetică", "Cert. energetic").replace("Extras de carte funciară", "Extras CF").replace("Documentație cadastrală", "Doc. cadastrală") + (d.read!.issue_date ? ` ${d.read!.issue_date.slice(0, 4)}` : ""),
        r: { ...d.read!, owners: d.read!.current_owners.map((o) => o.name).join(", ") } })),
  ];
  const areaOff = (vals: (number | null | undefined)[]) => {
    const v = vals.filter((x): x is number => !!x && x > 0);
    return v.length > 1 && Math.max(...v) / Math.min(...v) - 1 > 0.02;
  };
  const ua = cols.map((c) => c.r.usable_area), la = cols.map((c) => c.r.land_area);
  const cfNo = cols.map((c) => digits(c.r.cf_number) || null);
  const cads = cols.map((c) => (c.r.cad_numbers ?? []).map((x) => x.trim().toUpperCase()));
  const concordance = [
    { field: "Proprietar", values: cols.map((c) => ({ doc: c.doc, value: c.r.owners || null, off: false })) },
    { field: "Nr. CF", values: cols.map((c, i) => ({ doc: c.doc, value: c.r.cf_number ?? null, off: !!cfNo[i] && cfNo.some((x) => x && x !== cfNo[i]) })) },
    { field: "Nr. cadastral", values: cols.map((c, i) => ({ doc: c.doc, value: cads[i].join(", ") || null, off: cads[i].length > 0 && cads.some((x) => x.length > 0 && !x.some((y) => cads[i].includes(y))) })) },
    { field: "Suprafață utilă", values: cols.map((c) => ({ doc: c.doc, value: c.r.usable_area ? `${c.r.usable_area.toLocaleString("ro-RO")} mp` : null, off: false })) },
    { field: "Suprafață teren", values: cols.map((c) => ({ doc: c.doc, value: c.r.land_area ? `${c.r.land_area.toLocaleString("ro-RO")} mp` : null, off: false })) },
    { field: "Adresă", values: cols.map((c) => ({ doc: c.doc, value: c.r.address ?? null, off: false })) },
  ];
  const markArea = (row: (typeof concordance)[number], vals: (number | null | undefined)[]) => {
    const v = vals.filter((x): x is number => !!x && x > 0);
    if (v.length < 2) return;
    const mid = [...v].sort((a, b) => a - b)[Math.floor((v.length - 1) / 2)];
    row.values.forEach((x, i) => { const n = vals[i]; if (n && Math.abs(n / mid - 1) > 0.02) x.off = true; });
  };
  markArea(concordance[3], ua); markArea(concordance[4], la);
  if (areaOff(ua)) {
    const v = cols.map((c) => (c.r.usable_area ? `${c.doc} ${c.r.usable_area.toLocaleString("ro-RO")} mp` : null)).filter(Boolean).join(", ");
    add({ key: "area:ua", level: "atentie", title: "Suprafața utilă diferă între acte (peste 2%).", detail: `${v}. Posibilă modificare neintabulată sau eroare de măsurare.`, source: "concordanță" });
  }
  if (areaOff(la)) add({ key: "area:la", level: "atentie", title: "Suprafața terenului diferă între acte (peste 2%).", detail: cols.map((c) => (c.r.land_area ? `${c.doc} ${c.r.land_area} mp` : null)).filter(Boolean).join(", "), source: "concordanță" });
  if (concordance[1].values.some((x) => x.off)) add({ key: "cf:no", level: "critic", title: "Numărul cărții funciare diferă între acte.", detail: concordance[1].values.filter((x) => x.value).map((x) => `${x.doc}: ${x.value}`).join(", "), source: "concordanță" });
  if (concordance[2].values.some((x) => x.off)) add({ key: "cf:cad", level: "critic", title: "Numărul cadastral diferă între acte.", detail: concordance[2].values.filter((x) => x.value).map((x) => `${x.doc}: ${x.value}`).join(", "), source: "concordanță" });

  // 5. the chain of ownership: the CF's history first, then the transfers in the other documents
  const steps: ChainStep[] = [];
  const keyOf = (t: { act: string; act_number: string | null; act_date: string | null }) => `${digits(t.act_number) || fold(t.act).slice(0, 12)}|${day(t.act_date) ?? ""}`;
  for (const d of [...cfs, ...read.filter((x) => x.read!.doc_type !== "extras_cf")]) {
    for (const t of d.read!.transfers) {
      const k = keyOf(t);
      const had = steps.find((x) => `${digits(x.number) || fold(x.act).slice(0, 12)}|${x.date ?? ""}` === k);
      const reg = d.read!.doc_type === "extras_cf" ? t.registered_in_cf !== false : !!t.registered_in_cf;
      if (had) { had.registered ||= reg; continue; }
      steps.push({ from: t.from, to: t.to.map((p) => ({ name: p.name, share: p.share })), act: t.act, number: t.act_number, date: day(t.act_date), issuer: t.issuer, registered: reg, broken: false, source: label(d) });
    }
  }
  steps.sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
  const owners = (cf?.read!.current_owners ?? []).map((o) => ({ name: o.name, share: o.share }));
  for (let i = 1; i < steps.length; i++) {
    const before = steps.slice(0, i).flatMap((x) => x.to.map((p) => p.name));
    const st = steps[i];
    if (st.from.length && !st.from.every((f) => before.some((b) => sameName(f, b) > 0))) {
      st.broken = true;
      add({ key: `chain:${i}`, level: "critic", title: `Lanț întrerupt: ${st.from.join(", ")} nu apare ca proprietar înainte de ${st.act}${st.date ? ` din ${ro(st.date)}` : ""}.`, detail: `Proprietarii anteriori din acte: ${[...new Set(before)].join(", ") || "—"}. De verificat titlul transmițătorului (ex. o moștenire neintabulată) sau o rectificare de nume.`, source: st.source });
    } else if (st.from.length && st.from.some((f) => !before.some((b) => sameName(f, b) === 2))) {
      add({ key: `name:${i}`, level: "atentie", title: `Nume scris diferit în lanțul de proprietate: ${st.from.join(", ")}.`, detail: `În actele anterioare: ${[...new Set(before)].join(", ")}. Probabil aceeași persoană: de confirmat (act de identitate, rectificare).`, source: st.source });
    }
  }
  // the chain as the CF shows it: with only the registered transfers, is someone missing? (e.g. an inheritance
  // never registered: the heir sells, but the CF still shows the deceased)
  if (cf) {
    const reg = steps.filter((x) => x.registered);
    for (let i = 1; i < reg.length; i++) {
      const before = reg.slice(0, i).flatMap((x) => x.to.map((p) => p.name));
      const st = reg[i];
      // the same name exactly: in order; a missing title that names the transmitter exactly: a gap (Ion ≠ Ioan here:
      // a father and his heir are often one letter apart); only alike: a spelling to confirm
      if (!st.from.length || st.from.every((f) => before.some((x) => sameName(f, x) === 2))) continue;
      const gap = steps.filter((x) => !x.registered && (x.date ?? "") <= (st.date ?? "9999") && x.to.some((p) => st.from.some((f) => sameName(f, p.name) === 2)));
      if (!gap.length && st.from.every((f) => before.some((x) => sameName(f, x) > 0))) {
        add({ key: `cfname:${i}`, level: "atentie", title: `Nume scris diferit în CF: ${st.from.join(", ")} / ${[...new Set(before)].join(", ")}.`, detail: "Probabil aceeași persoană: de confirmat cu actul de identitate sau o încheiere de rectificare.", source: label(cf) });
        continue;
      }
      st.broken = true;
      gap.forEach((x) => { x.broken = true; });
      add({ key: `cfchain:${i}`, level: "critic", title: `Lanț întrerupt în CF: ${st.from.join(", ")} a transmis prin ${st.act}${st.date ? ` din ${ro(st.date)}` : ""}, dar nu apare ca proprietar în CF.`,
        detail: gap.length ? `Titlul lui (${gap.map((x) => `${x.act}${x.number ? ` nr. ${x.number}` : ""}${x.date ? ` din ${ro(x.date)}` : ""}`).join("; ")}) nu apare intabulat. De verificat încheierea de intabulare sau de cerut o rectificare.`
          : `Proprietarii anteriori din CF: ${[...new Set(before)].join(", ") || "—"}. De verificat titlul transmițătorului sau o rectificare de nume.`,
        source: label(cf), request: gap.length ? `dovada intabulării actului ${gap[0].act}${gap[0].number ? ` nr. ${gap[0].number}` : ""} (încheiere de intabulare) sau un extras CF care îl arată` : undefined });
    }
  }
  // a transfer known only from an act, not from the CF's history
  if (cf) for (const st of steps) if (!st.registered && !st.broken) {
    add({ key: `unreg:${st.number ?? st.date}`, level: "atentie", title: `${st.act}${st.number ? ` nr. ${st.number}` : ""}${st.date ? ` din ${ro(st.date)}` : ""} nu apare intabulat în CF.`, detail: "Actul există, dar extrasul CF nu arată înscrierea lui.", source: st.source });
  }
  // the owners in the CF and the buyers of the newest title
  const lastTitle = [...steps].reverse().find((x) => x.to.length);
  if (cf && owners.length && lastTitle && !lastTitle.to.every((p) => owners.some((o) => sameName(p.name, o.name) > 0))) {
    add({ key: "owner:cf", level: "critic", title: "Proprietarii din CF nu sunt cei din ultimul act de proprietate.", detail: `CF: ${owners.map((o) => o.name).join(", ")}. ${lastTitle.act}: ${lastTitle.to.map((p) => p.name).join(", ")}.`, source: label(cf) });
  }

  // encumbrances
  const encumbrances: Encumbrance[] = [];
  for (const d of read) for (const e of d.read!.encumbrances) {
    if (!e.active) continue;
    if (encumbrances.some((x) => x.kind === e.kind && x.detail === e.detail)) continue;
    // an encumbrance (a mortgage most often) is not a problem of the documents: it is listed and mentioned in the report
    encumbrances.push({ kind: e.kind, detail: e.detail, beneficiary: e.beneficiary, date: day(e.date), source: label(d) });
  }

  // the inventory of the documents (opis): the CF first, then the titles by date, then the rest
  const order: DocType[] = ["extras_cf", ...TITLES, "autorizatie_construire", "pv_receptie", "documentatie_cadastrala", "releveu", "certificat_energetic", "certificat_fiscal", "act_identitate", "alt"];
  const opis = read.filter((d) => d.read!.doc_type !== "act_identitate")
    .sort((a, b) => order.indexOf(a.read!.doc_type) - order.indexOf(b.read!.doc_type) || (day(a.read!.issue_date) ?? "").localeCompare(day(b.read!.issue_date) ?? ""))
    .map((d, i) => ({ n: i + 1, title: d.read!.title, number: d.read!.act_number, date: day(d.read!.issue_date), issuer: d.read!.issuer, ref: d.ref }));

  // the ownership right, as text for the report
  const rightText = describeRight(cf?.read ?? null, owners, steps, encumbrances, s);
  const asks = issues.filter((i) => i.request).map((i) => i.request!);
  const clientRequest = asks.length ? `Bună ziua,\n\nPentru finalizarea evaluării vă rugăm să ne transmiteți:\n${[...new Set(asks)].map((a) => `- ${a}`).join("\n")}\n\nVă mulțumim!` : "";
  const docSummaries: DocSummary[] = docs.map((d) => ({ ref: d.ref, name: d.name, type: d.read ? TYPE_LABEL[d.read.doc_type] : null, title: d.read?.title ?? null, number: d.read?.act_number ?? null,
    date: day(d.read?.issue_date), issuer: d.read?.issuer ?? null, ok: !!d.read && d.read.readable, error: d.error ?? (d.read && !d.read.readable ? d.read.unreadable_note ?? "greu lizibil" : null) }));

  // the file's completeness (validity, auxiliary documents) is noted, not a problem; an unreadable document is
  for (const i of issues) if (groupOf(i.key) === "dosar" && !i.key.startsWith("read:")) i.level = "info";
  const rank = { critic: 0, atentie: 1, info: 2 };
  issues.sort((a, b) => rank[a.level] - rank[b.level]);
  const verdict = verdictOf(issues);
  return { verdict, refDate: ref, issues, concordance, chain: steps, owners, encumbrances, opis, rightText, clientRequest, docs: docSummaries };
}

/** „Dreptul de proprietate asupra imobilului … aparține lui …, în cotă de …, dobândit prin …, intabulat în CF nr. … .” */
function describeRight(cf: DocRead | null, owners: { name: string; share: string | null }[], steps: ChainStep[], enc: Encumbrance[], s: Subject) {
  if (!cf && !steps.length) return "";
  const what = s.type ? s.type.toLowerCase() : "imobilul";
  const where = cf?.address ?? s.full_address ?? s.city ?? "";
  const cad = cf?.cad_numbers.length ? cf.cad_numbers.join(", ") : [s.cad_building, s.cad_land].filter(Boolean).join(", ");
  const cfNo = cf?.cf_number ?? s.cf_number;
  const who = owners.length ? owners : steps.at(-1)?.to ?? [];
  const names = who.map((o) => `${o.name}${o.share && o.share !== "1/1" ? ` (cotă ${o.share})` : ""}`).join(", ");
  const full = who.length === 1 && (!who[0].share || who[0].share === "1/1");
  const titles = (cf?.current_owners ?? []).map((o) => o.acquired_by).filter((x): x is string => !!x);
  const last = steps.at(-1);
  const how = titles.length ? [...new Set(titles)].join("; ") : last ? `${last.act}${last.number ? ` nr. ${last.number}` : ""}${last.date ? ` din ${ro(last.date)}` : ""}${last.issuer ? `, emis de ${last.issuer}` : ""}` : "";
  const entries = [...new Set((cf?.current_owners ?? []).map((o) => o.cf_entry?.replace(/^\s*încheier(ea|ii|i)\s*/i, "")).filter((x): x is string => !!x))];
  const parts = [
    `Dreptul de proprietate asupra imobilului (${what}${where ? `, situat în ${where}` : ""}) aparține ${who.length > 1 ? "proprietarilor" : "proprietarului"} ${names || "[proprietar]"}${full ? ", în cotă de 1/1" : ""}`,
    how ? `, dobândit prin ${how}` : "",
    cfNo ? `. Dreptul este intabulat în Cartea Funciară nr. ${cfNo}${cf?.cf_locality ? ` a UAT ${cf.cf_locality}` : ""}${cad ? `, nr. cadastral ${cad}` : ""}${entries.length ? `, prin încheierea ${entries.join(", ")}` : ""}` : "",
    cf?.issue_date ? `, conform extrasului de carte funciară pentru informare din ${ro(day(cf.issue_date))}` : "",
    ".",
    enc.length ? ` Imobilul este grevat de următoarele sarcini: ${enc.map((e) => `${e.detail}${e.beneficiary ? ` în favoarea ${e.beneficiary}` : ""}`).join("; ")}.` : cf ? " Conform extrasului CF, imobilul nu este grevat de sarcini." : "",
  ];
  return parts.join("").replace(/\.\./g, ".");
}

export type Progress = { at: string; step: "read" | "rules"; docs: { name: string; state: "wait" | "read" | "done" | "error" }[] };
const progressKey = (reportId: string, assetId: string) => `legal_progress:${reportId}:${assetId}`;
const saveProgress = (db: D1Database, reportId: string, assetId: string, p: Progress) =>
  db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(progressKey(reportId, assetId), JSON.stringify(p), now()).run().catch(() => null);

/** How far the running check of an asset has got (null: none running). */
export async function legalProgress(db: D1Database, reportId: string, assetId: string): Promise<Progress | null> {
  const row = await db.prepare("SELECT value, updated_at FROM settings WHERE key = ?").bind(progressKey(reportId, assetId)).first<{ value: string; updated_at: string }>().catch(() => null);
  // a run that stopped half way (an error, a timeout) is not shown for ever
  if (!row || Date.now() - new Date(row.updated_at).getTime() > 5 * 60000) return null;
  try { return JSON.parse(row.value) as Progress; } catch { return null; }
}

/** Reads the asset's documents (4 at a time), checks them and keeps the result on the report. */
export async function runLegalCheck(db: D1Database, reportId: string, assetId: string, userId: string) {
  if (!legalEnabled()) return { ok: false as const, error: "Citirea automată nu este configurată (ANTHROPIC_API_KEY)." };
  const s = await db.prepare(`SELECT p.category, p.type, p.construction, p.year_built, p.cf_number, p.cad_building, p.cad_land, p.usable_area, p.land_area, p.full_address, p.city,
      r.purpose, r.valuation_date, b.name AS bank
    FROM assets a JOIN crm_properties p ON p.id = a.property_id JOIN reports r ON r.id = a.report_id LEFT JOIN entities b ON b.id = r.recipient_id
    WHERE a.id = ? AND a.report_id = ?`).bind(assetId, reportId).first<Subject>();
  if (!s) return { ok: false as const, error: "Bunul nu aparține acestui raport." };
  if (s.category === "BUN MOBIL") return { ok: false as const, error: "Analiza juridică e pentru imobile." };
  const docs = (await assetDocs(db, reportId, assetId)).slice(0, 15);
  if (!docs.length) return { ok: false as const, error: "Bunul nu are acte încărcate. Încarcă extrasul CF și actul de proprietate." };
  const t0 = Date.now();
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const out: LegalDoc[] = [];
  // the progress, read by the page while it waits (each document: waiting, being read, read, failed)
  const state: Progress = { at: now(), step: "read", docs: docs.map((d) => ({ name: d.name, state: "wait" })) };
  const save = () => saveProgress(db, reportId, assetId, state);
  await save();
  for (let i = 0; i < docs.length; i += 4) {
    const batch = docs.slice(i, i + 4);
    batch.forEach((_, k) => { state.docs[i + k].state = "read"; });
    await save();
    out.push(...(await Promise.all(batch.map(async (d, k) => {
      const r = await readDoc(db, client, d);
      state.docs[i + k].state = r.error ? "error" : "done";
      await save();
      return r;
    }))));
  }
  state.step = "rules";
  await save();
  const result = evaluate(out, s);
  const id = uuid(), at = now();
  await db.prepare("INSERT INTO legal_checks (id, report_id, asset_id, verdict, result, docs_count, ms, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, reportId, assetId, result.verdict, JSON.stringify(result), out.length, Date.now() - t0, userId, at).run();
  await db.prepare("DELETE FROM settings WHERE key = ?").bind(progressKey(reportId, assetId)).run().catch(() => null);
  return { ok: true as const, id };
}

export type LegalCheck = { id: string; asset_id: string; verdict: string; result: LegalResult; resolved: Record<string, { state: "rezolvat" | "acceptat"; note: string | null; by: string; at: string }>;
  docs_count: number; ms: number | null; created_at: string; created_by_name: string | null };

/** The newest check of each asset of the report. */
export async function latestChecks(db: D1Database, reportId: string): Promise<LegalCheck[]> {
  const { results } = await db.prepare(`SELECT c.*, COALESCE(NULLIF(u.name, ''), u.email) AS created_by_name FROM legal_checks c LEFT JOIN users u ON u.id = c.created_by
    WHERE c.report_id = ? AND c.created_at = (SELECT MAX(x.created_at) FROM legal_checks x WHERE x.report_id = c.report_id AND x.asset_id IS c.asset_id)`).bind(reportId)
    .all<{ id: string; asset_id: string; verdict: string; result: string; resolved: string | null; docs_count: number; ms: number | null; created_at: string; created_by_name: string | null }>()
    .catch(() => ({ results: [] as never[] }));
  return results.map((r) => {
    let result: LegalResult | null = null, resolved = {};
    try { result = JSON.parse(r.result); } catch { /* skipped */ }
    try { resolved = r.resolved ? JSON.parse(r.resolved) : {}; } catch { /* none */ }
    return result ? { ...r, result, resolved } : null;
  }).filter((x): x is LegalCheck => !!x);
}

/** Marks an issue of a check as solved / accepted (with a note), or clears the mark. */
export async function markIssue(db: D1Database, checkId: string, reportId: string, key: string, state: "rezolvat" | "acceptat" | null, note: string | null, by: string) {
  const row = await db.prepare("SELECT resolved FROM legal_checks WHERE id = ? AND report_id = ?").bind(checkId, reportId).first<{ resolved: string | null }>();
  if (!row) return false;
  let r: Record<string, unknown> = {};
  try { r = row.resolved ? JSON.parse(row.resolved) : {}; } catch { /* reset */ }
  if (state) r[key] = { state, note: note?.trim().slice(0, 500) || null, by, at: now() }; else delete r[key];
  await db.prepare("UPDATE legal_checks SET resolved = ? WHERE id = ?").bind(JSON.stringify(r), checkId).run();
  return true;
}

/** What was read from each document of the report (for the documents list: name of the act, number, date, issuer). */
export async function docReadings(db: D1Database, refs: string[]) {
  if (!refs.length) return {} as Record<string, { title: string; number: string | null; date: string | null; issuer: string | null }>;
  const { results } = await db.prepare(`SELECT ref, data FROM doc_extracts WHERE ref IN (${refs.map(() => "?").join(", ")})`).bind(...refs).all<{ ref: string; data: string }>().catch(() => ({ results: [] as { ref: string; data: string }[] }));
  const out: Record<string, { title: string; number: string | null; date: string | null; issuer: string | null }> = {};
  for (const r of results) { try { const d = JSON.parse(r.data) as DocRead; out[r.ref] = { title: d.title, number: d.act_number, date: day(d.issue_date), issuer: d.issuer }; } catch { /* skipped */ } }
  return out;
}
