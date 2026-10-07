import { err, json, staffApi } from "@/lib/api";
import { saveFirm } from "@/lib/settings";

/** Saves VALUEFY's details used on contracts (owner and administrators). */
export async function PUT(req: Request) {
  const a = await staffApi("admin");
  if ("res" in a) return a.res;
  const r = await saveFirm(a.db, a.user.id, await json(req));
  if (!r.ok) return err(r.error);
  return Response.json({ ok: true });
}
