import { err, json, staffApi } from "@/lib/api";
import { draftForContract, draftForReport, issue } from "@/lib/billing";

/** Issues in Oblio what the preview showed: { contract, kind } for a classic contract, { report } per order. */
export async function POST(req: Request) {
  const a = await staffApi("admin");
  if ("res" in a) return a.res;
  const b = await json(req);
  const d = typeof b.report === "string" ? await draftForReport(a.db, b.report) : await draftForContract(a.db, typeof b.contract === "string" ? b.contract : "", b.kind === "proforma" ? "proforma" : "invoice");
  if ("error" in d) return err(d.error);
  // The totals must be the ones the user confirmed (nothing changed meanwhile).
  if (typeof b.total === "number" && Math.abs(b.total - d.totals.total) > 0.005) return err("Sumele s-au schimbat între timp. Redeschide previzualizarea.", 409);
  const r = await issue(a.db, a.user.id, d);
  return r.ok ? Response.json(r) : err(r.error, 502);
}
