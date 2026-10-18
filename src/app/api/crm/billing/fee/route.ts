import { err, json, staffApi } from "@/lib/api";
import { mayBillReport, setReportFee } from "@/lib/billing-tasks";

/** Corrects the fee of a report still to invoice: `{ report, fee }` (net of VAT). */
export async function POST(req: Request) {
  const a = await staffApi("billing:issue", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const report = typeof b.report === "string" ? b.report : "";
  if (!report) return err("Lipsește raportul.");
  if (!(await mayBillReport(a.db, a.user, report))) return err("Poți modifica doar onorariul rapoartelor tale.", 403);
  const n = typeof b.fee === "number" ? b.fee : parseFloat(String(b.fee ?? "").replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n >= 1e7) return err("Scrie onorariul (lei, fără TVA).");
  const r = await setReportFee(a.db, a.user.id, report, Math.round(n * 100) / 100);
  return r.ok ? Response.json({ ok: true }) : err(r.error);
}
