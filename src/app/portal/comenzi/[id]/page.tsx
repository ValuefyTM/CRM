import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmtDate, portalPage } from "@/lib/guard";
import { canSee, getOrder, orderCode, orderDocuments, orderPlace, orderWhat } from "@/lib/orders";
import { PortalShell } from "@/components/PortalShell";
import { OrderDocuments, OrderInfo, OrderStatusCard } from "@/components/OrderDetails";

export const metadata: Metadata = { title: "Comandă | Portal VALUEFY" };
export const dynamic = "force-dynamic";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nou?: string }> }) {
  const { db, user, base } = await portalPage();
  const { id } = await params;
  const o = await getOrder(db, id);
  if (!o || !canSee(user, o)) notFound();
  const docs = await orderDocuments(db, id);
  const nou = (await searchParams).nou;
  const failed = nou?.startsWith("eroare-") ? Number(nou.slice(7)) : 0;

  return (
    <PortalShell user={user} base={base} active="orders" title={`Comanda ${orderCode(o)}`} subtitle={`${orderWhat(o)} · ${orderPlace(o)} · trimisă ${fmtDate(o.created_at, !o.glide_id)}`}>
      <div className="actions"><a href={`${base}/comenzi`} className="btn btnGhost btnSm">← Comenzi</a></div>
      {nou && (
        <div className={failed ? "note" : "okMsg"}>
          {failed
            ? `Comanda ${orderCode(o)} a fost trimisă, dar ${failed} document${failed > 1 ? "e nu au" : " nu a"} putut fi încărcat${failed > 1 ? "e" : ""}. Încearcă din nou mai jos.`
            : `Comanda ${orderCode(o)} a fost trimisă. Pregătim oferta și revenim în cel mai scurt timp.`}
        </div>
      )}
      <div className="cols">
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          {o.status === "received" && <section className="card" style={{ border: "1.5px solid var(--line)" }}>
            <div className="cardHead"><h2>Oferta de evaluare</h2><span className="pill"><i />În pregătire</span></div>
            <div className="actions" style={{ flexWrap: "nowrap" }}>
              <span className="spinner" aria-hidden />
              <p className="hint" style={{ fontSize: 14 }}>Analizăm comanda și pregătim oferta: onorariul și termenul de livrare. Te anunțăm pe email când este gata.</p>
            </div>
          </section>}
          {!o.glide_id && <OrderDocuments o={o} docs={docs} canUpload href={(d) => `/api/portal/orders/${o.id}/documents/${d.id}`} />}
          <OrderInfo o={o} />
        </div>
        <OrderStatusCard o={o} docs={docs} />
      </div>
    </PortalShell>
  );
}
