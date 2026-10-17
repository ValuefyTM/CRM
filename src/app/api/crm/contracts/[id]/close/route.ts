import { err, json, staffApi } from "@/lib/api";
import { inScope } from "@/lib/scope";
import { closeContract } from "@/lib/contracts";

/** Closes a framework contract: `{ closed_on: "YYYY-MM-DD", note? }`. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("contracts.E", true);
  if ("res" in a) return a.res;
  const { id } = await params;
  if (!(await inScope(a.db, a.user, "contracts", id))) return err("Nu există.", 404);
  const k = await a.db.prepare("SELECT kind, signed_on FROM contracts WHERE id = ?").bind(id).first<{ kind: string; signed_on: string | null }>();
  if (!k) return err("Contractul nu există.", 404);
  if (k.kind !== "framework") return err("Doar contractele cadru se închid.");
  const b = await json(req);
  const on = typeof b.closed_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.closed_on) ? b.closed_on : null;
  if (!on) return err("Alege data închiderii.");
  if (k.signed_on && on < k.signed_on.slice(0, 10)) return err("Data închiderii nu poate fi înainte de data semnării.");
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 500) || null : null;
  await closeContract(a.db, a.user.id, id, on, note);
  return Response.json({ ok: true });
}

/** Opens a closed framework contract again. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("contracts.E", true);
  if ("res" in a) return a.res;
  const { id } = await params;
  if (!(await inScope(a.db, a.user, "contracts", id))) return err("Nu există.", 404);
  await closeContract(a.db, a.user.id, id, null, null);
  return Response.json({ ok: true });
}
