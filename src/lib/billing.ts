// Server-only: invoicing from the CRM through Oblio. What is invoiced and when:
// - direct clients (classic contracts): from the contract — a proforma and / or the invoice, one line per report;
// - framework contracts (banks) and collaborations: per their rule — not from the CRM, per order once the report is
//   approved (delivered), or monthly on the statement.
// Every document issued is kept here with a copy of its PDF.
import { bucharestDay, now, parseJson, uuid } from "./db";
import { audit } from "./auth";
import { bucket } from "./orders";
import { getFirm } from "./settings";
import { DEFAULT_TEXT, fillText, type BillingText } from "./billing-text";
import { oblioCancel, oblioCollect, oblioCreate, oblioDelete, OblioError } from "./oblio";

export type BillingSettings = {
  cif: string; invoiceSeries: string; proformaSeries: string; vatName: string; vatPercent: number; vatPayer: boolean;
  product: string; unit: string; dueDays: number; language: string; mentions: string; issuer: string;
  directFlow: "manual" | "proforma_then_invoice" | "invoice_on_sign" | "invoice_on_delivery";
  frameworkDefault: BillingMode; collabDefault: BillingMode;
};
export type BillingMode = "none" | "per_order" | "monthly";

export const BILLING_MODES: [BillingMode, string, string][] = [
  ["none", "Nu se facturează din CRM", "factura se face în afara CRM-ului (sau o face partenerul)"],
  ["per_order", "Per comandă, după aprobarea raportului", "câte o factură pentru fiecare raport livrat (ex. BRD)"],
  ["monthly", "Lunar, pe borderou", "o factură la final de lună cu toate rapoartele livrate"],
];
export const DIRECT_FLOWS: [BillingSettings["directFlow"], string][] = [
  ["manual", "Manual, din contract (butoanele „Emite proformă / factură”)"],
  ["proforma_then_invoice", "Proformă la semnarea contractului, factura la încasare"],
  ["invoice_on_sign", "Factura direct, la semnarea contractului"],
  ["invoice_on_delivery", "Factura la predarea raportului"],
];

const DEFAULTS: BillingSettings = {
  cif: "", invoiceSeries: "", proformaSeries: "", vatName: "Normala", vatPercent: 21, vatPayer: true,
  product: "Servicii de evaluare", unit: "buc", dueDays: 5, language: "RO", mentions: "", issuer: "",
  directFlow: "manual", frameworkDefault: "none", collabDefault: "none",
};

export async function getBilling(db: D1Database): Promise<BillingSettings> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'billing'").first<{ value: string }>().catch(() => null);
  const saved = parseJson<Partial<BillingSettings>>(row?.value, {});
  const firm = await getFirm(db);
  return { ...DEFAULTS, cif: firm.cui, ...saved };
}

export async function saveBilling(db: D1Database, actor: string, b: Record<string, unknown>) {
  const cur = await getBilling(db);
  const s = (k: string, max = 120) => (typeof b[k] === "string" ? (b[k] as string).trim().slice(0, max) : undefined);
  const mode = (v: unknown, d: BillingMode) => (BILLING_MODES.some(([m]) => m === v) ? (v as BillingMode) : d);
  const next: BillingSettings = {
    ...cur,
    cif: (s("cif", 20) ?? cur.cif).replace(/\s/g, "").toUpperCase(),
    invoiceSeries: s("invoiceSeries", 20) ?? cur.invoiceSeries, proformaSeries: s("proformaSeries", 20) ?? cur.proformaSeries,
    vatName: s("vatName", 40) ?? cur.vatName, vatPercent: Number.isFinite(Number(b.vatPercent)) ? Math.max(0, Math.min(100, Number(b.vatPercent))) : cur.vatPercent,
    vatPayer: typeof b.vatPayer === "boolean" ? b.vatPayer : cur.vatPayer,
    product: s("product", 120) || cur.product, unit: s("unit", 20) || cur.unit,
    dueDays: Number.isInteger(Number(b.dueDays)) && Number(b.dueDays) >= 0 && Number(b.dueDays) <= 120 ? Number(b.dueDays) : cur.dueDays,
    language: s("language", 5) || cur.language, mentions: s("mentions", 1000) ?? cur.mentions, issuer: s("issuer", 120) ?? cur.issuer,
    directFlow: DIRECT_FLOWS.some(([f]) => f === b.directFlow) ? (b.directFlow as BillingSettings["directFlow"]) : cur.directFlow,
    frameworkDefault: mode(b.frameworkDefault, cur.frameworkDefault), collabDefault: mode(b.collabDefault, cur.collabDefault),
  };
  if (!next.cif) return { ok: false as const, error: "Alege firma (CIF-ul) din Oblio." };
  await db.prepare("INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('billing', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by")
    .bind(JSON.stringify(next), now(), actor).run();
  await audit(db, `user:${actor}`, "settings.billing", "settings", "billing", `serie ${next.invoiceSeries || "—"} · TVA ${next.vatPercent}% · clienți direcți: ${next.directFlow}`);
  return { ok: true as const };
}

