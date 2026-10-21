import { err, json, staffApi } from "@/lib/api";
import { can } from "@/lib/perms";
import { adjustFixedCost, deleteFixedCost, listFixedCosts, memberChoices, saveFixedCost } from "@/lib/statements";

/** The fixed monthly costs (Borderouri → Cheltuieli fixe). */
export async function GET() {
  const a = await staffApi("statements.all");
  if ("res" in a) return a.res;
  const [costs, admins] = await Promise.all([listFixedCosts(a.db), memberChoices(a.db)]);
  return Response.json({ costs, admins });
}

export async function POST(req: Request) {
  const a = await staffApi("statements.E", true);
  if ("res" in a) return a.res;
  // only who sees every statement changes them ("Profitabilitatea lui" / "Doar al lui" are read-only)
  if (!can(a.user, "statements.all")) return err("Nu ai drepturi pentru această acțiune.", 403);
  const r = await saveFixedCost(a.db, a.user.id, await json(req));
  return r.ok ? Response.json(r) : err(r.error);
}

export async function DELETE(req: Request) {
  const a = await staffApi("statements.D", true);
  if ("res" in a) return a.res;
  // only who sees every statement changes them ("Profitabilitatea lui" / "Doar al lui" are read-only)
  if (!can(a.user, "statements.all")) return err("Nu ai drepturi pentru această acțiune.", 403);
  const r = await deleteFixedCost(a.db, a.user.id, new URL(req.url).searchParams.get("id") ?? "");
  return r.ok ? Response.json(r) : err(r.error);
}

/** The month's adjustment of a fixed cost: `{ id, period, amount: "+250" | "-120", note }`. */
export async function PATCH(req: Request) {
  const a = await staffApi("statements.E", true);
  if ("res" in a) return a.res;
  if (!can(a.user, "statements.all")) return err("Nu ai drepturi pentru această acțiune.", 403);
  const r = await adjustFixedCost(a.db, a.user.id, await json(req));
  return r.ok ? Response.json(r) : err(r.error);
}
