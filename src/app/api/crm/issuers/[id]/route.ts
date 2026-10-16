import { audit } from "@/lib/auth";
import { now } from "@/lib/db";
import { err, json, staffApi } from "@/lib/api";

/** The colour of an issuing firm (its stripe in the reports list): `{ color: "#rrggbb" | null }`. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("settings.E", true);
  if ("res" in a) return a.res;
  const { id } = await params;
  const b = await json(req);
  const color = b.color == null || b.color === "" ? null : String(b.color).toLowerCase();
  if (color && !/^#[0-9a-f]{6}$/.test(color)) return err("Culoarea nu este validă.");
  const firm = await a.db.prepare("SELECT name FROM entities WHERE id = ? AND kind = 'valuation_firm'").bind(id).first<{ name: string }>();
  if (!firm) return err("Firma nu există.", 404);
  await a.db.prepare("UPDATE entities SET color = ?, updated_at = ? WHERE id = ?").bind(color, now(), id).run();
  await audit(a.db, `user:${a.user.id}`, "issuer.color", "entity", id, `${firm.name}: ${color ?? "implicit"}`);
  return Response.json({ ok: true });
}
