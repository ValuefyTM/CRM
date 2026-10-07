// Server-only: valuation reports (imported from Glide, later produced in the CRM).
import { withPresence } from "./presence";

export const REPORT_STATUS: Record<string, [string, string]> = {
  draft: ["Draft", ""],
  in_progress: ["În lucru", "pillInfo"],
  suspended: ["Suspendat", "pillWarn"],
  done: ["Finalizat", "pillOk"],
  cancelled: ["Anulat", "pillErr"],
};
export const ROLE_LABEL: Record<string, string> = { inspector: "Inspector", evaluator: "Evaluator", verifier: "Verificator", assistant: "Asistent" };
export const INSPECTION_STATUS: Record<string, [string, string]> = {
  to_schedule: ["De programat", "pillWarn"],
  scheduled: ["Programată", "pillInfo"],
  done: ["Realizată", "pillOk"],
  cancelled: ["Anulată", "pillErr"],
};

export type ReportRow = {
  id: string; number: string | null; label: string | null; report_date: string | null; status: string; fee: number | null; result_value: number | null;
  report_type: string | null; client_name: string | null; bank_code: string | null; issuer_name: string | null; evaluator: string | null; asset: string | null;
};

const ROW = `SELECT r.id, r.number, r.label, r.report_date, r.status, r.fee, r.result_value, r.report_type,
  c.name AS client_name, COALESCE(b.code, b.name) AS bank_code, i.name AS issuer_name,
  (SELECT u.name FROM report_members m JOIN users u ON u.id = m.user_id WHERE m.report_id = r.id AND m.role = 'evaluator' LIMIT 1) AS evaluator,
  (SELECT COALESCE(p.type, '') || '|' || COALESCE(p.full_address, p.city, '') FROM assets a JOIN crm_properties p ON p.id = a.property_id
     WHERE a.report_id = r.id ORDER BY a.is_main DESC LIMIT 1) AS asset
  FROM reports r LEFT JOIN entities c ON c.id = r.client_id LEFT JOIN entities b ON b.id = r.recipient_id LEFT JOIN entities i ON i.id = r.issuer_id`;

export type ReportFilters = { q?: string; status?: string; year?: string; bank?: string; issuer?: string; evaluator?: string; sort?: string; page?: number; etapa?: string; termen?: string };

export const REPORT_SORTS: Record<string, [string, string]> = {
  "": ["Cele mai noi", "COALESCE(r.report_date, substr(r.created_at, 1, 10)) DESC, CAST(r.number AS INTEGER) DESC"],
  old: ["Cele mai vechi", "COALESCE(r.report_date, substr(r.created_at, 1, 10)) ASC"],
  fee: ["Onorariu mare", "r.fee DESC NULLS LAST"],
  value: ["Valoare mare", "r.result_value DESC NULLS LAST"],
};
export const PAGE_SIZE = 50;

// Working stage and deadline in SQL (same rules as stageOf / dueOf in dossier.ts), for the dashboard links.
const TASKS = "(SELECT COUNT(*) FROM inspections i WHERE i.report_id = r.id AND i.status <> 'cancelled')";
const TASKS_DONE = "(SELECT COUNT(*) FROM inspections i WHERE i.report_id = r.id AND i.status = 'done')";
const NO_INSP = "(SELECT COUNT(*) FROM assets a WHERE a.report_id = r.id AND a.no_inspection IS NOT NULL)";
export const STAGE_SQL = `CASE WHEN r.delivered_at IS NOT NULL OR r.status = 'done' THEN 'delivered' WHEN r.stage = 'review' THEN 'review'
  WHEN r.stage = 'drafting' OR (${TASKS} > 0 AND ${TASKS_DONE} = ${TASKS}) OR (${TASKS} = 0 AND ${NO_INSP} > 0) THEN 'drafting' ELSE 'inspection' END`;
