// Server-only: valuation reports (imported from Glide, later produced in the CRM).

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

export type ReportFilters = { q?: string; status?: string; year?: string; bank?: string; issuer?: string; evaluator?: string; sort?: string; page?: number };

export const REPORT_SORTS: Record<string, [string, string]> = {
  "": ["Cele mai noi", "COALESCE(r.report_date, substr(r.created_at, 1, 10)) DESC, CAST(r.number AS INTEGER) DESC"],
  old: ["Cele mai vechi", "COALESCE(r.report_date, substr(r.created_at, 1, 10)) ASC"],
  fee: ["Onorariu mare", "r.fee DESC NULLS LAST"],
  value: ["Valoare mare", "r.result_value DESC NULLS LAST"],
};
export const PAGE_SIZE = 50;

function where(f: ReportFilters) {
  const w: string[] = [];
  const p: (string | number)[] = [];
  if (f.status && REPORT_STATUS[f.status]) { w.push("r.status = ?"); p.push(f.status); }
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
};

export async function getReport(db: D1Database, id: string) {
  return db
    .prepare(
      `SELECT r.*, c.name AS client_name, c.kind AS client_kind, c.phone AS client_phone, c.email AS client_email, c.cui AS client_cui, c.billing_address AS client_address,
        COALESCE(b.code, b.name) AS bank_code, b.name AS bank_name, i.name AS issuer_name,
        k.number AS contract_number, k.kind AS contract_kind, k.signed_on AS contract_date, k.fee AS contract_fee,
        ru.name AS referral_name, ru.id AS referral_id
       FROM reports r LEFT JOIN entities c ON c.id = r.client_id LEFT JOIN entities b ON b.id = r.recipient_id LEFT JOIN entities i ON i.id = r.issuer_id
       LEFT JOIN contracts k ON k.id = r.contract_id LEFT JOIN users ru ON ru.id = r.referral_user_id WHERE r.id = ?`,
    )
    .bind(id)
    .first<Report>();
}

export async function reportTeam(db: D1Database, id: string) {
  return (await db.prepare(`SELECT m.role, u.id, u.name, u.email FROM report_members m JOIN users u ON u.id = m.user_id WHERE m.report_id = ?
    ORDER BY CASE m.role WHEN 'inspector' THEN 1 WHEN 'evaluator' THEN 2 WHEN 'verifier' THEN 3 ELSE 4 END`).bind(id).all<{ role: string; id: string; name: string; email: string }>()).results;
}

export type AssetDetail = {
  id: string; is_main: number; value: number | null; approach: string | null; property_id: string;
  category: string | null; type: string | null; construction: string | null; county: string | null; city: string | null; full_address: string | null;
  geo: string | null; cf_number: string | null; cad_building: string | null; usable_area: number | null; year_built: number | null;
  description: string | null; image_url: string | null; cf_file: string | null; plan_file: string | null;
  inspection_status: string | null; scheduled_at: string | null; done_at: string | null; inspector: string | null;
  contact_kind: string | null; contact_name: string | null; contact_phone: string | null;
  sheet_photo: string | null; sheet_person: string | null; sheet_location: string | null; sheet_description: string | null;
  other_reports: number;
};

export async function reportAssets(db: D1Database, id: string) {
  return (await db
    .prepare(
      `SELECT a.id, a.is_main, a.value, a.approach, p.id AS property_id, p.category, p.type, p.construction, p.county, p.city, p.full_address, p.geo, p.cf_number,
        p.cad_building, p.usable_area, p.year_built, p.description, p.image_url, p.cf_file, p.plan_file,
        i.status AS inspection_status, i.scheduled_at, i.done_at, u.name AS inspector, i.contact_kind, i.contact_name, i.contact_phone,
        s.photo_url AS sheet_photo, s.present_person AS sheet_person, s.location AS sheet_location, s.description AS sheet_description,
        (SELECT COUNT(*) FROM assets x WHERE x.property_id = p.id AND x.id <> a.id) AS other_reports
       FROM assets a JOIN crm_properties p ON p.id = a.property_id LEFT JOIN inspections i ON i.asset_id = a.id LEFT JOIN users u ON u.id = i.inspector_id
       LEFT JOIN inspection_sheets s ON s.asset_id = a.id
       WHERE a.report_id = ? ORDER BY a.is_main DESC`,
    )
    .bind(id)
    .all<AssetDetail>()).results;
}

/** Other valuations of the same property (same CF number), newest first. */
export async function propertyHistory(db: D1Database, propertyId: string, exceptReport: string) {
  return (await db.prepare(`${ROW} WHERE r.id <> ? AND r.id IN (SELECT report_id FROM assets WHERE property_id = ?) ORDER BY r.report_date DESC`).bind(exceptReport, propertyId).all<ReportRow>()).results;
}

export const lei = (n: number | null | undefined, cur = "lei") => (n == null ? "—" : `${n.toLocaleString("ro-RO", { maximumFractionDigits: 2 })} ${cur}`);
/** Glide stores property types in capitals: "APARTAMENT IN BLOC" → "Apartament in bloc". */
export const cap = (s: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : "");
