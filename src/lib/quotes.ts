// Server-only: Oferte — the offers made to clients before there is any order or contract, kept so none is forgotten.
// An offer is written (by hand or through the Claude connector), marked sent / accepted / declined, and converted
// into work: direct (classic contract + report) or an order under a collaboration agreement.
import { now, uuid } from "./db";
import { audit } from "./auth";
import { parseAssets } from "./process-order";
import { createContractOrder } from "./contract-orders";
import { createDirectWork } from "./direct-work";
import { openDossier } from "./dossier";
import { fillReportAssets } from "./process-order";
import { ASSET_CATEGORIES, capType, type AssetInput } from "./asset-labels";

export type QuoteStatus = "draft" | "sent" | "accepted" | "declined" | "converted";
export const QUOTE_STATUS: Record<QuoteStatus, [string, string]> = {
  draft: ["De trimis", ""],
  sent: ["Trimisă", "pillInfo"],
  accepted: ["Acceptată", "pillOk"],
  declined: ["Refuzată", "pillErr"],
  converted: ["Convertită", "pillOk"],
};
export const SENT_VIA: [string, string][] = [["email", "Email"], ["whatsapp", "WhatsApp"], ["phone", "Telefon"], ["meeting", "La birou / întâlnire"]];
export const QUOTE_TABS: [string, string][] = [["deschise", "Deschise"], ["acceptate", "Acceptate"], ["convertite", "Convertite"], ["refuzate", "Refuzate / expirate"], ["toate", "Toate"]];

/** An asset of an offer: the form's fields, as typed (validated only at conversion). */
export type QuoteAsset = Record<string, string | boolean | null | undefined> & { category?: string; type?: string; city?: string; county?: string; full_address?: string; usable_area?: string };

export type Quote = {
  id: string; seq: number | null; status: QuoteStatus;
  client_id: string | null; client_kind: string; client_name: string; client_phone: string | null; client_email: string | null; client_cui: string | null;
  purpose: string | null; report_type: string | null; fee: number | null; term_days: number | null; valid_until: string | null; urgent: number;
  assets_json: string; inspection_notes: string | null; notes: string | null; channel: string | null; collaboration_id: string | null;
  sent_at: string | null; sent_via: string | null; decided_at: string | null; decline_reason: string | null;
  converted_at: string | null; order_id: string | null; contract_id: string | null; report_id: string | null;
  created_by: string | null; created_at: string; updated_at: string;
  /** the public page (portal /oferta/<token>) and the client's answer on it */
  token: string | null; sent_to: string | null; message: string | null; payment_terms: string | null; viewed_at: string | null;
  accepted_name: string | null; signature: string | null; accepted_ip: string | null; content_hash: string | null;
  // joined
  author: string | null; collab_firm: string | null; report_number: string | null; order_seq: number | null; contract_number: string | null;
};

export const quoteCode = (q: Pick<Quote, "seq">) => (q.seq ? `OF-${q.seq}` : "OF-?");
export const quoteAssets = (q: Pick<Quote, "assets_json">): QuoteAsset[] => { try { const v = JSON.parse(q.assets_json); return Array.isArray(v) ? v : []; } catch { return []; } };
export const isExpired = (q: Pick<Quote, "status" | "valid_until">) => (q.status === "draft" || q.status === "sent") && !!q.valid_until && q.valid_until < today();
/** "Apartament in bloc · Str. X 3, Timișoara", of the first asset. */
export const quoteWhat = (q: Pick<Quote, "assets_json">) => {
  const a = quoteAssets(q)[0];
  if (!a) return "";
  const place = [a.full_address, a.city].filter((x) => typeof x === "string" && x.trim()).map(String);
  const where = place.length > 1 && place[0].toLowerCase().includes(place[1].toLowerCase()) ? place[0] : place.join(", ");
  return [capType(typeof a.type === "string" ? a.type : null), where].filter(Boolean).join(" · ");
};

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : "");
const amount = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 && n < 1e7 ? Math.round(n * 100) / 100 : null;
};
const int = (v: unknown) => { const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10); return Number.isFinite(n) && n > 0 && n < 1000 ? n : null; };
const dateOf = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(str(v, 10)) ? str(v, 10) : null);

const SELECT = `SELECT q.*, COALESCE(NULLIF(u.name, ''), u.email) AS author, e.name AS collab_firm, r.number AS report_number, o.seq AS order_seq, k.number AS contract_number
  FROM quotes q LEFT JOIN users u ON u.id = q.created_by LEFT JOIN collaborations cb ON cb.id = q.collaboration_id LEFT JOIN entities e ON e.id = cb.firm_id
  LEFT JOIN reports r ON r.id = q.report_id LEFT JOIN orders o ON o.id = q.order_id LEFT JOIN contracts k ON k.id = q.contract_id`;

