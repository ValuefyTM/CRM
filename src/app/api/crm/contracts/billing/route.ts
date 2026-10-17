import { err, json, staffApi } from "@/lib/api";
import { setBillingRule } from "@/lib/billing";

/** How a framework contract or a collaboration is invoiced: per_order (at each report) | monthly (statement) | none. */
export async function PUT(req: Request) {
  const a = await staffApi("contracts.E", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const kind = b.kind === "collab" ? "collab" : "contract";
  const r = await setBillingRule(a.db, a.user.id, kind, typeof b.id === "string" ? b.id : "", typeof b.mode === "string" ? b.mode : null);
  return r.ok ? Response.json({ ok: true }) : err(r.error);
}
