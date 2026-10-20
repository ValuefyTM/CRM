import { NextResponse } from "next/server";
import { audit, endAllSessions } from "@/lib/auth";
import { getPartner, updatePartner, validatePartner } from "@/lib/partners";
import { err, json, staffApi } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const a = await staffApi("partners.E", true);
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
  const a = await staffApi("partners.E", true);
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

/**
 * Deletes a partner firm. Its people (and its orders) move first to another firm: `{ move_to }`. Without people, the
 * firm goes and its old orders keep no firm. `?` counts: GET-free — the answer says what is left to move.
 */
export async function DELETE(req: Request, { params }: Ctx) {
  const a = await staffApi("partners.D", true);
  if ("res" in a) return a.res;
  const { id } = await params;
  const p = await getPartner(a.db, id);
  if (!p) return err("Firma nu există.", 404);
  const b = await json(req);
  const moveTo = typeof b.move_to === "string" && b.move_to && b.move_to !== id ? b.move_to : null;
  const target = moveTo ? await getPartner(a.db, moveTo) : null;
  if (moveTo && !target) return err("Firma în care muți persoanele nu există.");
  const people = (await a.db.prepare("SELECT COUNT(*) AS n FROM users WHERE kind = 'partner' AND partner_id = ? AND status <> 'deleted'").bind(id).first<{ n: number }>())?.n ?? 0;
  if (people && !target) return err(`Firma are ${people} ${people === 1 ? "persoană" : "persoane"}. Alege firma în care le muți, apoi șterge.`, 409);
  const to = target?.id ?? null;
  await a.db.batch([
    a.db.prepare("UPDATE users SET partner_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE partner_id = ?").bind(to, id),
    a.db.prepare("UPDATE orders SET partner_id = ? WHERE partner_id = ?").bind(to, id),
    a.db.prepare("UPDATE entities SET partner_id = ? WHERE partner_id = ?").bind(to, id),
    a.db.prepare("DELETE FROM partners WHERE id = ?").bind(id),
  ]);
  await audit(a.db, `user:${a.user.id}`, "partner.delete", "partner", id, `${p.name}${target ? ` · ${people} ${people === 1 ? "persoană mutată" : "persoane mutate"} la ${target.name}` : ""}`);
  return NextResponse.json({ ok: true, moved: people });
}
