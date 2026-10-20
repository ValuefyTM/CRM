import { err, json, staffApi } from "@/lib/api";
import { deleteRule, listRules, partyChoices, saveRule } from "@/lib/statements";

/** The statement rules (who gets a statement, on what, how often) and the parties one can be made for. */
export async function GET() {
  const a = await staffApi("statements.all");
  if ("res" in a) return a.res;
  const [rules, choices] = await Promise.all([listRules(a.db), partyChoices(a.db)]);
  return Response.json({ rules, ...choices });
}

export async function POST(req: Request) {
  const a = await staffApi("statements.A", true);
  if ("res" in a) return a.res;
  const r = await saveRule(a.db, a.user.id, await json(req));
  return r.ok ? Response.json(r) : err(r.error);
}

export async function DELETE(req: Request) {
  const a = await staffApi("statements.D", true);
  if ("res" in a) return a.res;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const r = await deleteRule(a.db, a.user.id, id);
  return r.ok ? Response.json(r) : err(r.error);
}
