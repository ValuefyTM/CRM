// Server-only: "De facturat" — the finished reports (done / delivered) on a framework contract or a collaboration
// invoiced per report, not invoiced yet. They are the billing tasks of the Facturare module: each one is previewed
// and issued in Oblio from there. Nothing is stored: a report leaves the list when its invoice is issued.
import { FINISHED_HERE, getBilling } from "./billing";
import { can, type WithPerms } from "./perms";
import { audit } from "./auth";
import { now } from "./db";

export type BillTask = {
  id: string; number: string | null; label: string | null; fee: number | null; fee_gross: number | null; finished_at: string | null; report_type: string | null;
  contract_id: string | null; contract_number: string | null; collab: number; party: string | null; bank_ref: string | null; evaluator: string | null; evaluator_id: string | null;
};

const SELECT = `SELECT r.id, r.number, r.label, r.fee, r.fee_gross, COALESCE(r.delivered_at, r.updated_at) AS finished_at, r.report_type, r.contract_id, k.number AS contract_number,
    (o.collaboration_id IS NOT NULL) AS collab, COALESCE(e.name, f.name) AS party, o.bank_ref,
    m.user_id AS evaluator_id, (SELECT COALESCE(NULLIF(u.name, ''), u.email) FROM users u WHERE u.id = m.user_id) AS evaluator
  FROM reports r LEFT JOIN contracts k ON k.id = r.contract_id LEFT JOIN entities e ON e.id = k.client_id
    LEFT JOIN orders o ON o.id = r.order_id LEFT JOIN collaborations c ON c.id = o.collaboration_id LEFT JOIN entities f ON f.id = c.firm_id
    LEFT JOIN report_members m ON m.report_id = r.id AND m.role = 'evaluator'`;

/** The per-report rule of the firm: framework contracts and collaborations invoiced "la raport" (their own mode, else the default). */
const PER_ORDER = `(
    (k.kind = 'framework' AND COALESCE(k.billing_mode, ?1) = 'per_order')
    OR (o.collaboration_id IS NOT NULL AND COALESCE(c.billing_mode, ?2) = 'per_order'))`;
const OPEN = `r.invoice_id IS NULL AND r.billed_outside_at IS NULL AND r.status <> 'cancelled' AND (r.delivered_at IS NOT NULL OR r.status = 'done') AND ${FINISHED_HERE}`;

/** "Facturat din Oblio": the invoice was issued straight in Oblio; the task closes, with the invoice's number when given. */
export async function markBilledOutside(db: D1Database, actor: string, reportId: string, ref: string) {
  const r = await db.prepare("SELECT id, invoice_id, billed_outside_at FROM reports WHERE id = ?").bind(reportId).first<{ id: string; invoice_id: string | null; billed_outside_at: string | null }>();
  if (!r) return { ok: false as const, error: "Raportul nu există." };
  if (r.invoice_id) return { ok: false as const, error: "Raportul are deja factură emisă din CRM." };
  if (r.billed_outside_at) return { ok: false as const, error: "Raportul e deja marcat ca facturat din Oblio." };
  const t = now();
  await db.prepare("UPDATE reports SET billed_outside_at = ?, billed_outside_by = ?, billed_outside_ref = ?, updated_at = ? WHERE id = ?").bind(t, actor, ref || null, t, reportId).run();
  await audit(db, `user:${actor}`, "invoice.outside", "report", reportId, ref || undefined);
  return { ok: true as const };
}

/** Corrects the fee of a report not invoiced yet (wrong in the grid, negotiated, left for later); its order follows. */
/** `gross`: the fee was given with VAT (the invoice is issued on it, VAT included); null when given without VAT. */
export async function setReportFee(db: D1Database, actor: string, reportId: string, fee: number, gross: number | null = null) {
  const r = await db.prepare("SELECT id, fee, order_id, invoice_id, billed_outside_at FROM reports WHERE id = ?").bind(reportId)
    .first<{ id: string; fee: number | null; order_id: string | null; invoice_id: string | null; billed_outside_at: string | null }>();
  if (!r) return { ok: false as const, error: "Raportul nu există." };
  if (r.invoice_id) return { ok: false as const, error: "Raportul are factură emisă: onorariul nu se mai schimbă." };
  if (r.billed_outside_at) return { ok: false as const, error: "Raportul e marcat ca facturat din Oblio." };
  const t = now();
  await db.batch([
    db.prepare("UPDATE reports SET fee = ?, fee_gross = ?, updated_at = ? WHERE id = ?").bind(fee, gross, t, reportId),
    ...(r.order_id ? [db.prepare("UPDATE orders SET fee = ?, fee_gross = ?, fee_net = CASE WHEN share IS NOT NULL THEN ROUND(? * share, 2) END, updated_at = ? WHERE id = ?").bind(fee, gross, fee, t, r.order_id)] : []),
  ]);
  const lei = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("ro-RO")} lei`);
  await audit(db, `user:${actor}`, "report.fee", "report", reportId, `${lei(r.fee)} → ${lei(fee)} fără TVA${gross != null ? ` (${lei(gross)} cu TVA)` : ""}`);
  return { ok: true as const };
}

/** The reports to invoice; `evaluatorId`: only those the person is the main evaluator of. */
export async function toBill(db: D1Database, evaluatorId?: string | null): Promise<BillTask[]> {
  const b = await getBilling(db);
  const { results } = await db.prepare(`${SELECT} WHERE ${OPEN} AND ${PER_ORDER} ${evaluatorId ? "AND m.user_id = ?3" : ""}
      GROUP BY r.id ORDER BY finished_at DESC LIMIT 500`).bind(b.frameworkDefault, b.collabDefault, ...(evaluatorId ? [evaluatorId] : [])).all<BillTask>();
  return results;
}

export async function toBillCount(db: D1Database, evaluatorId?: string | null) {
  const b = await getBilling(db);
  const r = await db.prepare(`SELECT COUNT(DISTINCT r.id) AS n FROM reports r LEFT JOIN contracts k ON k.id = r.contract_id LEFT JOIN orders o ON o.id = r.order_id
      LEFT JOIN collaborations c ON c.id = o.collaboration_id ${evaluatorId ? "JOIN report_members m ON m.report_id = r.id AND m.role = 'evaluator' AND m.user_id = ?3" : ""}
      WHERE ${OPEN} AND ${PER_ORDER}`).bind(b.frameworkDefault, b.collabDefault, ...(evaluatorId ? [evaluatorId] : [])).first<{ n: number }>().catch(() => null);
  return r?.n ?? 0;
}

/** Facturare "Doar ale lui": the person works only on their own reports' invoices (not an owner, no "billing.all"). */
export const ownBillingOnly = (u: WithPerms) => u.role !== "owner" && !can(u, "billing.all");

/** Whether the user may preview / issue the invoice of a report: everyone with the module on all; "doar ale lui": its main evaluator. */
export async function mayBillReport(db: D1Database, u: WithPerms & { id: string }, reportId: string) {
  if (!ownBillingOnly(u)) return true;
  return !!(await db.prepare("SELECT 1 AS ok FROM report_members WHERE report_id = ? AND user_id = ? AND role = 'evaluator'").bind(reportId, u.id).first());
}
