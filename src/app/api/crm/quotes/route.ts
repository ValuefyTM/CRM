import { err, json, staffApi } from "@/lib/api";
import { createQuote } from "@/lib/quotes";

/** A new offer (Oferte): who has the Comenzi module with "add". */
export async function POST(req: Request) {
  const a = await staffApi("orders.A", true);
  if ("res" in a) return a.res;
  const r = await createQuote(a.db, a.user.id, await json(req));
  return r.ok ? Response.json({ ok: true, id: r.id }) : err(r.error);
}
