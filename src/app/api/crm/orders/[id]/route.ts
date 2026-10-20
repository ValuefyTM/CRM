import { err, json, staffApi } from "@/lib/api";
import { inScope } from "@/lib/scope";
import { cancelOrder, deleteOrder } from "@/lib/orders";

/** Deletes an order, and with `confirm` what was made from it (owners and administrators). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("orders.D", true);
  if ("res" in a) return a.res;
  const { id } = await params;
  if (!(await inScope(a.db, a.user, "orders", id))) return err("Nu există.", 404);
  const r = await deleteOrder(a.db, `user:${a.user.id}`, id, (await json(req)).confirm === true);
  if (!r.ok) return Response.json({ error: r.error, links: "links" in r ? r.links : undefined }, { status: 409 });
  return Response.json({ ok: true, source: r.source });
}

/** Cancels the order with the reason (`{ status: "cancelled", reason }`) or reopens it (`{ status: "reopen" }`). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("orders.E", true);
  if ("res" in a) return a.res;
  const { id } = await params;
  if (!(await inScope(a.db, a.user, "orders", id))) return err("Nu există.", 404);
  const b = await json(req);
  if (b.status !== "cancelled" && b.status !== "reopen") return err("Acțiune necunoscută.");
  const r = await cancelOrder(a.db, `user:${a.user.id}`, id, b.status === "cancelled", String(b.reason ?? "").trim().slice(0, 500));
  return r.ok ? Response.json({ ok: true }) : err(r.error);
}
