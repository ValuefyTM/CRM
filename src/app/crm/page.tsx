import type { Metadata } from "next";
import { staffPage, fmtDate } from "@/lib/guard";
import { kindLabel, listPartners } from "@/lib/partners";
import { CrmShell } from "@/components/CrmShell";

export const metadata: Metadata = { title: "CRM | VALUEFY" };
export const dynamic = "force-dynamic";

export default async function CrmHome() {
  const { db, user, base } = await staffPage();
  const partners = await listPartners(db);
  const active = partners.filter((p) => p.status === "active").length;
  const users = partners.reduce((n, p) => n + p.active_users, 0);
  const invited = partners.reduce((n, p) => n + p.invited_users, 0);
  const leads = await db.prepare("SELECT COUNT(*) AS n FROM leads WHERE status = 'NEW'").first<{ n: number }>().catch(() => null);
  const first = user.name ? user.name.split(" ")[0] : "";

  return (
    <CrmShell user={user} base={base} active="home" title="Acasă" subtitle={`${active} colaboratori activi · ${invited} invitații în așteptare`}>
      <section className="hero">
        <span className="eyebrow">Bun venit{first ? `, ${first}` : ""}</span>
        <h2>CRM-ul VALUEFY, prima etapă.</h2>
        <p>Acum gestionezi colaboratorii și accesul lor în portal. Comenzile, ofertele, evaluatorii și facturarea vin în etapele următoare.</p>
        <div className="actions" style={{ position: "relative", zIndex: 1 }}>
          <a href={`${base}/colaboratori/nou`} className="btn btnGold btnPill">+ Adaugă colaborator</a>
          <a href={`${base}/colaboratori`} className="btn btnPill" style={{ background: "rgba(255,255,255,.1)", color: "#fff" }}>Vezi toți colaboratorii</a>
        </div>
      </section>

      <div className="kpis">
        <a className="kpi" href={`${base}/colaboratori`} style={{ ["--dot" as string]: "var(--ok)" }}><span><i />Colaboratori activi</span><b>{active}</b></a>
        <a className="kpi" href={`${base}/colaboratori`} style={{ ["--dot" as string]: "var(--info)" }}><span><i />Persoane cu acces</span><b>{users}</b></a>
        <a className="kpi" href={`${base}/colaboratori?f=invited`} style={{ ["--dot" as string]: "var(--acc)" }}><span><i />Invitații neacceptate</span><b>{invited}</b></a>
        <div className="kpi" style={{ ["--dot" as string]: "var(--err)" }}><span><i />Solicitări noi de pe site</span><b>{leads?.n ?? "—"}</b></div>
      </div>

      <section className="card">
        <div className="cardHead">
          <h2>Colaboratori adăugați recent</h2>
          <a href={`${base}/colaboratori`} className="btn btnGhost btnSm">Toți colaboratorii →</a>
        </div>
        {partners.length === 0 ? (
          <div className="empty">Nu ai adăugat încă niciun colaborator. <a className="rowLink" href={`${base}/colaboratori/nou`}>Adaugă primul colaborator →</a></div>
        ) : (
          <ul className="people">
            {partners.slice(0, 6).map((p) => (
              <li key={p.id}>
                <span className="who"><a className="rowLink" href={`${base}/colaboratori/${p.id}`}>{p.name}</a><span className="muted">{kindLabel(p.kind)}{p.city ? ` · ${p.city}` : ""}</span></span>
                <span className="muted">Adăugat {fmtDate(p.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </CrmShell>
  );
}
