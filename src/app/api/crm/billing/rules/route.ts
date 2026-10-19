import { err, json, staffApi } from "@/lib/api";
import { setBillingRule, setCollectAlert } from "@/lib/billing";

/** The billing rule of a framework contract or a collaboration: none | per_order | monthly | null (= default). */
export async function PUT(req: Request) {
  const a = await staffApi("billing.E", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const kind = b.kind === "collab" ? "collab" : "contract";
  // the alert "inspection done, not collected": { alert: { days: number | null, to } }
  if (b.alert && typeof b.alert === "object") {
    const x = b.alert as { days?: unknown; to?: unknown };
    const r = await setCollectAlert(a.db, a.user.id, kind, typeof b.id === "string" ? b.id : "", typeof x.days === "number" ? x.days : null, typeof x.to === "string" ? x.to : null);
    return r.ok ? Response.json({ ok: true }) : err(r.error);
  }
  const r = await setBillingRule(a.db, a.user.id, kind, typeof b.id === "string" ? b.id : "", typeof b.mode === "string" ? b.mode : null);
  return r.ok ? Response.json({ ok: true }) : err(r.error);
}
