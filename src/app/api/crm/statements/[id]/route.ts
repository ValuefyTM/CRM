import { err, json, staffApi } from "@/lib/api";
import { can } from "@/lib/perms";
import { deleteStatement, issueStatement, reopenStatement, setNotes, validateStatement } from "@/lib/statements";

/** `{ action: "validate" | "issue" | "reopen", reason? }` or `{ notes }` on a statement (Borderouri, "E"). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("statements.E", true);
  if ("res" in a) return a.res;
  // only who sees every statement changes them ("Profitabilitatea lui" / "Doar al lui" are read-only)
  if (!can(a.user, "statements.all")) return err("Nu ai drepturi pentru această acțiune.", 403);
  const { id } = await params;
  const b = await json(req);
  const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 500) : "";
  const r = b.action === "validate" ? await validateStatement(a.db, a.user.id, id)
    : b.action === "issue" ? await issueStatement(a.db, a.user.id, id)
    : b.action === "reopen" ? await reopenStatement(a.db, a.user.id, id, reason)
    : typeof b.notes === "string" ? await setNotes(a.db, a.user.id, id, b.notes)
    : { ok: false as const, error: "Acțiune necunoscută." };
  return r.ok ? Response.json(r) : err(r.error);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("statements.D", true);
  if ("res" in a) return a.res;
  // only who sees every statement changes them ("Profitabilitatea lui" / "Doar al lui" are read-only)
  if (!can(a.user, "statements.all")) return err("Nu ai drepturi pentru această acțiune.", 403);
  const { id } = await params;
  const r = await deleteStatement(a.db, a.user.id, id);
  return r.ok ? Response.json(r) : err(r.error);
}
