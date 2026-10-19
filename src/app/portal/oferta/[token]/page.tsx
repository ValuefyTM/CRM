import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb, now } from "@/lib/db";
import { audit } from "@/lib/auth";
import { getOrder } from "@/lib/orders";
import { isExpired, money, offerByToken, offerTotals } from "@/lib/offers";
import { propertyLabel } from "@/lib/order-labels";
import { origin } from "@/lib/site";
import { OfferView } from "@/components/OfferView";
import { quoteAsOffer, quoteByToken } from "@/lib/quote-public";
import { quoteAssets, quoteCode } from "@/lib/quotes";
import { parseGeo } from "@/lib/registry";
import type { MiniPoint } from "@/components/MiniMap";

const pointOf = (geo: string | null | undefined, source: string | null | undefined): MiniPoint | null => {
  const ll = parseGeo(geo ?? null);
  return ll ? { lat: ll[0], lng: ll[1], source: source === "cadastru" || source === "localitate" ? source : "adresa" } : null;
};

const fmtDay = (d: string) => new Date(d.length <= 10 ? `${d}T12:00:00` : d).toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Bucharest" });

/**
 * The link's preview (WhatsApp, email, Messenger): the offer's code and total in the title, what is valued and until
 * when in the description, a branded picture. Nothing secret goes in it (the token stays in the URL only).
 */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const base: Metadata = { robots: { index: false, follow: false }, referrer: "strict-origin-when-cross-origin" };
  const { token } = await params;
  const db = await getDb();
  if (!db) return { ...base, title: "Ofertă de evaluare | VALUEFY" };
  let offer = await offerByToken(db, token).catch(() => null);
  let order = offer ? await getOrder(db, offer.order_id) : null;
  let code = offer?.number ?? "";
  if (!offer) {
    const q = await quoteByToken(db, token).catch(() => null);
    if (!q || !q.sent_at) return { ...base, title: "Ofertă de evaluare | VALUEFY" };
    const v = await quoteAsOffer(db, q);
    offer = v.offer; order = v.order; code = quoteCode(q);
  }
  if (!offer || !order || offer.status === "draft") return { ...base, title: "Ofertă de evaluare | VALUEFY" };
  const total = offerTotals(offer).total;
  const what = [order.property_type ? propertyLabel(order.property_type) : offer.object_text?.split(/[,—]/)[0], order.city].filter(Boolean).join(", ");
  const state = offer.status === "accepted" ? "Acceptată" : offer.status === "declined" ? "Refuzată" : isExpired(offer) ? `A expirat pe ${fmtDay(offer.valid_until)}` : `Valabilă până la ${fmtDay(offer.valid_until)}`;
  const title = `Ofertă de evaluare ${code} · ${money(total)} cu TVA`;
  const description = [what && `${what}.`, `Termen ${offer.term_days} zile lucrătoare.`, `${state}.`, offer.status === "sent" && !isExpired(offer) ? "Citește oferta, acceptă și semnează online." : ""].filter(Boolean).join(" ");
  const o = await origin();
  return {
    ...base, title: `${title} | VALUEFY`, description,
    openGraph: { title, description, siteName: "VALUEFY · Evaluări imobiliare", type: "website", locale: "ro_RO", images: [{ url: `${o}/og-oferta.png`, width: 1200, height: 630, alt: "Ofertă de evaluare VALUEFY" }] },
    twitter: { card: "summary_large_image", title, description, images: [`${o}/og-oferta.png`] },
  };
}
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
