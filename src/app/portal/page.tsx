import type { Metadata } from "next";
import { partnerPage } from "@/lib/guard";
import { PortalShell } from "@/components/PortalShell";

export const metadata: Metadata = { title: "Acasă | Portal colaboratori VALUEFY" };
export const dynamic = "force-dynamic";

export default async function PortalHome() {
  const { user, base } = await partnerPage();
  return (
    <PortalShell user={user} base={base} active="home" title="Acasă" subtitle={user.partner_name}>
      <section className="hero">
        <span className="eyebrow">Bun venit, {user.partner_name}</span>
        <h2>Lansează o evaluare în 2 minute.</h2>
        <p>Comenzile online se deschid în curând: vei putea trimite datele proprietății și ale clientului, încărca documentele și urmări fiecare dosar pe etape. Până atunci, trimite-ne comenzile la contact@valuefy.ro sau la telefon.</p>
        <div className="actions" style={{ position: "relative", zIndex: 1 }}>
          <span className="btn btnGold btnPill" aria-disabled="true" style={{ opacity: 0.6, cursor: "default" }}>Comandă nouă · în curând</span>
        </div>
      </section>
      <div className="kpis">
        {[["În lucru", "var(--info)"], ["Necesită acțiune", "var(--acc)"], ["Urgente", "var(--err)"], ["Livrate", "var(--ok)"]].map(([l, c]) => (
          <div key={l} className="kpi" style={{ ["--dot" as string]: c }}><span><i />{l}</span><b>0</b></div>
        ))}
      </div>
      <section className="card">
        <h2>Comenzi recente</h2>
        <div className="empty">Aici vor apărea comenzile tale, cu statusul fiecăreia: comandă primită, ofertă, inspecție, raport livrat.</div>
      </section>
    </PortalShell>
  );
}
