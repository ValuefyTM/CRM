import { audit } from "@/lib/auth";
import { err, json, staffApi } from "@/lib/api";
import { getConfig, saveConfig } from "@/lib/perms-db";

/** Saves the permissions (Setări → Permisiuni): `{ config: { roles, team } }`. Only the owner changes them. */
export async function PUT(req: Request) {
  const a = await staffApi("any", true);
  if ("res" in a) return a.res;
  if (a.user.role !== "owner") return err("Doar proprietarul modifică permisiunile.", 403);
  const b = await json(req);
  if (!b.config || typeof b.config !== "object") return err("Permisiunile trimise nu sunt valide.");
  const before = await getConfig(a.db);
  const cfg = await saveConfig(a.db, a.user.id, b.config);
  // A role still given to someone cannot disappear.
  const gone = before.roles.filter((r) => !cfg.roles.some((x) => x.id === r.id)).map((r) => r.id);
  if (gone.length) {
    const used = await a.db.prepare(`SELECT COUNT(*) AS n FROM users WHERE kind = 'internal' AND status <> 'deleted' AND role IN (${gone.map(() => "?").join(",")})`).bind(...gone).first<{ n: number }>();
    if (used?.n) {
      await saveConfig(a.db, a.user.id, { ...cfg, roles: [...cfg.roles, ...before.roles.filter((r) => gone.includes(r.id))] });
      return err("Un rol șters este încă dat unor utilizatori. Schimbă-le întâi rolul.", 409);
    }
  }
  await audit(a.db, `user:${a.user.id}`, "settings.perms", "settings", "perms", cfg.roles.map((r) => r.name).join(", "));
  return Response.json({ ok: true });
}
