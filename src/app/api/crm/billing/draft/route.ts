import { err, staffApi } from "@/lib/api";
import { draftForContract, draftForReport } from "@/lib/billing";
import { mayBillReport, ownBillingOnly } from "@/lib/billing-tasks";
import { can } from "@/lib/perms";

/** What would be invoiced (preview before issuing): ?contract=&kind=invoice|proforma or ?report=. */
export async function GET(req: Request) {
  const a = await staffApi("any");
  if ("res" in a) return a.res;
  // the Facturare module, or just "Emite factura" (the list on the dashboard)
  if (!can(a.user, "billing") && !can(a.user, "billing:issue")) return err("Nu ai drepturi pentru facturare.", 403);
  const sp = new URL(req.url).searchParams;
  const report = sp.get("report");
  // "Doar ale lui": only the invoices of the reports they are the main evaluator of.
  if (report ? !(await mayBillReport(a.db, a.user, report)) : ownBillingOnly(a.user)) return err("Poți factura doar rapoartele tale.", 403);
  const d = report ? await draftForReport(a.db, report) : await draftForContract(a.db, sp.get("contract") ?? "", sp.get("kind") === "proforma" ? "proforma" : "invoice");
  return "error" in d ? err(d.error) : Response.json(d);
}
