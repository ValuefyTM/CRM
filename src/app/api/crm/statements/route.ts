import { err, json, staffApi } from "@/lib/api";
import { openStatement, validPeriod } from "@/lib/statements";

/** Opens (or finds) the statement of a party for a month: `{ party, period }` → `{ id }`. */
export async function POST(req: Request) {
  const a = await staffApi("statements.A", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  if (!validPeriod(b.period)) return err("Alege luna.");
  const r = await openStatement(a.db, a.user.id, String(b.party ?? ""), b.period);
  return r.ok ? Response.json(r) : err(r.error);
}