/** The billing rule of every framework contract and collaboration (their own, else the default). */
export async function billingRules(db: D1Database) {
  const [contracts, collabs] = await Promise.all([
    db.prepare(`SELECT k.id, k.number, k.billing_mode, k.billing_text IS NOT NULL AS custom, e.name AS party, (SELECT COUNT(*) FROM reports r WHERE r.contract_id = k.id) AS reports
      FROM contracts k LEFT JOIN entities e ON e.id = k.client_id WHERE k.kind = 'framework' ORDER BY e.name`).all<{ id: string; number: string | null; billing_mode: BillingMode | null; custom: number; party: string | null; reports: number }>(),
    db.prepare(`SELECT c.id, c.number, c.billing_mode, c.billing_text IS NOT NULL AS custom, e.name AS party, c.share, (SELECT COUNT(*) FROM orders o WHERE o.collaboration_id = c.id) AS orders
      FROM collaborations c JOIN entities e ON e.id = c.firm_id ORDER BY e.name`).all<{ id: string; number: string | null; billing_mode: BillingMode | null; custom: number; party: string; share: number | null; orders: number }>(),
  ]);
  return { contracts: contracts.results, collabs: collabs.results };
}

export async function setBillingRule(db: D1Database, actor: string, kind: "contract" | "collab", id: string, mode: string | null) {
  const m = mode && BILLING_MODES.some(([x]) => x === mode) ? mode : null;
  const r = kind === "contract"
    ? await db.prepare("UPDATE contracts SET billing_mode = ?, updated_at = ? WHERE id = ? AND kind = 'framework'").bind(m, now(), id).run()
    : await db.prepare("UPDATE collaborations SET billing_mode = ? WHERE id = ?").bind(m, id).run();
  if (!r.meta.changes) return { ok: false as const, error: "Contractul nu există." };
  await audit(db, `user:${actor}`, "settings.billing_rule", "settings", "billing", `${kind === "contract" ? "contract cadru" : "colaborare"} ${id}: ${m ?? "implicit"}`);
  return { ok: true as const };
}

// ---------- issuing ----------

export type InvoiceLine = { name: string; description: string; price: number; quantity: number; reportId: string | null };
type Party = { id: string | null; name: string; cif: string | null; rc: string | null; address: string | null; city: string | null; county: string | null; email: string | null; phone: string | null; vatPayer: boolean };

