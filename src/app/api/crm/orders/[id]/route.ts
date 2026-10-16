import { err, json, staffApi } from "@/lib/api";
import { deleteOrder } from "@/lib/orders";

/** Deletes an order, and with `confirm` what was made from it (owners and administrators). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("delete", true);
  if ("res" in a) return a.res;
  const r = await deleteOrder(a.db, `user:${a.user.id}`, (await params).id, (await json(req)).confirm === true);
  if (!r.ok) return Response.json({ error: r.error, links: "links" in r ? r.links : undefined }, { status: 409 });
  return Response.json({ ok: true, source: r.source });
}
