import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb, now } from "@/lib/db";
import { audit } from "@/lib/auth";
import { getOrder } from "@/lib/orders";
import { offerByToken } from "@/lib/offers";
import { OfferView } from "@/components/OfferView";

export const metadata: Metadata = { title: "Ofertă de evaluare | VALUEFY", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/** Public offer page: whoever has the link (sent by email) can read, accept and sign the offer. */
export default async function OfferPage({ params }: { params: Promise<{ token: string }> }) {
  const db = await getDb();
  if (!db) throw new Error("Baza de date nu este disponibilă.");
  const offer = await offerByToken(db, (await params).token);
  if (!offer || offer.status === "draft") notFound();
  const order = await getOrder(db, offer.order_id);
  if (!order) notFound();
  if (offer.status === "sent" && !offer.viewed_at) {
    await db.prepare("UPDATE offers SET viewed_at = ? WHERE id = ? AND viewed_at IS NULL").bind(now(), offer.id).run();
    await audit(db, "client:offer", "offer.viewed", "order", order.id, offer.number);
  }
  return <OfferView offer={offer} order={order} />;
}
