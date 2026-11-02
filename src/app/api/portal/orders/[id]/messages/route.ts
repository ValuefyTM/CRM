import { err, json, portalApi } from "@/lib/api";
import { canSee, getOrder } from "@/lib/orders";
import { orderMessage, sharedChat } from "@/lib/order-chat";

/** The collaborator writes to the team, from their order in the portal: `{ body }`. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await portalApi();
  if ("res" in a) return a.res;
  const { id } = await params;
  const o = await getOrder(a.db, id);
  if (!o || !canSee(a.user, o)) return err("Comanda nu există.", 404);
  if (!sharedChat(o)) return err("Mesajele nu sunt disponibile pentru această comandă.");
  const b = await json(req);
  const body = typeof b.body === "string" ? b.body.trim().slice(0, 4000) : "";
  if (!body) return err("Scrie mesajul.");
  const r = await orderMessage(a.db, id, a.user, body);
  return r.ok ? Response.json({ ok: true }) : err(r.error);
}
