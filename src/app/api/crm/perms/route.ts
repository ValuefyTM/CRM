import { audit } from "@/lib/auth";
import { err, json, staffApi } from "@/lib/api";
import { saveMatrix } from "@/lib/perms-db";

/** Saves the permissions matrix (Setări → Permisiuni): `{ matrix: { admin: [...], evaluator: [...], operator: [...] } }`. */
export async function PUT(req: Request) {
  const a = await staffApi("admin", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  if (!b.matrix || typeof b.matrix !== "object") return err("Matricea nu este validă.");
  const m = await saveMatrix(a.db, a.user.id, b.matrix);
  await audit(a.db, `user:${a.user.id}`, "settings.perms", "settings", "perms", JSON.stringify(m));
  return Response.json({ ok: true, matrix: m });
}
