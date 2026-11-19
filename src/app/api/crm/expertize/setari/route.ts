import { err, json, staffApi } from "@/lib/api";
import { isExpert, saveExpertPrefs } from "@/lib/expert-cases";

/** The signed-in expert's own alert settings (the module's settings page). */
export async function PUT(req: Request) {
  const a = await staffApi("any", true);
  if ("res" in a) return a.res;
  if (!isExpert(a.user)) return err("Modulul este doar pentru experții judiciari.", 403);
  return Response.json(await saveExpertPrefs(a.db, a.user.id, await json(req)));
}
