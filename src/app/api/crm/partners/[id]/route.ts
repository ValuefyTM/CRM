import { NextResponse } from "next/server";
import { audit, endAllSessions } from "@/lib/auth";
import { getPartner, updatePartner, validatePartner } from "@/lib/partners";
import { err, json, staffApi } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const { id } = await params;
  if (!(await getPartner(a.db, id))) return err("Colaboratorul nu există.", 404);
  const p = validatePartner(await json(req));
  if (!p.ok) return err(p.error);
  await updatePartner(a.db, id, p.value);
  await audit(a.db, `user:${a.user.id}`, "partner.update", "partner", id);
  return NextResponse.json({ ok: true });
}

/** Suspend / reactivate a partner (suspended partners cannot sign in). */
export async function PATCH(req: Request, { params }: Ctx) {
  const a = await staffApi("admin");
  if ("res" in a) return a.res;
  const { id } = await params;
  const status = (await json(req)).status === "suspended" ? "suspended" : "active";
  await a.db.prepare("UPDATE partners SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(status, id).run();
  if (status === "suspended") {
    const { results } = await a.db.prepare("SELECT id FROM users WHERE kind = 'partner' AND partner_id = ?").bind(id).all<{ id: string }>();
    for (const u of results) await endAllSessions(a.db, u.id);
  }
  await audit(a.db, `user:${a.user.id}`, `partner.${status === "suspended" ? "suspend" : "activate"}`, "partner", id);
  return NextResponse.json({ ok: true });
}
