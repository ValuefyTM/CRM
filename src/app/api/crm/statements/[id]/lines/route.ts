import { err, json, staffApi } from "@/lib/api";
import { can } from "@/lib/perms";
import { acceptLine, addLine, adjustLine, deleteLine } from "@/lib/statements";

/** A manual line: `{ label, amount, reason }`. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("statements.E", true);
  if ("res" in a) return a.res;
  // only who sees every statement changes them ("Profitabilitatea lui" / "Doar al lui" are read-only)
  if (!can(a.user, "statements.all")) return err("Nu ai drepturi pentru această acțiune.", 403);
  const { id } = await params;
  const r = await addLine(a.db, a.user.id, id, await json(req));
  return r.ok ? Response.json(r) : err(r.error);
}

/** An adjustment with the reason: `{ key | line, removed: true }`, `{ key | line, amount }` or `{ key | line, restore: true }`. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("statements.E", true);
  if ("res" in a) return a.res;
  // only who sees every statement changes them ("Profitabilitatea lui" / "Doar al lui" are read-only)
  if (!can(a.user, "statements.all")) return err("Nu ai drepturi pentru această acțiune.", 403);
  const { id } = await params;
  const r = await adjustLine(a.db, a.user.id, id, await json(req));
  return r.ok ? Response.json(r) : err(r.error);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("statements.E", true);
  if ("res" in a) return a.res;
  // only who sees every statement changes them ("Profitabilitatea lui" / "Doar al lui" are read-only)
  if (!can(a.user, "statements.all")) return err("Nu ai drepturi pentru această acțiune.", 403);
  const { id } = await params;
  const r = await deleteLine(a.db, a.user.id, id, new URL(req.url).searchParams.get("line") ?? "");
  return r.ok ? Response.json(r) : err(r.error);
}

/** The collaborator accepts an adjustment of their statement: `{ line, accept }`. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("statements", true);
  if ("res" in a) return a.res;
  const { id } = await params;
  const b = await json(req);
  const r = await acceptLine(a.db, a.user.id, id, String(b.line ?? ""), b.accept !== false);
  return r.ok ? Response.json(r) : err(r.error);
}
