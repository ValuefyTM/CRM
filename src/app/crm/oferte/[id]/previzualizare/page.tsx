import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { staffPage } from "@/lib/guard";
import { can } from "@/lib/perms";
import { getQuote, quoteAssets, quoteCode } from "@/lib/quotes";
import { quoteAsOffer } from "@/lib/quote-public";
import { OfferView } from "@/components/OfferView";
import { parseGeo } from "@/lib/registry";
import type { MiniPoint } from "@/components/MiniMap";

export const metadata: Metadata = { title: "Previzualizare ofertă | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** An offer from Oferte exactly as the client will see it, also while it is a draft; nothing is counted as opened by the client. */
export default async function QuotePreview({ params }: { params: Promise<{ id: string }> }) {
  const { db, user, base } = await staffPage("orders");
  const { id } = await params;
  const q = await getQuote(db, id);
  if (!q || (!can(user, "orders.all") && q.created_by !== user.id)) notFound();
  const v = await quoteAsOffer(db, q);
  const a = quoteAssets(q)[0];
  const ll = parseGeo(typeof a?.geo === "string" ? a.geo : null);
  const point: MiniPoint | null = ll ? { lat: ll[0], lng: ll[1], source: a?.geo_source === "cadastru" || a?.geo_source === "localitate" ? a.geo_source : "adresa" } : null;
  const back = `${base}/oferte/${id}`;
  return (
    <OfferView offer={v.offer} order={v.order} code={quoteCode(q)} preview point={point}
      toolbar={(
        <div className="ofPreviewBar no-print">
          <div><b>Previzualizare</b><span>{q.status === "draft" ? "Ciornă: așa va vedea clientul oferta. Încă nu a fost trimisă." : "Așa vede clientul oferta."}</span></div>
          <div className="ofRow">
            <a className="ofBtnGhost" href={back}>← Înapoi la ofertă</a>
            {q.status === "draft" && can(user, "orders.E") && <a className="ofBtnGhost" href={`${back}/editare`}>Modifică</a>}
          </div>
        </div>
      )} />
  );
}