const INSPECTED = "(SELECT substr(MAX(i.done_at), 1, 10) FROM inspections i WHERE i.report_id = r.id AND i.status = 'done')";
// n working days after the inspection: from a weekend day count from the Friday before; n + 2 days for every weekend crossed.
const WD = `CAST(strftime('%w', ${INSPECTED}) AS INTEGER)`;
export const DUE_SQL = `COALESCE(r.due_on, CASE WHEN r.term_days > 0 AND ${INSPECTED} IS NOT NULL THEN date(${INSPECTED},
  ((CASE ${WD} WHEN 6 THEN -1 WHEN 0 THEN -2 ELSE 0 END) + r.term_days + 2 * ((r.term_days + (CASE WHEN ${WD} IN (0, 6) THEN 5 ELSE ${WD} END) - 1) / 5)) || ' days') END)`;
export const STAGE_FILTERS: Record<string, string> = { inspectie: "inspection", redactare: "drafting", verificare: "review" };
export const DUE_FILTERS: Record<string, string> = { depasit: "Termen depășit", curand: "Termen în 2 zile" };
const bucharestToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });

function where(f: ReportFilters) {
  const w: string[] = [];
  const p: (string | number)[] = [];
  const open = "r.status IN ('draft', 'in_progress') AND r.delivered_at IS NULL";
  if (f.etapa && STAGE_FILTERS[f.etapa]) { w.push(`${open} AND (${STAGE_SQL}) = ?`); p.push(STAGE_FILTERS[f.etapa]); }
  if (f.termen === "depasit") { w.push(`${open} AND (${DUE_SQL}) < ?`); p.push(bucharestToday()); }
  if (f.termen === "curand") {
    const d = new Date(`${bucharestToday()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 2);
    w.push(`${open} AND (${DUE_SQL}) BETWEEN ? AND ?`); p.push(bucharestToday(), d.toISOString().slice(0, 10));
  }
  if (f.status && REPORT_STATUS[f.status]) { w.push("r.status = ?"); p.push(f.status); }
  if (f.status === "deschise") w.push("r.status IN ('draft', 'in_progress') AND r.delivered_at IS NULL");
  if (f.year && /^\d{4}$/.test(f.year)) { w.push("COALESCE(r.reporting_year, CAST(substr(r.report_date, 1, 4) AS INTEGER)) = ?"); p.push(Number(f.year)); }
  if (f.bank) { w.push("COALESCE(b.code, b.name) = ?"); p.push(f.bank); }
  if (f.issuer) { w.push("r.issuer_id = ?"); p.push(f.issuer); }
  if (f.evaluator) { w.push("EXISTS (SELECT 1 FROM report_members m WHERE m.report_id = r.id AND m.role = 'evaluator' AND m.user_id = ?)"); p.push(f.evaluator); }
  const q = f.q?.trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    w.push(`(r.label LIKE ? OR c.name LIKE ? OR r.number = ? OR c.phone LIKE ? OR EXISTS (SELECT 1 FROM assets a JOIN crm_properties p ON p.id = a.property_id
      WHERE a.report_id = r.id AND (p.full_address LIKE ? OR p.cf_number LIKE ? OR p.street LIKE ?)))`);
    p.push(like, like, q, like, like, like, like);
  }
  return { sql: w.length ? `WHERE ${w.join(" AND ")}` : "", params: p };
}

export async function listReports(db: D1Database, f: ReportFilters) {
  const { sql, params } = where(f);
  const from = `FROM reports r LEFT JOIN entities c ON c.id = r.client_id LEFT JOIN entities b ON b.id = r.recipient_id`;
  const [rows, sum] = await Promise.all([
    db.prepare(`${ROW} ${sql} ORDER BY ${(REPORT_SORTS[f.sort ?? ""] ?? REPORT_SORTS[""])[1]} LIMIT ${PAGE_SIZE} OFFSET ?`)
      .bind(...params, ((f.page ?? 1) - 1) * PAGE_SIZE).all<ReportRow>(),
    db.prepare(`SELECT COUNT(*) AS n, SUM(CASE WHEN r.status = 'done' THEN r.fee END) AS fees, SUM(r.status = 'done') AS done,
      SUM(r.status IN ('draft', 'in_progress')) AS open, SUM(r.status = 'suspended') AS suspended ${from} ${sql}`)
      .bind(...params).first<{ n: number; fees: number | null; done: number | null; open: number | null; suspended: number | null }>(),
  ]);
  return { rows: rows.results, total: sum?.n ?? 0, fees: sum?.fees ?? 0, done: sum?.done ?? 0, open: sum?.open ?? 0, suspended: sum?.suspended ?? 0 };
}

/** Values for the filter chips. */
export async function reportFacets(db: D1Database) {
  const [years, banks, issuers, evaluators] = await Promise.all([
    db.prepare(`SELECT COALESCE(reporting_year, CAST(substr(report_date, 1, 4) AS INTEGER)) AS y, COUNT(*) AS n FROM reports GROUP BY y HAVING y IS NOT NULL ORDER BY y DESC`).all<{ y: number; n: number }>(),
    db.prepare(`SELECT COALESCE(b.code, b.name) AS code, COUNT(*) AS n FROM reports r JOIN entities b ON b.id = r.recipient_id GROUP BY code ORDER BY n DESC`).all<{ code: string; n: number }>(),
    db.prepare(`SELECT i.id, i.name, COUNT(*) AS n FROM reports r JOIN entities i ON i.id = r.issuer_id GROUP BY i.id ORDER BY n DESC`).all<{ id: string; name: string; n: number }>(),
    db.prepare(`SELECT u.id, COALESCE(NULLIF(u.name, ''), u.email) AS name, COUNT(*) AS n FROM report_members m JOIN users u ON u.id = m.user_id WHERE m.role = 'evaluator' GROUP BY u.id ORDER BY n DESC`).all<{ id: string; name: string; n: number }>(),
  ]);
  return { years: years.results, banks: banks.results, issuers: issuers.results, evaluators: evaluators.results };
}

export async function reportsForOrder(db: D1Database, orderId: string) {
  return (await db.prepare(`${ROW} WHERE r.order_id = ? ORDER BY r.report_date DESC`).bind(orderId).all<ReportRow>()).results;
}

export type Report = ReportRow & {
  issuer_id: string | null; contract_id: string | null; order_id: string | null; client_id: string | null; recipient_id: string | null;
  bank_branch: string | null; valuation_types: string | null; purpose: string | null; value_type: string | null; valuation_date: string | null;
  received_on: string | null; uploaded_on: string | null; currency: string; collab_fee: number | null; suspend_reason: string | null;
  reporting_year: number | null; market_analysis: string | null; glide_id: string | null; created_at: string;
  client_kind: string | null; client_phone: string | null; client_email: string | null; client_cui: string | null; client_address: string | null;
  bank_name: string | null; contract_number: string | null; contract_kind: string | null; contract_date: string | null; contract_fee: number | null;
  referral_name: string | null; referral_id: string | null;
  notes: string | null; delivered_at: string | null; delivered_by_name: string | null; updated_at: string;
  stage: string | null; term_days: number | null; due_on: string | null; offer_id: string | null; client_notified_at: string | null;
  order_seq: number | null; order_bank_ref: string | null; order_source: string | null; statement_number: string | null; client_code: string | null;
  recipient_kind: string | null; recipient_email: string | null; recipient_phone: string | null; recipient_code: string | null; issuer_logo: string | null;
};

export async function getReport(db: D1Database, id: string) {
  return db
    .prepare(
      `SELECT r.*, c.name AS client_name, c.kind AS client_kind, c.phone AS client_phone, c.email AS client_email, c.cui AS client_cui, c.billing_address AS client_address,
        COALESCE(b.code, b.name) AS bank_code, b.name AS bank_name, i.name AS issuer_name, i.logo_url AS issuer_logo,
        k.number AS contract_number, k.kind AS contract_kind, k.signed_on AS contract_date, k.fee AS contract_fee,
        ru.name AS referral_name, ru.id AS referral_id, COALESCE(NULLIF(du.name, ''), du.email) AS delivered_by_name,
        o.seq AS order_seq, o.bank_ref AS order_bank_ref, o.source AS order_source, st.number AS statement_number, c.code AS client_code,
        b.kind AS recipient_kind, b.email AS recipient_email, b.phone AS recipient_phone, b.code AS recipient_code
       FROM reports r LEFT JOIN entities c ON c.id = r.client_id LEFT JOIN entities b ON b.id = r.recipient_id LEFT JOIN entities i ON i.id = r.issuer_id
       LEFT JOIN contracts k ON k.id = r.contract_id LEFT JOIN users ru ON ru.id = r.referral_user_id LEFT JOIN users du ON du.id = r.delivered_by
       LEFT JOIN orders o ON o.id = r.order_id LEFT JOIN statements st ON st.id = o.statement_id WHERE r.id = ?`,
    )
    .bind(id)
    .first<Report>();
}

export type TeamMember = {
  role: string; id: string; name: string; email: string; phone: string | null; anevar_no: string | null; specializations: string | null; coverage: string | null;
  engagement: string | null; share_evaluator: number | null; share_verifier: number | null;
};

export async function reportTeam(db: D1Database, id: string) {
  return withPresence((await db.prepare(`SELECT m.role, u.id, u.name, u.email, u.phone, u.anevar_no, u.specializations, u.coverage, u.engagement, u.share_evaluator, u.share_verifier, u.last_seen_at, u.avatar_at
    FROM report_members m JOIN users u ON u.id = m.user_id WHERE m.report_id = ?
    ORDER BY CASE m.role WHEN 'evaluator' THEN 1 WHEN 'inspector' THEN 2 WHEN 'verifier' THEN 3 ELSE 4 END`).bind(id).all<TeamMember & { last_seen_at: string | null; avatar_at: string | null }>()).results);
}

/** People who can be put on a report: active internal accounts. */
export async function teamCandidates(db: D1Database) {
  return withPresence((await db.prepare("SELECT id, COALESCE(NULLIF(name, ''), email) AS name, role, last_seen_at, avatar_at FROM users WHERE kind = 'internal' AND status NOT IN ('disabled', 'deleted') ORDER BY name")
    .all<{ id: string; name: string; role: string; last_seen_at: string | null; avatar_at: string | null }>()).results);
}

export type ReportDocument = {
  id: string; report_id: string; kind: "source" | "final"; filename: string; content_type: string | null; size_bytes: number | null; r2_key: string | null;
  status: "uploaded" | "missing"; requested_at: string | null; uploaded_by_name: string | null; created_at: string;
  doc_type: string | null; asset_id: string | null;
};

export async function reportDocuments(db: D1Database, id: string) {
  return (await db.prepare(`SELECT d.*, COALESCE(NULLIF(u.name, ''), u.email) AS uploaded_by_name FROM report_documents d LEFT JOIN users u ON u.id = d.uploaded_by
    WHERE d.report_id = ? ORDER BY d.status = 'missing' DESC, d.created_at DESC`).bind(id).all<ReportDocument>()).results;
}

/** Documents that came with the order (portal uploads), shown as source documents of the report. */
export async function reportOrderDocuments(db: D1Database, orderId: string | null) {
  if (!orderId) return [];
  return (await db.prepare("SELECT id, kind, filename, content_type, size_bytes, created_at FROM order_documents WHERE order_id = ? ORDER BY created_at")
    .bind(orderId).all<{ id: string; kind: string; filename: string; content_type: string | null; size_bytes: number; created_at: string }>()).results;
}

export type AssetDetail = {
  id: string; is_main: number; value: number | null; approach: string | null; property_id: string;
  category: string | null; type: string | null; construction: string | null; county: string | null; city: string | null; full_address: string | null;
  geo: string | null; cf_number: string | null; cad_building: string | null; usable_area: number | null; year_built: number | null;
  description: string | null; image_url: string | null; cf_file: string | null; plan_file: string | null;
  cad_land: string | null; notes: string | null; a_contact_kind: string | null; a_contact_name: string | null; a_contact_phone: string | null;
  inspection_id: string | null; inspection_from_glide: number | null; inspection_status: string | null; scheduled_at: string | null; done_at: string | null;
  inspector: string | null; inspector_id: string | null; due_on: string | null; instructions: string | null; sheet_type: string | null;
  assigned_at: string | null; assigned_by_name: string | null; sheet_status: string | null;
  contact_kind: string | null; contact_name: string | null; contact_phone: string | null;
  sheet_photo: string | null; sheet_signature: string | null; sheet_person: string | null; sheet_location: string | null; sheet_description: string | null;
  other_reports: number;
  no_inspection: string | null; no_inspection_at: string | null;
};

export async function reportAssets(db: D1Database, id: string) {
  return (await db
    .prepare(
      `SELECT a.id, a.is_main, a.value, a.approach, p.id AS property_id, p.category, p.type, p.construction, p.county, p.city, p.full_address, p.geo, p.cf_number,
        p.cad_building, p.usable_area, p.year_built, p.description, p.image_url, p.cf_file, p.plan_file, p.cad_land, a.notes, a.contact_kind AS a_contact_kind, a.contact_name AS a_contact_name, a.contact_phone AS a_contact_phone,
        a.no_inspection, a.no_inspection_at,
        i.id AS inspection_id, i.glide_id IS NOT NULL AS inspection_from_glide, i.status AS inspection_status, i.scheduled_at, i.done_at,
        COALESCE(NULLIF(u.name, ''), u.email) AS inspector, i.inspector_id, i.due_on, i.instructions, i.sheet_type, i.assigned_at,
        (SELECT COALESCE(NULLIF(x.name, ''), x.email) FROM users x WHERE x.id = i.assigned_by) AS assigned_by_name, s.status AS sheet_status,
        i.contact_kind, i.contact_name, i.contact_phone,
        s.photo_url AS sheet_photo, s.signature_url AS sheet_signature, s.present_person AS sheet_person, s.location AS sheet_location, s.description AS sheet_description,
        (SELECT COUNT(*) FROM assets x WHERE x.property_id = p.id AND x.id <> a.id) AS other_reports
       FROM assets a JOIN crm_properties p ON p.id = a.property_id
       -- The current inspection of the asset: the one given from the CRM (newest, not cancelled), else the one imported from Glide.
       LEFT JOIN inspections i ON i.id = (SELECT x.id FROM inspections x WHERE x.asset_id = a.id
         ORDER BY x.glide_id IS NULL AND x.status <> 'cancelled' DESC, x.glide_id IS NOT NULL DESC, x.created_at DESC LIMIT 1)
       LEFT JOIN users u ON u.id = i.inspector_id
       LEFT JOIN inspection_sheets s ON s.id = (SELECT y.id FROM inspection_sheets y WHERE y.asset_id = a.id ORDER BY y.inspection_id = i.id DESC, y.created_at DESC LIMIT 1)
       WHERE a.report_id = ? ORDER BY a.is_main DESC`,
    )
    .bind(id)
    .all<AssetDetail>()).results;
}

/** Other valuations of the same property (same CF number), newest first. */
export async function propertyHistory(db: D1Database, propertyId: string, exceptReport: string) {
  return (await db.prepare(`${ROW} WHERE r.id <> ? AND r.id IN (SELECT report_id FROM assets WHERE property_id = ?) ORDER BY r.report_date DESC`).bind(exceptReport, propertyId).all<ReportRow>()).results;
}

/** Report log: CRM events on the report plus the dates known from Glide (oldest last). */
export async function reportLog(db: D1Database, r: Report, assets: AssetDetail[]) {
  const { results } = await db
    .prepare(
      `SELECT a.at, a.action, a.details, COALESCE(NULLIF(u.name, ''), u.email) AS actor_name FROM audit_log a
       LEFT JOIN users u ON a.actor IN ('user:' || u.id, 'staff:' || u.id) WHERE a.entity = 'report' AND a.entity_id = ? ORDER BY a.at DESC LIMIT 40`,
    )
    .bind(r.id)
    .all<{ at: string; action: string; details: string | null; actor_name: string | null }>();
  const log: { at: string; text: string; who: string | null }[] = results.map((l) => ({ at: l.at, text: REPORT_ACTION[l.action] ? REPORT_ACTION[l.action](l.details) : l.action, who: l.actor_name }));
  for (const a of assets) {
    const what = cap(a.type) || "bun";
    if (a.done_at) log.push({ at: a.done_at, text: `Inspecție realizată — ${what}${a.sheet_photo ? " (fișă cu fotografie)" : ""}`, who: a.inspector });
    else if (a.scheduled_at) log.push({ at: a.scheduled_at, text: `Inspecție programată — ${what}`, who: a.inspector });
  }
  if (r.report_date) log.push({ at: r.report_date, text: `Raport datat${r.number ? ` nr. ${r.number}` : ""}`, who: null });
  if (r.received_on) log.push({ at: r.received_on, text: r.order_id ? "Lucrare intrată din comandă" : "Lucrare intrată", who: null });
  return log.sort((x, y) => y.at.localeCompare(x.at));
}

const REPORT_ACTION: Record<string, (d: string | null) => string> = {
  "report.status": (d) => `Status schimbat${d ? `: ${d}` : ""}`,
  "report.notes": () => "Note interne actualizate",
  "report.document": (d) => `Document încărcat${d ? `: ${d}` : ""}`,
  "report.document_missing": (d) => `Document solicitat${d ? `: ${d}` : ""}`,
  "report.document_remove": (d) => `Document șters${d ? `: ${d}` : ""}`,
  "report.final": (d) => `Raport final încărcat${d ? `: ${d}` : ""}`,
  "report.delivered": (d) => `Raport predat${d ? ` (${d})` : ""}`,
  "report.asset_add": (d) => `Bun adăugat${d ? `: ${d}` : ""}`,
  "report.asset_edit": (d) => `Bun modificat${d ? `: ${d}` : ""}`,
  "report.asset_remove": (d) => `Bun scos din raport${d ? `: ${d}` : ""}`,
  "report.opened": (d) => `Raport creat${d ? ` ${d}` : ""}`,
  "report.stage": (d) => `Etapă: ${d ?? ""}`.trim(),
  "report.client_notified": (d) => `Clientul a fost anunțat că raportul e gata${d ? ` (${d})` : ""}`,
  "report.member": (d) => `Echipă: adăugat ${d ?? ""}`.trim(),
  "report.inspection_assign": (d) => `Inspecție alocată${d ? `: ${d}` : ""}`,
  "report.inspection_reassign": (d) => `Inspecție realocată${d ? `: ${d}` : ""}`,
  "report.inspection_cancel": (d) => `Inspecție anulată${d ? ` (${d})` : ""}`,
  "report.member_remove": (d) => `Echipă: scos ${d ?? ""}`.trim(),
};

export const lei = (n: number | null | undefined, cur = "lei") => (n == null ? "—" : `${n.toLocaleString("ro-RO", { maximumFractionDigits: 2 })} ${cur}`);
/** Glide stores property types in capitals: "APARTAMENT IN BLOC" → "Apartament in bloc". */
export const cap = (s: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : "");
