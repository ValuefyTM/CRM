import { err, json, staffApi } from "@/lib/api";
import { draftForContract, draftForReport, issue } from "@/lib/billing";
import { mayBillReport, ownBillingOnly } from "@/lib/billing-tasks";

/** Issues in Oblio what the preview showed: { contract, kind } for a classic contract, { report } per order. */
export async function POST(req: Request) {
  const a = await staffApi("billing:issue", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const report = typeof b.report === "string" ? b.report : null;
  // "Doar ale lui": only the invoices of the reports they are the main evaluator of.
  if (report ? !(await mayBillReport(a.db, a.user, report)) : ownBillingOnly(a.user)) return err("Poți factura doar rapoartele tale.", 403);
  // Whatever breaks on the way, the person sees the real reason (not a bare 500).
  try {
    const d = report ? await draftForReport(a.db, report) : await draftForContract(a.db, typeof b.contract === "string" ? b.contract : "", b.kind === "proforma" ? "proforma" : "invoice");
    if ("error" in d) return err(d.error);
    // The totals must be the ones the user confirmed (nothing changed meanwhile).
    if (typeof b.total === "number" && Math.abs(b.total - d.totals.total) > 0.005) return err("Sumele s-au schimbat între timp. Redeschide previzualizarea.", 409);
    const r = await issue(a.db, a.user.id, d);
    return r.ok ? Response.json(r) : err(r.error, 502);
  } catch (e) {
    console.error("billing issue", e);
    return err(`Nu am putut emite documentul: ${e instanceof Error ? e.message : String(e)}`, 500);
  }
}
