// Server-only: "De facturat" — the finished reports (done / delivered) on a framework contract or a collaboration
// invoiced per report, not invoiced yet. They are the billing tasks of the Facturare module: each one is previewed
// and issued in Oblio from there. Nothing is stored: a report leaves the list when its invoice is issued.
import { getBilling } from "./billing";
import { can, type WithPerms } from "./perms";

export type BillTask = {
  id: string; number: string | null; label: string | null; fee: number | null; finished_at: string | null; report_type: string | null;
  contract_id: string | null; contract_number: string | null; collab: number; party: string | null; bank_ref: string | null; evaluator: string | null; evaluator_id: string | null;
};

const SELECT = `SELECT r.id, r.number, r.label, r.fee, COALESCE(r.delivered_at, r.updated_at) AS finished_at, r.report_type, r.contract_id, k.number AS contract_number,
    (o.collaboration_id IS NOT NULL) AS collab, COALESCE(e.name, f.name) AS party, o.bank_ref,
    m.user_id AS evaluator_id, (SELECT COALESCE(NULLIF(u.name, ''), u.email) FROM users u WHERE u.id = m.user_id) AS evaluator
  FROM reports r LEFT JOIN contracts k ON k.id = r.contract_id LEFT JOIN entities e ON e.id = k.client_id
    LEFT JOIN orders o ON o.id = r.order_id LEFT JOIN collaborations c ON c.id = o.collaboration_id LEFT JOIN entities f ON f.id = c.firm_id
    LEFT JOIN report_members m ON m.report_id = r.id AND m.role = 'evaluator'`;

/** The per-report rule of the firm: framework contracts and collaborations invoiced "la raport" (their own mode, else the default). */
const PER_ORDER = `(
    (k.kind = 'framework' AND COALESCE(k.billing_mode, ?1) = 'per_order')
    OR (o.collaboration_id IS NOT NULL AND COALESCE(c.billing_mode, ?2) = 'per_order'))`;
const OPEN = `r.invoice_id IS NULL AND r.glide_id IS NULL AND r.status <> 'cancelled' AND (r.delivered_at IS NOT NULL OR r.status = 'done')`;

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
