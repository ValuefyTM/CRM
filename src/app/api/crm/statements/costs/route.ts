import { err, json, staffApi } from "@/lib/api";
import { deleteFixedCost, listFixedCosts, saveFixedCost } from "@/lib/statements";

/** The fixed monthly costs (Borderouri → Cheltuieli fixe). */
export async function GET() {
  const a = await staffApi("statements.all");
  if ("res" in a) return a.res;
  return Response.json({ costs: await listFixedCosts(a.db) });
}

export async function POST(req: Request) {
  const a = await staffApi("statements.E", true);
  if ("res" in a) return a.res;
  const r = await saveFixedCost(a.db, a.user.id, await json(req));
  return r.ok ? Response.json(r) : err(r.error);
}

export async function DELETE(req: Request) {
  const a = await staffApi("statements.D", true);
  if ("res" in a) return a.res;
  const r = await deleteFixedCost(a.db, a.user.id, new URL(req.url).searchParams.get("id") ?? "");
  return r.ok ? Response.json(r) : err(r.error);
}