export const getQuote = (db: D1Database, id: string) => db.prepare(`${SELECT} WHERE q.id = ?`).bind(id).first<Quote>();

/** The list: by tab (open / accepted / converted / declined or expired / all) and a search over client, place, code, author. */
export async function listQuotes(db: D1Database, f: { tab?: string; q?: string; mine?: string | null }) {
  const w: string[] = [], p: (string | number)[] = [];
  const t = today();
  switch (f.tab ?? "deschise") {
    case "acceptate": w.push("q.status = 'accepted'"); break;
    case "convertite": w.push("q.status = 'converted'"); break;
    case "refuzate": w.push("(q.status = 'declined' OR (q.status IN ('draft', 'sent') AND q.valid_until IS NOT NULL AND q.valid_until < ?))"); p.push(t); break;
    case "toate": break;
    default: w.push("q.status IN ('draft', 'sent') AND (q.valid_until IS NULL OR q.valid_until >= ?)"); p.push(t);
  }
  if (f.mine) { w.push("q.created_by = ?"); p.push(f.mine); }
  const s = (f.q ?? "").trim();
  if (s) {
    const seq = /^(?:of-?)?(\d{1,7})$/i.exec(s)?.[1];
    const like = `%${s.replace(/[%_]/g, "")}%`;
    w.push(`(q.client_name LIKE ? OR q.client_phone LIKE ? OR q.client_email LIKE ? OR q.assets_json LIKE ? OR q.notes LIKE ? OR q.purpose LIKE ? ${seq ? "OR q.seq = ?" : ""})`);
    p.push(like, like, like, like, like, like, ...(seq ? [Number(seq)] : []));
  }
  const rows = (await db.prepare(`${SELECT} ${w.length ? `WHERE ${w.join(" AND ")}` : ""} ORDER BY q.updated_at DESC LIMIT 300`).bind(...p).all<Quote>()).results;
  return rows;
}

/** How many offers wait (not answered, not expired): the badge in the menu. */
export const openQuotes = (db: D1Database) =>
  db.prepare("SELECT COUNT(*) AS n FROM quotes WHERE status IN ('draft', 'sent') AND (valid_until IS NULL OR valid_until >= ?)").bind(today()).first<{ n: number }>().then((r) => r?.n ?? 0).catch(() => 0);

export async function quoteCounts(db: D1Database, mine?: string | null) {
  const t = today();
  const r = await db.prepare(`SELECT
      SUM(status IN ('draft', 'sent') AND (valid_until IS NULL OR valid_until >= ?1)) AS deschise, SUM(status = 'accepted') AS acceptate, SUM(status = 'converted') AS convertite,
      SUM(status = 'declined' OR (status IN ('draft', 'sent') AND valid_until IS NOT NULL AND valid_until < ?1)) AS refuzate, COUNT(*) AS toate
    FROM quotes ${mine ? "WHERE created_by = ?2" : ""}`).bind(t, ...(mine ? [mine] : [])).first<Record<string, number | null>>();
  return Object.fromEntries(QUOTE_TABS.map(([k]) => [k, r?.[k] ?? 0])) as Record<string, number>;
}

// ---------- write ----------

const ASSET_KEYS = ["category", "type", "construction", "county", "city", "full_address", "cf_number", "cad_building", "cad_land", "usable_area", "year_built", "description", "notes",
  "contact_kind", "contact_name", "contact_phone", "land_area", "rooms", "floor", "height_regime", "vehicle_make", "vehicle_model", "reg_number", "vin", "mileage"];
const TYPES = new Set(ASSET_CATEGORIES.flatMap(([, , t]) => t));
const categoryOf = (type: string) => ASSET_CATEGORIES.find(([, , t]) => t.includes(type))?.[0] ?? "REZIDENTIAL";

/** The assets of an offer: the form's fields, strings only, with the type known to the CRM (else the free text kept as is). */
export function cleanAssets(raw: unknown): QuoteAsset[] {
  if (!Array.isArray(raw)) return [];
  const out: QuoteAsset[] = [];
  for (const x of raw.slice(0, 20)) {
    if (!x || typeof x !== "object") continue;
    const a: QuoteAsset = {};
    for (const k of ASSET_KEYS) { const v = (x as Record<string, unknown>)[k]; if (typeof v === "string" && v.trim()) a[k] = v.trim().slice(0, 300); }
    if (!a.type) continue;
    a.type = String(a.type).toUpperCase();
    if (!a.category || !ASSET_CATEGORIES.some(([c]) => c === a.category)) a.category = categoryOf(a.type);
    a.contact_kind = a.contact_kind || "client";
    a.construction = a.construction || "existing";
    out.push({ ...a, is_main: out.length === 0 });
  }
  return out;
}

