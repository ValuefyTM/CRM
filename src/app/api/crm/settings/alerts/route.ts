import { err, json, staffApi } from "@/lib/api";
import { saveAlertRules } from "@/lib/alerts";

/** Saves the alert rules (Setări → Alerte): owner and administrators. */
export async function PUT(req: Request) {
  const a = await staffApi("settings.E", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const r = await saveAlertRules(a.db, a.user.id, b.rules);
  return r.ok ? Response.json({ ok: true, rules: r.rules }) : err(r.error);
}
