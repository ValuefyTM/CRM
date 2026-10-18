import { err, json, staffApi } from "@/lib/api";
import { markBilledOutside, mayBillReport } from "@/lib/billing-tasks";

/** "Facturat din Oblio": closes a report's billing task without an invoice from the CRM: `{ report, ref? }`. */
export async function POST(req: Request) {
  const a = await staffApi("billing:issue", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const report = typeof b.report === "string" ? b.report : "";
  if (!report) return err("Lipsește raportul.");
  if (!(await mayBillReport(a.db, a.user, report))) return err("Poți factura doar rapoartele tale.", 403);
  const r = await markBilledOutside(a.db, a.user.id, report, typeof b.ref === "string" ? b.ref.trim().slice(0, 60) : "");
  return r.ok ? Response.json({ ok: true }) : err(r.error);
}
