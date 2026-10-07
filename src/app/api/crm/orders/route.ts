import { err, json, staffApi } from "@/lib/api";
import { createContractOrder } from "@/lib/contract-orders";
import { openDossier } from "@/lib/dossier";
import { fillReportAssets, parseAssets } from "@/lib/process-order";

const id_ = (v: unknown) => (typeof v === "string" && /^[\w-]{1,80}$/.test(v) ? v : null);
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * New work under a framework contract (bank) or a collaboration: registers the order (statement line) with its assets
 * and creates its report at once — evaluator, verifier, deadline. The inspections are given afterwards, on the report.
 */
export async function POST(req: Request) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const b = await json(req);
  const evaluator = id_(b.evaluator_id);
  if (!evaluator) return err("Alege evaluatorul principal.");
  const assets = parseAssets(b.assets);
  if (!assets.ok) return err(assets.error);
  const o = await createContractOrder(a.db, a.user.id, b, assets.assets);
  if (!o.ok) return err(o.error);
  const due = typeof b.due_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.due_on) ? b.due_on : null;
  const r = await openDossier(a.db, o.id, { id: a.user.id, name: a.user.name }, { evaluator_id: evaluator, verifier_id: id_(b.verifier_id), due_on: due });
  if (!r.ok) return err(r.error);
  if (r.created && r.assetId) {
    const f = await fillReportAssets(a.db, a.user.id, r.id, r.assetId, assets.assets, { name: str(b.client_name, 160), phone: str(b.client_phone, 40) });
    if (!f.ok) return err(f.error);
  }
  return Response.json({ ok: true, order: o.id, report: r.id });
}
