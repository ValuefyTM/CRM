import { err, json, staffApi } from "@/lib/api";
import { convertQuote } from "@/lib/quotes";
import { pushLater } from "@/lib/push";

/** Turns the offer into work: direct (classic contract + report) or an order under a collaboration, with its team. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await staffApi("orders.A", true);
  if ("res" in a) return a.res;
  const r = await convertQuote(a.db, { id: a.user.id, name: a.user.name }, id, await json(req));
  if (!r.ok) return err(r.error);
  pushLater(a.db);
  return Response.json({ ok: true, order: r.order, report: r.report, contract: r.contract });
}