const partyOf = async (db: D1Database, entityId: string | null): Promise<Party | null> => {
  if (!entityId) return null;
  const e = await db.prepare("SELECT id, name, cui, reg_no, billing_address, city, county, email, phone, vat_payer FROM entities WHERE id = ?").bind(entityId)
    .first<{ id: string; name: string; cui: string | null; reg_no: string | null; billing_address: string | null; city: string | null; county: string | null; email: string | null; phone: string | null; vat_payer: number | null }>();
  return e ? { id: e.id, name: e.name, cif: e.cui, rc: e.reg_no, address: e.billing_address, city: e.city, county: e.county, email: e.email, phone: e.phone, vatPayer: !!e.vat_payer } : null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const totals = (lines: InvoiceLine[], vat: number) => {
  const net = round2(lines.reduce((s, l) => s + l.price * l.quantity, 0));
  const v = round2(net * vat / 100);
  return { net, vat: v, total: round2(net + v) };
};

export type Draft = {
  kind: "invoice" | "proforma"; party: Party; lines: InvoiceLine[]; totals: ReturnType<typeof totals>; series: string; contractId: string | null; collaborationId: string | null;
  mentions: string; problems: string[];
  // For the preview, laid out like the invoice: the supplier, dates, unit and VAT.
  supplier: { name: string; cui: string; reg: string; address: string; iban: string }; issueDate: string; dueDate: string | null; unit: string; vatPercent: number;
};

/** What would be invoiced for a classic contract: its reports not invoiced yet (one line each), else the contract fee. */
export async function draftForContract(db: D1Database, contractId: string, kind: "invoice" | "proforma"): Promise<Draft | { error: string }> {
  const [b, k] = await Promise.all([
    getBilling(db),
    db.prepare("SELECT id, kind, number, client_id, fee, purpose, report_type FROM contracts WHERE id = ?").bind(contractId)
      .first<{ id: string; kind: string; number: string | null; client_id: string | null; fee: number | null; purpose: string | null; report_type: string | null }>(),
  ]);
  if (!k) return { error: "Contractul nu există." };
  if (k.kind !== "classic") return { error: "Contractele cadru se facturează după regula lor (per comandă sau pe borderou)." };
  const party = await partyOf(db, k.client_id);
  if (!party) return { error: "Contractul nu are client." };
  const reports = (await db.prepare(`SELECT id, number, label, purpose, report_type, fee, valuation_types FROM reports WHERE contract_id = ? AND status <> 'cancelled'
      AND (? = 'proforma' OR invoice_id IS NULL) ORDER BY created_at, rowid`).bind(contractId, kind)
    .all<{ id: string; number: string | null; label: string | null; purpose: string | null; report_type: string | null; fee: number | null; valuation_types: string | null }>()).results;
  const withFee = reports.filter((r) => r.fee != null && r.fee > 0);
  const lines: InvoiceLine[] = withFee.length
    ? withFee.map((r) => ({ name: b.product, description: [r.report_type ?? "Raport de evaluare", r.valuation_types === "EBM" ? "bunuri mobile" : null, r.purpose, `contract nr. ${k.number}`].filter(Boolean).join(" · "), price: r.fee!, quantity: 1, reportId: r.id }))
    : k.fee ? [{ name: b.product, description: [k.report_type ?? "Raport de evaluare", k.purpose, `contract nr. ${k.number}`].filter(Boolean).join(" · "), price: k.fee, quantity: 1, reportId: null }] : [];
  return finishDraft(db, b, kind, party, lines, k.id, null, `Conform contractului de prestări servicii nr. ${k.number}.`);
}

/** The values a framework contract's invoice text can use, for one report. */
export async function reportValues(db: D1Database, reportId: string) {
  const r = await db.prepare(`SELECT r.number, r.report_type, r.delivered_at, r.bank_branch, k.number AS contract_number, k.signed_on, o.bank_ref, o.bank_branch AS order_branch,
      COALESCE(NULLIF(o.client_name, ''), c.name) AS client,
      (SELECT COALESCE(p.full_address, p.city) FROM assets a JOIN crm_properties p ON p.id = a.property_id WHERE a.report_id = r.id ORDER BY a.is_main DESC LIMIT 1) AS address
    FROM reports r LEFT JOIN contracts k ON k.id = r.contract_id LEFT JOIN orders o ON o.id = r.order_id LEFT JOIN entities c ON c.id = r.client_id WHERE r.id = ?`).bind(reportId)
    .first<{ number: string | null; report_type: string | null; delivered_at: string | null; bank_branch: string | null; contract_number: string | null; signed_on: string | null;
      bank_ref: string | null; order_branch: string | null; client: string | null; address: string | null }>();
  if (!r) return null;
  const day = (d: string | null) => (d ? bucharestDay(d).split("-").reverse().join(".") : "");
  const delivered = r.delivered_at ? bucharestDay(r.delivered_at) : null;
  return {
    contract: r.contract_number, contract_data: r.signed_on ? r.signed_on.split("-").reverse().join(".") : "", client: r.client, comanda: r.bank_ref,
    raport: r.number, tip_raport: r.report_type ?? "Raport de evaluare", agentie: r.bank_branch ?? r.order_branch, adresa: r.address,
    data_predare: day(r.delivered_at), luna: delivered ? new Date(`${delivered}T12:00:00Z`).toLocaleDateString("ro-RO", { month: "long", year: "numeric" }) : "",
  } as Record<string, string | null>;
}

export async function getBillingText(db: D1Database, kind: "contract" | "collab", id: string): Promise<BillingText> {
  const row = kind === "contract"
    ? await db.prepare("SELECT billing_text FROM contracts WHERE id = ?").bind(id).first<{ billing_text: string | null }>()
    : await db.prepare("SELECT billing_text FROM collaborations WHERE id = ?").bind(id).first<{ billing_text: string | null }>();
  return parseJson<BillingText>(row?.billing_text, {});
}

export async function saveBillingText(db: D1Database, actor: string, kind: "contract" | "collab", id: string, b: Record<string, unknown>) {
  const s = (k: string, max: number) => (typeof b[k] === "string" ? (b[k] as string).trim().slice(0, max) : "");
  const t: BillingText = { product: s("product", 120) || undefined, line: s("line", 500) || undefined, mentions: s("mentions", 1000) || undefined };
  const value = t.product || t.line || t.mentions ? JSON.stringify(t) : null;
  const r = kind === "contract"
    ? await db.prepare("UPDATE contracts SET billing_text = ?, updated_at = ? WHERE id = ? AND kind = 'framework'").bind(value, now(), id).run()
    : await db.prepare("UPDATE collaborations SET billing_text = ? WHERE id = ?").bind(value, id).run();
  if (!r.meta.changes) return { ok: false as const, error: "Contractul nu există." };
  await audit(db, `user:${actor}`, "settings.billing_rule", "settings", "billing", `text factură ${kind === "contract" ? "contract cadru" : "colaborare"} ${id}`);
  return { ok: true as const };
}

/** A recent report of the contract / collaboration, to preview its invoice text. */
export async function sampleValues(db: D1Database, kind: "contract" | "collab", id: string) {
  const r = kind === "contract"
    ? await db.prepare("SELECT id FROM reports WHERE contract_id = ? ORDER BY delivered_at IS NULL, COALESCE(delivered_at, created_at) DESC LIMIT 1").bind(id).first<{ id: string }>()
    : await db.prepare("SELECT r.id FROM reports r JOIN orders o ON o.id = r.order_id WHERE o.collaboration_id = ? ORDER BY r.delivered_at IS NULL, COALESCE(r.delivered_at, r.created_at) DESC LIMIT 1").bind(id).first<{ id: string }>();
  return r ? await reportValues(db, r.id) : null;
}

/** Per-order billing under a framework contract / collaboration: one approved (delivered) report, with that partner's own invoice text. */
export async function draftForReport(db: D1Database, reportId: string): Promise<Draft | { error: string }> {
  const b = await getBilling(db);
  const r = await db.prepare(`SELECT r.id, r.fee, r.delivered_at, r.status, r.glide_id, r.invoice_id, r.contract_id, k.kind AS contract_kind, k.client_id AS party_id, k.billing_mode, k.billing_text,
      o.collaboration_id, o.fee_net, c.billing_mode AS collab_mode, c.billing_text AS collab_text, c.firm_id
    FROM reports r LEFT JOIN contracts k ON k.id = r.contract_id LEFT JOIN orders o ON o.id = r.order_id LEFT JOIN collaborations c ON c.id = o.collaboration_id WHERE r.id = ?`).bind(reportId)
    .first<{ id: string; fee: number | null; delivered_at: string | null; status: string; glide_id: string | null; invoice_id: string | null; contract_id: string | null; contract_kind: string | null; party_id: string | null;
      billing_mode: BillingMode | null; billing_text: string | null; collaboration_id: string | null; fee_net: number | null; collab_mode: BillingMode | null; collab_text: string | null; firm_id: string | null }>();
  if (!r) return { error: "Raportul nu există." };
  if (r.invoice_id) return { error: "Raportul este deja facturat." };
  const collab = !!r.collaboration_id;
  const mode = collab ? r.collab_mode ?? b.collabDefault : r.contract_kind === "framework" ? r.billing_mode ?? b.frameworkDefault : null;
  if (mode !== "per_order") return { error: "Acest raport nu se facturează per comandă (vezi Setări → Facturare)." };
  // Reports brought from Glide were invoiced outside the CRM; new ones once finished (approved / delivered).
  if (r.glide_id) return { error: "Raport importat din Glide: a fost facturat în afara CRM-ului." };
  if (!r.delivered_at && r.status !== "done") return { error: "Factura se emite după finalizarea raportului." };
  const party = await partyOf(db, collab ? r.firm_id : r.party_id);
  if (!party) return { error: "Nu știu cui se facturează: contractul nu are bancă / firmă." };
  const price = collab ? r.fee_net ?? r.fee : r.fee;
  if (!price) return { error: "Raportul nu are onorariu." };
  const text = { ...DEFAULT_TEXT, ...parseJson<BillingText>(collab ? r.collab_text : r.billing_text, {}) };
  const vals = (await reportValues(db, r.id)) ?? {};
  const lines: InvoiceLine[] = [{ name: text.product || b.product, price, quantity: 1, reportId: r.id, description: fillText(text.line, vals) }];
  return finishDraft(db, b, "invoice", party, lines, collab ? null : r.contract_id, r.collaboration_id, fillText(text.mentions, vals));
}

async function finishDraft(db: D1Database, b: BillingSettings, kind: "invoice" | "proforma", party: Party, lines: InvoiceLine[], contractId: string | null, collaborationId: string | null, mention: string): Promise<Draft> {
  const firm = await getFirm(db);
  const issueDate = bucharestDay();
  const series = kind === "proforma" ? b.proformaSeries : b.invoiceSeries;
  const problems = [
    !b.cif && "firma (CIF) nu e aleasă în Setări → Facturare",
    !series && `seria de ${kind === "proforma" ? "proforme" : "facturi"} nu e aleasă în Setări → Facturare`,
    !lines.length && "nu există nimic de facturat (onorariu lipsă sau rapoarte deja facturate)",
    !party.address && "clientul nu are adresă de facturare",
  ].filter(Boolean) as string[];
  return {
    kind, party, lines, totals: totals(lines, b.vatPayer ? b.vatPercent : 0), series, contractId, collaborationId, mentions: [mention, b.mentions].filter(Boolean).join(" "), problems,
    supplier: { name: firm.name, cui: firm.cui, reg: firm.reg, address: firm.address, iban: firm.iban }, issueDate,
    dueDate: kind === "invoice" ? new Date(Date.parse(`${issueDate}T12:00:00Z`) + b.dueDays * 86400000).toISOString().slice(0, 10) : null,
    unit: b.unit, vatPercent: b.vatPayer ? b.vatPercent : 0,
  };
}

/** Issues the draft in Oblio, keeps the invoice and a copy of its PDF, and marks its reports as invoiced. */
export async function issue(db: D1Database, actor: string, d: Draft) {
  if (d.problems.length) return { ok: false as const, error: `Nu se poate emite: ${d.problems.join("; ")}.` };
  const b = await getBilling(db);
  const day = bucharestDay();
  const due = new Date(Date.parse(`${day}T12:00:00Z`) + b.dueDays * 86400000).toISOString().slice(0, 10);
  const payload = {
    cif: b.cif,
    client: {
      cif: d.party.cif ?? "", name: d.party.name, rc: d.party.rc ?? "", address: d.party.address ?? "", state: d.party.county ?? "", city: d.party.city ?? "",
      country: "Romania", email: d.party.email ?? "", phone: d.party.phone ?? "", vatPayer: d.party.vatPayer,
    },
    issueDate: day, dueDate: d.kind === "invoice" ? due : undefined, seriesName: d.series, language: b.language, precision: 2, currency: "RON",
    products: d.lines.map((l) => ({
      name: l.name, description: l.description, price: l.price, measuringUnit: b.unit, currency: "RON",
      vatName: b.vatPayer ? b.vatName : "Neplatitor", vatPercentage: b.vatPayer ? b.vatPercent : 0, vatIncluded: false, quantity: l.quantity, productType: "Serviciu",
    })),
    issuerName: b.issuer || undefined, mentions: d.mentions || undefined,
  };
  let doc;
  try { doc = await oblioCreate(db, d.kind, payload); }
  catch (e) { return { ok: false as const, error: e instanceof OblioError ? `Oblio: ${e.message}` : "Oblio nu a putut emite documentul." }; }
  const id = uuid(), t = now();
  const reportIds = d.lines.map((l) => l.reportId).filter(Boolean) as string[];
  await db.batch([
    db.prepare(`INSERT INTO invoices (id, kind, series, number, issue_date, due_date, client_id, client_name, contract_id, collaboration_id, report_ids, lines, net, vat, total, oblio_link, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, d.kind, doc.seriesName, String(doc.number), day, d.kind === "invoice" ? due : null, d.party.id, d.party.name, d.contractId, d.collaborationId,
        JSON.stringify(reportIds), JSON.stringify(d.lines), d.totals.net, d.totals.vat, d.totals.total, doc.link ?? null, actor, t, t),
    ...(d.kind === "invoice" ? reportIds.map((r) => db.prepare("UPDATE reports SET invoice_id = ? WHERE id = ? AND invoice_id IS NULL").bind(id, r)) : []),
  ]);
  await storePdf(db, id, doc.link);
  await audit(db, `user:${actor}`, d.kind === "invoice" ? "invoice.issue" : "proforma.issue", "contract", d.contractId ?? d.collaborationId ?? id, `${doc.seriesName} ${doc.number} · ${d.totals.total} lei · ${d.party.name}`);
  return { ok: true as const, id, series: doc.seriesName, number: String(doc.number) };
}

/** Our own copy of the PDF (the Oblio link keeps working too). */
export async function storePdf(db: D1Database, id: string, link: string | null | undefined) {
  if (!link) return false;
  const r2 = await bucket();
  if (!r2) return false;
  const res = await fetch(link).catch(() => null);
  if (!res?.ok || !res.body) return false;
  const key = `facturi/${id}.pdf`;
  await r2.put(key, res.body, { httpMetadata: { contentType: "application/pdf" } });
  await db.prepare("UPDATE invoices SET r2_key = ?, updated_at = ? WHERE id = ?").bind(key, now(), id).run();
  return true;
}

export type InvoiceRow = { id: string; kind: string; series: string; number: string; issue_date: string; due_date: string | null; client_id: string | null; client_name: string | null;
  contract_id: string | null; contract_number: string | null; total: number | null; status: string; paid_at: string | null; r2_key: string | null; oblio_link: string | null };

export async function invoicesFor(db: D1Database, f: { contract?: string; report?: string; status?: string; kind?: string; q?: string; limit?: number }) {
  const w: string[] = [], a: (string | number)[] = [];
  if (f.contract) { w.push("i.contract_id = ?"); a.push(f.contract); }
  if (f.report) { w.push("EXISTS (SELECT 1 FROM json_each(i.report_ids) j WHERE j.value = ?)"); a.push(f.report); }
  if (f.kind) { w.push("i.kind = ?"); a.push(f.kind); }
  if (f.status === "neincasate") w.push("i.kind = 'invoice' AND i.status = 'issued'");
  else if (f.status === "scadente") { w.push("i.kind = 'invoice' AND i.status = 'issued' AND i.due_date < ?"); a.push(bucharestDay()); }
  else if (f.status) { w.push("i.status = ?"); a.push(f.status); }
  if (f.q?.trim()) { const like = `%${f.q.trim().replace(/[%_]/g, "")}%`; w.push("(i.client_name LIKE ? OR (i.series || ' ' || i.number) LIKE ? OR i.number = ?)"); a.push(like, like, f.q.trim()); }
  return (await db.prepare(`SELECT i.id, i.kind, i.series, i.number, i.issue_date, i.due_date, i.client_id, i.client_name, i.contract_id, k.number AS contract_number, i.total, i.status, i.paid_at, i.r2_key, i.oblio_link
      FROM invoices i LEFT JOIN contracts k ON k.id = i.contract_id ${w.length ? `WHERE ${w.join(" AND ")}` : ""} ORDER BY i.issue_date DESC, i.created_at DESC LIMIT ${f.limit ?? 200}`)
    .bind(...a).all<InvoiceRow>()).results;
}

/** Records the payment in Oblio and here. */
export async function markPaid(db: D1Database, actor: string, id: string, v: { type: string; document: string; date: string }) {
  const [b, inv] = await Promise.all([getBilling(db), db.prepare("SELECT * FROM invoices WHERE id = ?").bind(id).first<{ id: string; kind: string; series: string; number: string; total: number; status: string }>()]);
  if (!inv || inv.kind !== "invoice") return { ok: false as const, error: "Factura nu există." };
  if (inv.status !== "issued") return { ok: false as const, error: "Factura nu mai este de încasat." };
  try { await oblioCollect(db, b.cif, inv.series, inv.number, { type: v.type || "Ordin de plata", documentNumber: v.document, value: inv.total, issueDate: v.date }); }
  catch (e) { return { ok: false as const, error: e instanceof OblioError ? `Oblio: ${e.message}` : "Oblio nu a putut înregistra încasarea." }; }
  await db.prepare("UPDATE invoices SET status = 'paid', paid_at = ?, updated_at = ? WHERE id = ?").bind(v.date, now(), id).run();
  await audit(db, `user:${actor}`, "invoice.paid", "invoice", id, `${inv.series} ${inv.number} · ${v.type} ${v.document}`);
  return { ok: true as const };
}

/** Cancels the document in Oblio (it stays numbered, marked cancelled) and frees its reports. */
export async function cancelInvoice(db: D1Database, actor: string, id: string) {
  const [b, inv] = await Promise.all([getBilling(db), db.prepare("SELECT id, kind, series, number, status FROM invoices WHERE id = ?").bind(id).first<{ id: string; kind: "invoice" | "proforma"; series: string; number: string; status: string }>()]);
  if (!inv) return { ok: false as const, error: "Documentul nu există." };
  if (inv.status === "cancelled") return { ok: false as const, error: "Documentul este deja anulat." };
  if (inv.status === "paid") return { ok: false as const, error: "Factura este încasată: se stornează din Oblio." };
  try { await oblioCancel(db, inv.kind, b.cif, inv.series, inv.number); }
  catch (e) { return { ok: false as const, error: e instanceof OblioError ? `Oblio: ${e.message}` : "Oblio nu a putut anula documentul." }; }
  await db.batch([
    db.prepare("UPDATE invoices SET status = 'cancelled', updated_at = ? WHERE id = ?").bind(now(), id),
    db.prepare("UPDATE reports SET invoice_id = NULL WHERE invoice_id = ?").bind(id),
  ]);
  await audit(db, `user:${actor}`, "invoice.cancel", "invoice", id, `${inv.series} ${inv.number}`);
  return { ok: true as const };
}


/**
 * Full test without a fiscal document: a proforma of 1 leu to VALUEFY itself, marked TEST, its PDF fetched, then
 * deleted from Oblio (a proforma is not an invoice and does not go to e-Factura). Nothing is saved in the CRM.
 */
export async function testProforma(db: D1Database, actor: string) {
  const [b, firm] = await Promise.all([getBilling(db), getFirm(db)]);
  if (!b.cif || !b.proformaSeries) return { ok: false as const, steps: [], error: "Alege întâi firma și seria de proforme și salvează setările." };
  const steps: string[] = [];
  let doc;
  try {
    doc = await oblioCreate(db, "proforma", {
      cif: b.cif, client: { cif: b.cif, name: firm.name, address: firm.address, city: "", country: "Romania", vatPayer: b.vatPayer },
      issueDate: bucharestDay(), seriesName: b.proformaSeries, language: b.language, precision: 2, currency: "RON",
      products: [{ name: "TEST CRM — document de probă, se șterge automat", price: 1, measuringUnit: b.unit, currency: "RON",
        vatName: b.vatPayer ? b.vatName : "Neplatitor", vatPercentage: b.vatPayer ? b.vatPercent : 0, vatIncluded: false, quantity: 1, productType: "Serviciu" }],
      mentions: "Document de test emis din CRM.",
    });
    steps.push(`Proformă de test emisă în Oblio: ${doc.seriesName} ${doc.number}`);
  } catch (e) {
    return { ok: false as const, steps, error: e instanceof OblioError ? `Oblio a refuzat proforma: ${e.message}` : "Oblio nu a răspuns la emitere." };
  }
  const pdf = doc.link ? await fetch(doc.link).catch(() => null) : null;
  steps.push(pdf?.ok ? `PDF descărcat (${Math.round(Number(pdf.headers.get("content-length") ?? 0) / 1024) || "?"} KB)` : "PDF-ul nu a putut fi descărcat (linkul Oblio)");
  try {
    await oblioDelete(db, "proforma", b.cif, doc.seriesName, String(doc.number));
    steps.push("Proforma de test a fost ștearsă din Oblio");
  } catch (e) {
    steps.push(`Proforma NU a putut fi ștearsă automat (${e instanceof OblioError ? e.message : "eroare"}) — șterge-o manual din Oblio: ${doc.seriesName} ${doc.number}`);
  }
  await audit(db, `user:${actor}`, "settings.billing_test", "settings", "billing", steps.join(" · "));
  return { ok: !!pdf?.ok, steps, error: pdf?.ok ? null : "Emiterea merge, dar PDF-ul nu a putut fi descărcat." };
}