/** Guesses the CRM's type from free text ("apartament", "casă", "teren", "mașină"). */
export function guessType(text: string): string {
  const t = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
  if (TYPES.has(t)) return t;
  if (/APART/.test(t)) return /CASA/.test(t) ? "APARTAMENT IN CASA" : "APARTAMENT IN BLOC";
  if (/CASA|VILA|LOCUINTA/.test(t)) return "CASA CU TEREN";
  if (/PARCARE|GARAJ/.test(t)) return /SUBTERAN/.test(t) ? "LOC DE PARCARE ( SUBTERAN )" : "LOC DE PARCARE ( SUPRATERAN )";
  if (/TEREN|LOT|PARCELA/.test(t)) return /EXTRAVILAN/.test(t) ? "TEREN EXTRAVILAN" : /AGRICOL|ARABIL/.test(t) ? "TEREN INTRAVILAN ARABIL" : "TEREN INTRAVILAN CONSTRUCTII";
  if (/BIROU|OFFICE/.test(t)) return "SPATIU DE BIROURI - PARTE DINTR-O CLADIRE";
  if (/COMERCIAL|MAGAZIN|SPATIU/.test(t)) return "SPATIU COMERCIAL - PARTE DINTR-O CLADIRE";
  if (/DEPOZIT|HALA|LOGISTIC/.test(t)) return "SPATIU DE DEPOZITARE SI LOGISTICA";
  if (/PRODUCTIE|FABRICA/.test(t)) return "SPATIU DE PRODUCTIE";
  if (/AUTOUTILITARA|DUBA|CAMION/.test(t)) return "AUTOUTILITARA";
  if (/AUTO|MASINA|VEHICUL/.test(t)) return "AUTOTURISM";
  if (/UTILAJ|EXCAVATOR|TRACTOR/.test(t)) return "UTILAJ";
  if (/SCUTER|MOTO/.test(t)) return "MOTOSCUTER";
  if (/FERMA/.test(t)) return "FERMA AGRICOLA";
  return t;
}

type QuoteBody = Record<string, unknown>;

function fieldsOf(b: QuoteBody) {
  const name = str(b.client_name, 160);
  const phone = str(b.client_phone, 40), email = str(b.client_email, 160).toLowerCase();
  if (!name) return { ok: false as const, error: "Completează numele clientului." };
  if (!phone && !email) return { ok: false as const, error: "Completează telefonul sau emailul clientului." };
  const assets = cleanAssets(b.assets);
  if (!assets.length) return { ok: false as const, error: "Adaugă cel puțin un bun (tipul lui)." };
  const channel = b.channel === "direct" || b.channel === "collab" ? (b.channel as string) : null;
  return { ok: true as const, v: {
    client_id: str(b.client_id, 80) || null, client_kind: b.client_kind === "company" ? "company" : "person", client_name: name, client_phone: phone || null, client_email: email || null,
    client_cui: str(b.client_cui, 20).toUpperCase().replace(/^RO\s*/, "") || null,
    purpose: str(b.purpose, 120) || null, report_type: str(b.report_type, 120) || "Raport de evaluare", fee: amount(b.fee), term_days: int(b.term_days), valid_until: dateOf(b.valid_until),
    urgent: b.urgent === true ? 1 : 0, assets_json: JSON.stringify(assets), inspection_notes: str(b.inspection_notes, 1000) || null, notes: str(b.notes, 4000) || null,
    channel, collaboration_id: channel === "collab" ? str(b.collaboration_id, 80) || null : null, sent_via: SENT_VIA.some(([k]) => k === b.sent_via) ? (b.sent_via as string) : null,
  } };
}

