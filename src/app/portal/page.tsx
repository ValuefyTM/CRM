import type { Metadata } from "next";
import { portalPage } from "@/lib/guard";
import { PortalShell } from "@/components/PortalShell";

export const metadata: Metadata = { title: "Acasă | Portal VALUEFY" };
export const dynamic = "force-dynamic";

export default async function PortalHome() {
  const { user, base } = await portalPage();
  const partner = user.kind === "partner";
  const first = user.name ? user.name.split(" ")[0] : "";
  return (
    <PortalShell user={user} base={base} active="home" title="Acasă" subtitle={partner ? user.partner_name ?? "" : user.company || undefined}>
      {partner ? (
        <section className="hero">
          <span className="eyebrow">Bun venit, {user.partner_name}</span>
          <h2>Lansează o evaluare în 2 minute.</h2>
          <p>Comenzile online se deschid în curând: vei putea trimite datele proprietății și ale clientului, încărca documentele și urmări fiecare dosar pe etape. Până atunci, trimite-ne comenzile la contact@valuefy.ro sau la telefon.</p>
          <div className="actions" style={{ position: "relative", zIndex: 1 }}>
            <span className="btn btnGold btnPill" aria-disabled="true" style={{ opacity: 0.6, cursor: "default" }}>Comandă nouă · în curând</span>
          </div>
        </section>
      ) : (
        <section className="hero">
          <span className="eyebrow">Bun venit{first ? `, ${first}` : ""}</span>
          <h2>Evaluările tale VALUEFY, într-un singur loc.</h2>
          <p>În curând vei vedea aici fiecare evaluare comandată, pe etape: comandă, ofertă, inspecție, raport. Vei putea încărca documentele și descărca raportul. Până atunci, pentru o evaluare nouă folosește asistentul de pe site.</p>
          <div className="actions" style={{ position: "relative", zIndex: 1 }}>
            <a href="https://valuefy.ro/" className="btn btnGold btnPill">Solicită o evaluare →</a>
          </div>
        </section>
      )}
      <div className="kpis">
        {(partner
          ? [["În lucru", "var(--info)"], ["Necesită acțiune", "var(--acc)"], ["Urgente", "var(--err)"], ["Livrate", "var(--ok)"]]
          : [["În lucru", "var(--info)"], ["Necesită acțiune", "var(--acc)"], ["Rapoarte livrate", "var(--ok)"]]
        ).map(([l, c]) => (
          <div key={l} className="kpi" style={{ ["--dot" as string]: c }}><span><i />{l}</span><b>0</b></div>
        ))}
      </div>
      <section className="card">
        <h2>{partner ? "Comenzi recente" : "Evaluările mele"}</h2>
        <div className="empty">
          {partner
            ? "Aici vor apărea comenzile tale, cu statusul fiecăreia: comandă primită, ofertă, inspecție, raport livrat."
            : "Aici vor apărea evaluările tale, cu statusul fiecăreia: comandă primită, ofertă, inspecție, raport livrat."}
        </div>
      </section>
    </PortalShell>
  );
}
