import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmtDate, staffPage } from "@/lib/guard";
import { now } from "@/lib/db";
import { audit } from "@/lib/auth";
import { history } from "@/lib/history";
import { getOrder, orderDocuments, orderRef, propertyLabel } from "@/lib/orders";
import { CrmShell } from "@/components/CrmShell";
import { History } from "@/components/History";
import { OrderDocuments, OrderInfo, OrderStatusCard } from "@/components/OrderDetails";

export const metadata: Metadata = { title: "Comandă | CRM VALUEFY" };
export const dynamic = "force-dynamic";

export default async function CrmOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, user, base } = await staffPage();
  const { id } = await params;
  const o = await getOrder(db, id);
  if (!o) notFound();
  // The first time someone in the team opens the order it stops being "new".
  if (!o.viewed_at) {
    await db.prepare("UPDATE orders SET viewed_at = ?, viewed_by = ? WHERE id = ? AND viewed_at IS NULL").bind(now(), user.id, id).run();
    await audit(db, `user:${user.id}`, "order.view", "order", id);
  }
  const [docs, log] = await Promise.all([orderDocuments(db, id), history(db, [id])]);

  return (
    <CrmShell
      user={user} base={base} active="orders" title={`Comanda ${orderRef(o.seq)}`}
      subtitle={`${propertyLabel(o.property_type)} · ${o.address}, ${o.city} · primită ${fmtDate(o.created_at, true)}`}
      actions={<a href={`${base}/comenzi`} className="btn btnGhost btnSm">← Comenzi</a>}
    >
      <div className="cols">
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <section className="card">
            <h2>Trimisă de</h2>
            <dl className="dl">
              <div><dt>{o.source === "partner" ? "Colaborator" : "Client"}</dt><dd><a className="rowLink" href={`${base}/utilizatori/${o.created_by}`}>{o.creator_name || o.creator_email}</a></dd></div>
              {o.partner_id && <div><dt>Firmă</dt><dd><a className="rowLink" href={`${base}/utilizatori/firme/${o.partner_id}`}>{o.partner_name}</a></dd></div>}
              <div><dt>Email</dt><dd><a href={`mailto:${o.creator_email}`}>{o.creator_email}</a></dd></div>
            </dl>
            <p className="hint">Oferta, alocarea evaluatorului și facturarea se adaugă în etapa următoare. Deocamdată comanda poate fi doar consultată.</p>
          </section>
          <OrderInfo o={o} />
          <OrderDocuments o={o} docs={docs} canUpload={false} href={(d) => `/api/crm/orders/${o.id}/documents/${d.id}`} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <OrderStatusCard o={o} docs={docs} />
          <History log={log} />
        </div>
      </div>
    </CrmShell>
  );
}
