import { err, json, staffApi } from "@/lib/api";
import { createContractOrder } from "@/lib/contract-orders";
import { openDossier } from "@/lib/dossier";
import { fillReportAssets, parseAssets } from "@/lib/process-order";
import { assignInspection, mailAssigned } from "@/lib/insp-assign";

const id_ = (v: unknown) => (typeof v === "string" && /^[\w-]{1,80}$/.test(v) ? v : null);
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * New work under a framework contract (bank) or a collaboration: registers the order (statement line) with its assets
 * and creates its report at once — evaluator, verifier, deadline. The inspections are given afterwards, on the report.
 */
export async function POST(req: Request) {
  const a = await staffApi("orders.A", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const evaluator = id_(b.evaluator_id);
  if (!evaluator) return err("Alege evaluatorul principal.");
  const assets = parseAssets(b.assets);
  if (!assets.ok) return err(assets.error);
  const o = await createContractOrder(a.db, a.user.id, b, assets.assets);
  if (!o.ok) return err(o.error);
  // The delivery deadline: a date, or a date and time ("2026-10-20T14:30").
  const due = typeof b.due_on === "string" && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(b.due_on) ? b.due_on : null;
  const r = await openDossier(a.db, o.id, { id: a.user.id, name: a.user.name }, { evaluator_id: evaluator, verifier_id: id_(b.verifier_id), due_on: due });
  if (!r.ok) return err(r.error);
  if (r.created && r.assetId) {
    const f = await fillReportAssets(a.db, a.user.id, r.id, r.assetId, assets.assets, { name: str(b.client_name, 160), phone: str(b.client_phone, 40) });
    if (!f.ok) return err(f.error);
  }
  // The report's assets, in the order of the form (the documents dropped under each go to it).
  const { results } = await a.db.prepare("SELECT a.id, a.contact_kind, a.contact_name, a.contact_phone FROM assets a WHERE a.report_id = ? ORDER BY a.is_main DESC, a.rowid")
    .bind(r.id).all<{ id: string; contact_kind: string | null; contact_name: string | null; contact_phone: string | null }>();
  // One inspector for all the assets (optional): the inspections are given right away, with each asset's contact.
  const inspector = id_(b.inspector_id);
  let given = 0;
  if (r.created && inspector) {
    const ids: string[] = [];
    for (const x of results) {
      const g = await assignInspection(a.db, a.user, r.id, { asset: x.id, inspector, contact_kind: x.contact_kind, contact_name: x.contact_name, contact_phone: x.contact_phone,
        instructions: str(b.inspection_notes, 1000), confirm_missing: true, notify: false });
      if (g.ok) { given++; ids.push(g.id); }
    }
    // one email for all the assets
    await mailAssigned(a.db, a.user, ids);
  }
  return Response.json({ ok: true, order: o.id, report: r.id, inspections: given, assets: results.map((x) => x.id) });
}
