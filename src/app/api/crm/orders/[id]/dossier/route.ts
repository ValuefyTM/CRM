import { err, json, staffApi } from "@/lib/api";
import { openDossier } from "@/lib/dossier";
import { assignInspection } from "@/lib/insp-assign";
import { getOrder } from "@/lib/orders";

const id_ = (v: unknown) => (typeof v === "string" && /^[\w-]{1,80}$/.test(v) ? v : null);

/**
 * Opens the report file ("dosar") of an order from its CRM page: main evaluator, verifier, deadline and, optionally,
 * the inspection given right away (the inspector gets it in the inspections app).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const { id } = await params;
  const order = await getOrder(a.db, id);
  if (!order) return err("Comanda nu există.", 404);
  const b = await json(req);
  const due = typeof b.due_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.due_on) ? b.due_on : null;
  const evaluator = id_(b.evaluator_id);
  if (!evaluator) return err("Alege evaluatorul principal.");
  const r = await openDossier(a.db, id, { id: a.user.id, name: a.user.name }, {
    evaluator_id: evaluator, verifier_id: id_(b.verifier_id), due_on: due,
    notes: typeof b.notes === "string" ? b.notes.trim().slice(0, 4000) || null : null,
  });
  if (!r.ok) return err(r.error);
  let inspection: string | null = null;
  const inspector = id_(b.inspector_id);
  if (r.created && inspector && r.assetId) {
    const i = await assignInspection(a.db, a.user, r.id, {
      asset: r.assetId, inspector, due_on: typeof b.inspection_due === "string" ? b.inspection_due : "",
      contact_kind: order.contact_name ? "other" : "client", contact_name: order.contact_name ?? order.client_name ?? "", contact_phone: order.contact_phone ?? order.client_phone ?? "",
      instructions: order.inspection_notes ?? "",
    });
    if (!i.ok) inspection = i.error;
  }
  return Response.json({ ok: true, id: r.id, created: r.created, inspectionError: inspection });
}
