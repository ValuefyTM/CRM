import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb, now } from "@/lib/db";
import { audit } from "@/lib/auth";
import { getOrder } from "@/lib/orders";
import { offerByToken } from "@/lib/offers";
import { OfferView } from "@/components/OfferView";
import { quoteAsOffer, quoteByToken } from "@/lib/quote-public";
import { quoteAssets, quoteCode } from "@/lib/quotes";
import { parseGeo } from "@/lib/registry";
import type { MiniPoint } from "@/components/MiniMap";

const pointOf = (geo: string | null | undefined, source: string | null | undefined): MiniPoint | null => {
  const ll = parseGeo(geo ?? null);
  return ll ? { lat: ll[0], lng: ll[1], source: source === "cadastru" || source === "localitate" ? source : "adresa" } : null;
};

export const metadata: Metadata = { title: "Ofertă de evaluare | VALUEFY", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/** Public offer page: whoever has the link (sent by email) can read, accept and sign the offer. */
export default async function OfferPage({ params }: { params: Promise<{ token: string }> }) {
  const db = await getDb();
  if (!db) throw new Error("Baza de date nu este disponibilă.");
  const { token } = await params;
  const offer = await offerByToken(db, token);
  if (!offer) {
    // An offer from Oferte (the CRM's quotes): the same page, from the quote's data.
    const q = await quoteByToken(db, token);
    if (!q || !q.sent_at) notFound();
    if (q.status === "sent" && !q.viewed_at) {
      await db.prepare("UPDATE quotes SET viewed_at = ? WHERE id = ? AND viewed_at IS NULL").bind(now(), q.id).run();
      await audit(db, "client:offer", "quote.viewed", "quote", q.id, quoteCode(q));
    }
    const v = await quoteAsOffer(db, q);
    const a = quoteAssets(q)[0];
    return <OfferView offer={v.offer} order={v.order} code={quoteCode(q)} point={pointOf(typeof a?.geo === "string" ? a.geo : null, typeof a?.geo_source === "string" ? a.geo_source : null)} />;
  }
  if (offer.status === "draft") notFound();
  const order = await getOrder(db, offer.order_id);
  if (!order) notFound();
  if (offer.status === "sent" && !offer.viewed_at) {
    await db.prepare("UPDATE offers SET viewed_at = ? WHERE id = ? AND viewed_at IS NULL").bind(now(), offer.id).run();
    await audit(db, "client:offer", "offer.viewed", "order", order.id, offer.number);
  }
  // Once the report is delivered, website clients (no portal account) download it from here.
  const rep = offer.status === "accepted"
    ? await db.prepare(`SELECT r.delivered_at FROM reports r WHERE r.order_id = ? AND r.delivered_at IS NOT NULL
        AND EXISTS (SELECT 1 FROM report_documents d WHERE d.report_id = r.id AND d.kind = 'final' AND d.status = 'uploaded') LIMIT 1`).bind(order.id).first<{ delivered_at: string }>()
    : null;
  // the main property of the order's report, when it has a point
  const prop = await db.prepare(`SELECT p.geo, p.geo_source FROM reports r JOIN assets a ON a.report_id = r.id AND a.is_main = 1 JOIN crm_properties p ON p.id = a.property_id
      WHERE r.order_id = ? AND r.status <> 'cancelled' ORDER BY r.created_at LIMIT 1`).bind(order.id).first<{ geo: string | null; geo_source: string | null }>().catch(() => null);
  return <OfferView offer={offer} order={order} delivered={rep?.delivered_at ?? null} point={pointOf(prop?.geo, prop?.geo_source)} />;
}
