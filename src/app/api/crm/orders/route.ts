import { err, json, staffApi } from "@/lib/api";
import { createContractOrder } from "@/lib/contract-orders";
import { openDossier } from "@/lib/dossier";
import { assignInspection } from "@/lib/insp-assign";

const id_ = (v: unknown) => (typeof v === "string" && /^[\w-]{1,80}$/.test(v) ? v : null);

/**
 * New work under a framework contract (bank) or a collaboration: registers the order (statement line) and opens its
 * report file at once — evaluator, verifier, deadline and, optionally, the inspection.
 */
export async function POST(req: Request) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const b = await json(req);
  const evaluator = id_(b.evaluator_id);
  if (!evaluator) return err("Alege evaluatorul principal.");
  const o = await createContractOrder(a.db, a.user.id, b);
  if (!o.ok) return err(o.error);
  const due = typeof b.due_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.due_on) ? b.due_on : null;
  const r = await openDossier(a.db, o.id, { id: a.user.id, name: a.user.name }, { evaluator_id: evaluator, verifier_id: id_(b.verifier_id), due_on: due });
  if (!r.ok) return err(r.error);
  let inspectionError: string | null = null;
  const inspector = id_(b.inspector_id);
  if (inspector && r.created && r.assetId) {
    const i = await assignInspection(a.db, a.user, r.id, {
      asset: r.assetId, inspector, due_on: typeof b.inspection_due === "string" ? b.inspection_due : "",
      contact_kind: typeof b.contact_name === "string" && b.contact_name.trim() ? "other" : "client",
      contact_name: (typeof b.contact_name === "string" && b.contact_name.trim()) || b.client_name, contact_phone: (typeof b.contact_phone === "string" && b.contact_phone.trim()) || b.client_phone,
      instructions: b.inspection_notes,
    });
    if (!i.ok) inspectionError = i.error;
  }
  return Response.json({ ok: true, order: o.id, report: r.id, inspectionError });
}
