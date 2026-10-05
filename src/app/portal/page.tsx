import type { Metadata } from "next";
import { portalPage } from "@/lib/guard";
import { ordersFor } from "@/lib/orders";
import { portalKpis, portalRows } from "@/lib/portal-orders";
import { PortalShell } from "@/components/PortalShell";
import { PortalOrders } from "@/components/PortalOrders";

export const metadata: Metadata = { title: "Acasă | Portal VALUEFY" };
export const dynamic = "force-dynamic";

export default async function PortalHome() {
  const { db, user, base } = await portalPage();
  const partner = user.kind === "partner";
  const first = user.name ? user.name.split(" ")[0] : "";
  const orders = await ordersFor(db, user);
  const k = portalKpis(orders);
  return (
    <PortalShell user={user} base={base} active="home" title="Acasă" subtitle={partner ? user.partner_name ?? "" : user.company || undefined}>
      <section className="hero">
        <span className="eyebrow">Bun venit, {partner ? user.partner_name : first || "în contul tău"}</span>
        <h2>{partner ? "Lansează o evaluare în 2 minute." : "Evaluările tale VALUEFY, într-un singur loc."}</h2>
        <p>
          {partner
            ? "Trimite datele proprietății și ale clientului, încarcă documentele și urmărește fiecare dosar pe etape."
            : "Solicită o evaluare, încarcă documentele și urmărește fiecare etapă: comandă, ofertă, inspecție, raport."}
        </p>
        <div className="actions" style={{ position: "relative", zIndex: 1 }}>
          <a href={`${base}/comenzi/noua`} className="btn btnGold btnPill">{partner ? "Comandă nouă →" : "Solicită o evaluare →"}</a>
        </div>
      </section>
      <div className="kpis">
        {([["În lucru", "var(--info)", k.progress], ["Necesită acțiune", "var(--acc)", k.action], ...(partner ? [["Urgente", "var(--err)", k.urgent]] : []), [partner ? "Livrate" : "Rapoarte livrate", "var(--ok)", k.done]] as [string, string, number][]).map(([l, c, n]) => (
          <a key={l} href={`${base}/comenzi`} className="kpi" style={{ ["--dot" as string]: c }}><span><i />{l}</span><b>{n}</b></a>
        ))}
      </div>
      <PortalOrders rows={portalRows(orders)} base={base} partner={partner} compact />
    </PortalShell>
  );
}
