import { err, json, staffApi } from "@/lib/api";
import { assignInspection, canAssign, cancelInspection, markNoInspection } from "@/lib/insp-assign";

/**
 * Gives the inspection of an asset to an inspector: `{ asset, inspector, sheet_type, due_on, contact_kind, contact_name, contact_phone, instructions,
 * confirm_missing }`. Without the CF extract or the floor survey it answers 409 `{ missing }` until `confirm_missing` is true.
 * `{ asset, none: "<reason>" }` marks the asset as valued without an inspection; `{ asset, none: null }` undoes it.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const { id } = await params;
  if (!(await canAssign(a.db, a.user, id))) return err("Doar evaluatorul principal al raportului poate aloca inspecția.", 403);
  const b = await json(req);
  if ("none" in b) {
    const reason = typeof b.none === "string" ? b.none.trim().slice(0, 200) || null : null;
    const m = await markNoInspection(a.db, a.user, id, typeof b.asset === "string" ? b.asset : "", reason);
    return m.ok ? Response.json({ ok: true }) : err(m.error);
  }
  const r = await assignInspection(a.db, a.user, id, b);
  if (!r.ok) return r.missing ? Response.json({ error: r.error, missing: r.missing }, { status: 409 }) : err(r.error);
  return Response.json({ ok: true, id: r.id, missing: r.missing });
}

/** Cancels an inspection task that is not done yet: `?inspection=<id>`. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const { id } = await params;
  if (!(await canAssign(a.db, a.user, id))) return err("Doar evaluatorul principal al raportului poate anula inspecția.", 403);
  const r = await cancelInspection(a.db, a.user, id, new URL(req.url).searchParams.get("inspection") ?? "");
  if (!r.ok) return err(r.error);
  return Response.json({ ok: true });
}
