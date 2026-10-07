import { getDb } from "@/lib/db";
import { audit, currentUser } from "@/lib/auth";
import { canSee, getOrder } from "@/lib/orders";
import { deliveredFile } from "@/lib/delivery";

/** Download of the delivered report for one of your orders. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb();
  const user = db ? await currentUser(db, "portal") : null;
  if (!db || !user) return new Response("Autentifică-te din nou.", { status: 401 });
  const { id } = await params;
  const o = await getOrder(db, id);
  if (!o || !canSee(user, o)) return new Response("Raportul nu a fost găsit.", { status: 404 });
  const res = await deliveredFile(db, id);
  if (res.ok) await audit(db, `user:${user.id}`, "order.report_download", "order", id);
  return res;
}
