import { err, staffApi } from "@/lib/api";
import { deleteOrder } from "@/lib/orders";

/** Deletes an order that has not become work yet (owners and administrators). */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("admin");
  if ("res" in a) return a.res;
  const r = await deleteOrder(a.db, `user:${a.user.id}`, (await params).id);
  if (!r.ok) return err(r.error, 409);
  return Response.json({ ok: true, source: r.source });
}
