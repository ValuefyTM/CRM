import { err, json, staffApi } from "@/lib/api";
import { inScope } from "@/lib/scope";
import { processPartnerOrder } from "@/lib/partner-process";

/** A collaborator's portal order without an offer: fee and term, where it is worked, report and asset → the report opens. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("orders:process", true);
  if ("res" in a) return a.res;
  const { id } = await params;
  if (!(await inScope(a.db, a.user, "orders", id))) return err("Nu există.", 404);
  const r = await processPartnerOrder(a.db, a.user, id, await json(req));
  return r.ok ? Response.json(r) : err(r.error);
}
