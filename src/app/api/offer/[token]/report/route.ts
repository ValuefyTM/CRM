import { getDb } from "@/lib/db";
import { audit } from "@/lib/auth";
import { offerByToken } from "@/lib/offers";
import { deliveredFile } from "@/lib/delivery";

/** Website clients (no portal account): the delivered report from the page of the offer they signed. */
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const db = await getDb();
  if (!db) return new Response("Serviciul nu este disponibil momentan.", { status: 503 });
  const offer = await offerByToken(db, (await params).token);
  if (!offer || offer.status !== "accepted") return new Response("Raportul nu a fost găsit.", { status: 404 });
  const res = await deliveredFile(db, offer.order_id);
  if (res.ok) await audit(db, "client:offer", "order.report_download", "order", offer.order_id);
  return res;
}
