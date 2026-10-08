import { err, json, staffApi } from "@/lib/api";
import { setBillingRule } from "@/lib/billing";

/** The billing rule of a framework contract or a collaboration: none | per_order | monthly | null (= default). */
export async function PUT(req: Request) {
  const a = await staffApi("admin");
  if ("res" in a) return a.res;
  const b = await json(req);
  const kind = b.kind === "collab" ? "collab" : "contract";
  const r = await setBillingRule(a.db, a.user.id, kind, typeof b.id === "string" ? b.id : "", typeof b.mode === "string" ? b.mode : null);
  return r.ok ? Response.json({ ok: true }) : err(r.error);
}
