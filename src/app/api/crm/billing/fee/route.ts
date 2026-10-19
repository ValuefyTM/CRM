import { err, json, staffApi } from "@/lib/api";
import { mayBillReport, setReportFee } from "@/lib/billing-tasks";
import { getBilling } from "@/lib/billing";
import { round4 } from "@/lib/fee-grid";

/**
 * Corrects the fee of a report still to invoice: `{ report, fee, vat? }`. With `vat: true` the amount includes VAT and
 * is turned into the net fee; the report and its order always keep the fee without VAT.
 */
export async function POST(req: Request) {
  const a = await staffApi("billing:issue", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const report = typeof b.report === "string" ? b.report : "";
  if (!report) return err("Lipsește raportul.");
  if (!(await mayBillReport(a.db, a.user, report))) return err("Poți modifica doar onorariul rapoartelor tale.", 403);
  const n = typeof b.fee === "number" ? b.fee : parseFloat(String(b.fee ?? "").replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n >= 1e7) return err("Scrie onorariul (lei).");
  // With VAT: the net keeps 4 decimals and the amount with VAT is kept too, so the invoice totals exactly that amount.
  const gross = b.vat === true ? Math.round(n * 100) / 100 : null;
  const net = gross != null ? round4(gross / (1 + (await getBilling(a.db)).vatPercent / 100)) : round4(n);
  const r = await setReportFee(a.db, a.user.id, report, net, gross);
  return r.ok ? Response.json({ ok: true }) : err(r.error);
}
