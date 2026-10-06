import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { staffPage } from "@/lib/guard";
import { getOrder } from "@/lib/orders";
import { offerForOrder } from "@/lib/offers";
import { OfferView } from "@/components/OfferView";
import { PreviewBar } from "./PreviewBar";

export const metadata: Metadata = { title: "Previzualizare ofertă | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** The offer exactly as the client sees it, without counting as opened by the client. */
export default async function OfferPreview({ params }: { params: Promise<{ id: string }> }) {
  const { db, base } = await staffPage();
  const { id } = await params;
  const [order, offer] = await Promise.all([getOrder(db, id), offerForOrder(db, id)]);
  if (!order || !offer) notFound();
  return (
    <OfferView offer={offer} order={order} preview
      toolbar={<PreviewBar orderId={id} back={`${base}/comenzi/${id}`} email={offer.client_email} state={offer.status} />} />
  );
}
