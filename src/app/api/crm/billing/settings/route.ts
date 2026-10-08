import { err, json, staffApi } from "@/lib/api";
import { saveBilling } from "@/lib/billing";

export async function PUT(req: Request) {
  const a = await staffApi("admin");
  if ("res" in a) return a.res;
  const r = await saveBilling(a.db, a.user.id, await json(req));
  return r.ok ? Response.json({ ok: true }) : err(r.error);
}