export async function createQuote(db: D1Database, actor: string, b: QuoteBody) {
  const f = fieldsOf(b);
  if (!f.ok) return f;
  const v = f.v;
  const id = uuid(), t = now();
  const sent = b.sent === true || !!v.sent_via;
  for (let attempt = 0; ; attempt++) {
    const seq = ((await db.prepare("SELECT MAX(seq) AS m FROM quotes").first<{ m: number | null }>())?.m ?? 0) + 1;
    try {
      await db.prepare(`INSERT INTO quotes (id, seq, status, client_id, client_kind, client_name, client_phone, client_email, client_cui, purpose, report_type, fee, term_days, valid_until, urgent,
          assets_json, inspection_notes, notes, channel, collaboration_id, sent_at, sent_via, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, seq, sent ? "sent" : "draft", v.client_id, v.client_kind, v.client_name, v.client_phone, v.client_email, v.client_cui, v.purpose, v.report_type, v.fee, v.term_days, v.valid_until, v.urgent,
          v.assets_json, v.inspection_notes, v.notes, v.channel, v.collaboration_id, sent ? t : null, v.sent_via, actor, t, t).run();
      break;
    } catch (e) { if (!String(e).includes("UNIQUE") || attempt >= 4) throw e; }
  }
  await audit(db, `user:${actor}`, "quote.create", "quote", id, `${v.client_name}${v.fee ? ` · ${v.fee} lei` : ""}`);
  return { ok: true as const, id };
}

export async function updateQuote(db: D1Database, actor: string, id: string, b: QuoteBody) {
  const q = await getQuote(db, id);
  if (!q) return { ok: false as const, error: "Oferta nu există." };
  if (q.status === "converted") return { ok: false as const, error: "Oferta e deja convertită în lucrare: se modifică de acolo." };
  const f = fieldsOf(b);
  if (!f.ok) return f;
  const v = f.v;
  await db.prepare(`UPDATE quotes SET client_id = ?, client_kind = ?, client_name = ?, client_phone = ?, client_email = ?, client_cui = ?, purpose = ?, report_type = ?, fee = ?, term_days = ?, valid_until = ?,
      urgent = ?, assets_json = ?, inspection_notes = ?, notes = ?, channel = ?, collaboration_id = ?, sent_via = COALESCE(?, sent_via), updated_at = ? WHERE id = ?`)
    .bind(v.client_id, v.client_kind, v.client_name, v.client_phone, v.client_email, v.client_cui, v.purpose, v.report_type, v.fee, v.term_days, v.valid_until, v.urgent, v.assets_json,
      v.inspection_notes, v.notes, v.channel, v.collaboration_id, v.sent_via, now(), id).run();
  await audit(db, `user:${actor}`, "quote.update", "quote", id, v.client_name);
  return { ok: true as const };
}

/** sent / accepted / declined / back to draft (not converted: that is `convertQuote`). */
export async function setQuoteStatus(db: D1Database, actor: string, id: string, status: string, extra: { sent_via?: unknown; reason?: unknown } = {}) {
  const q = await getQuote(db, id);
  if (!q) return { ok: false as const, error: "Oferta nu există." };
  if (q.status === "converted") return { ok: false as const, error: "Oferta e deja convertită." };
  const t = now();
  if (status === "sent") {
    const via = SENT_VIA.some(([k]) => k === extra.sent_via) ? (extra.sent_via as string) : q.sent_via;
    await db.prepare("UPDATE quotes SET status = 'sent', sent_at = COALESCE(sent_at, ?), sent_via = ?, decided_at = NULL, decline_reason = NULL, updated_at = ? WHERE id = ?").bind(t, via, t, id).run();
    await audit(db, `user:${actor}`, "quote.sent", "quote", id, SENT_VIA.find(([k]) => k === via)?.[1]);
  } else if (status === "accepted" || status === "declined") {
    const reason = status === "declined" ? str(extra.reason, 300) || null : null;
    await db.prepare("UPDATE quotes SET status = ?, decided_at = ?, decline_reason = ?, updated_at = ? WHERE id = ?").bind(status, t, reason, t, id).run();
    await audit(db, `user:${actor}`, status === "accepted" ? "quote.accepted" : "quote.declined", "quote", id, reason ?? undefined);
  } else if (status === "draft") {
    await db.prepare("UPDATE quotes SET status = 'draft', decided_at = NULL, decline_reason = NULL, updated_at = ? WHERE id = ?").bind(t, id).run();
    await audit(db, `user:${actor}`, "quote.reopen", "quote", id);
  } else return { ok: false as const, error: "Stare necunoscută." };
  return { ok: true as const };
}

export async function deleteQuote(db: D1Database, actor: string, id: string) {
  const q = await getQuote(db, id);
  if (!q) return { ok: false as const, error: "Oferta nu există." };
  if (q.status === "converted") return { ok: false as const, error: "O ofertă convertită nu se șterge (lucrarea există)." };
  await db.prepare("DELETE FROM quotes WHERE id = ?").bind(id).run();
  await audit(db, `user:${actor}`, "quote.delete", "quote", id, `${quoteCode(q)} · ${q.client_name}`);
  return { ok: true as const };
}

/**
 * Turns the offer into work. `mode` "direct": a classic contract and its report (direct work); "collab": an order
 * under a collaboration agreement and its report. The team (main evaluator, verifier) is chosen here.
 */
export async function convertQuote(db: D1Database, user: { id: string; name: string }, id: string, b: { mode?: unknown; collaboration_id?: unknown; evaluator_id?: unknown; verifier_id?: unknown; due_on?: unknown; report_number?: unknown; send_contract?: unknown }) {
  const q = await getQuote(db, id);
  if (!q) return { ok: false as const, error: "Oferta nu există." };
  if (q.status === "converted") return { ok: false as const, error: "Oferta e deja convertită." };
  const mode = b.mode === "collab" ? "collab" : "direct";
  const evaluator = /^[\w-]{1,80}$/.test(str(b.evaluator_id, 80)) ? str(b.evaluator_id, 80) : null;
  if (!evaluator) return { ok: false as const, error: "Alege evaluatorul principal." };
  const verifier = /^[\w-]{1,80}$/.test(str(b.verifier_id, 80)) ? str(b.verifier_id, 80) : null;
  const parsed = parseAssets(quoteAssets(q).map((a) => ({ ...a, contact_kind: a.contact_kind || "client", contact_name: a.contact_kind && a.contact_kind !== "client" ? a.contact_name : q.client_name, contact_phone: a.contact_kind && a.contact_kind !== "client" ? a.contact_phone : q.client_phone })));
  if (!parsed.ok) return { ok: false as const, error: `Completează întâi oferta: ${parsed.error}` };
  const assets: AssetInput[] = parsed.assets;
  const due = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(str(b.due_on, 16)) ? str(b.due_on, 16) : null;
  const common = { client_id: q.client_id, client_kind: q.client_kind, client_name: q.client_name, client_phone: q.client_phone ?? "", client_email: q.client_email ?? "", client_cui: q.client_cui ?? "",
    purpose: q.purpose ?? "", report_type: q.report_type ?? "Raport de evaluare", fee: q.fee, urgent: !!q.urgent, inspection_notes: q.inspection_notes ?? "", notes: [q.notes, `Din oferta ${quoteCode(q)}`].filter(Boolean).join("\n") };
  let order: string, report: string | null, contract: string | null = null;
  if (mode === "collab") {
    const collab = str(b.collaboration_id, 80) || q.collaboration_id || "";
    if (!collab) return { ok: false as const, error: "Alege firma colaboratoare." };
    const o = await createContractOrder(db, user.id, { ...common, kind: "collab", collaboration_id: collab, report_number: str(b.report_number, 30) }, assets);
    if (!o.ok) return o;
    const r = await openDossier(db, o.id, user, { evaluator_id: evaluator, verifier_id: verifier, due_on: due });
    if (!r.ok) return r;
    if (r.created && r.assetId) {
      const f = await fillReportAssets(db, user.id, r.id, r.assetId, assets, { name: q.client_name, phone: q.client_phone ?? "" });
      if (!f.ok) return f;
    }
    order = o.id; report = r.id;
  } else {
    const body = { kind: "classic", mode: "accepted", ...common, evaluator_id: evaluator, verifier_id: verifier, due_on: due?.slice(0, 10) ?? "", send_contract: b.send_contract === true,
      ...(q.client_id ? { client_id: q.client_id } : { client: { kind: q.client_kind, name: q.client_name, cui: q.client_cui, phone: q.client_phone, email: q.client_email } }),
      reports: [{ purpose: q.purpose ?? "", report_type: q.report_type ?? "Raport de evaluare", fee: q.fee != null ? String(q.fee) : "", term_days: q.term_days, assets: assets.map((_, i) => i), shared: [] }] };
    const r = await createDirectWork(db, user, body as Record<string, unknown>, assets);
    if (!r.ok) return r;
    order = r.order; report = r.report; contract = r.contract?.id ?? null;
  }
  const t = now();
  await db.prepare("UPDATE quotes SET status = 'converted', channel = ?, collaboration_id = ?, converted_at = ?, order_id = ?, contract_id = ?, report_id = ?, updated_at = ? WHERE id = ?")
    .bind(mode, mode === "collab" ? str(b.collaboration_id, 80) || q.collaboration_id : null, t, order, contract, report, t, id).run();
  await audit(db, `user:${user.id}`, "quote.convert", "quote", id, mode === "collab" ? "comandă pe colaborare" : "lucrare directă (contract clasic)");
  return { ok: true as const, order, report, contract };
}
