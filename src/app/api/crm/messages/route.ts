import { err, json, staffApi } from "@/lib/api";
import { addMessage } from "@/lib/messages";

/** A message on a report or an order: `{ entity: "report" | "order", id, body }`. */
export async function POST(req: Request) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const b = await json(req);
  const entity = b.entity === "report" || b.entity === "order" ? b.entity : null;
  const body = typeof b.body === "string" ? b.body.trim().slice(0, 4000) : "";
  if (!entity || typeof b.id !== "string") return err("Cerere invalidă.");
  if (!body) return err("Scrie mesajul.");
  const r = await addMessage(a.db, entity, b.id, a.user, body);
  if (!r.ok) return err(r.error, 404);
  return Response.json({ ok: true });
}
