import { err, staffApi } from "@/lib/api";
import { draftForContract, draftForReport } from "@/lib/billing";

/** What would be invoiced (preview before issuing): ?contract=&kind=invoice|proforma or ?report=. */
export async function GET(req: Request) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const sp = new URL(req.url).searchParams;
  const d = sp.get("report") ? await draftForReport(a.db, sp.get("report")!) : await draftForContract(a.db, sp.get("contract") ?? "", sp.get("kind") === "proforma" ? "proforma" : "invoice");
  return "error" in d ? err(d.error) : Response.json(d);
}
