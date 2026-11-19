import { err, json, staffApi } from "@/lib/api";
import { createCase, isExpert } from "@/lib/expert-cases";

/** A new court case of the signed-in expert. */
export async function POST(req: Request) {
  const a = await staffApi("any", true);
  if ("res" in a) return a.res;
  if (!isExpert(a.user)) return err("Modulul este doar pentru experții judiciari.", 403);
  const r = await createCase(a.db, a.user.id, await json(req));
  return r.ok ? Response.json(r) : Response.json(r, { status: 400 });
}
