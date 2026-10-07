import type { Metadata } from "next";
import { staffPage, fmtDate } from "@/lib/guard";
import { displayName, hasDuty, KIND_LABEL, listUsers, roleLabel } from "@/lib/users";
import { CrmShell } from "@/components/CrmShell";

export const metadata: Metadata = { title: "CRM | VALUEFY" };
export const dynamic = "force-dynamic";

export default async function CrmHome() {
  const { db, user, base } = await staffPage();
  const users = await listUsers(db);
  const live = users.filter((u) => u.status !== "disabled");
  const count = (kind: string) => live.filter((u) => u.kind === kind).length;
  const evaluators = live.filter((u) => u.kind === "internal" && hasDuty(u, "evaluator")).length;
  const invited = live.filter((u) => u.status === "invited" && u.kind !== "internal").length;
  const orders = await db.prepare("SELECT COUNT(*) AS n, SUM(viewed_at IS NULL) AS unread FROM orders").first<{ n: number; unread: number | null }>().catch(() => null);
  const leads = await db.prepare("SELECT COUNT(*) AS n FROM leads WHERE status = 'NEW' AND source = 'WEBSITE_AI_SALE'").first<{ n: number }>().catch(() => null);
  const first = user.name ? user.name.split(" ")[0] : "";
  const u = (tab: string) => `${base}/utilizatori?tab=${tab}`;

  return (
    <CrmShell user={user} base={base} active="home" title="Acasă" subtitle={`${live.length} utilizatori · ${invited} invitații în așteptare`}>
      <section className="hero">
        <span className="eyebrow">Bun venit{first ? `, ${first}` : ""}</span>
        <h2>CRM-ul VALUEFY, prima etapă.</h2>
        <p>Primești comenzile din portal, cu toate datele și documentele, și gestionezi utilizatorii: echipa și evaluatorii, colaboratorii și clienții. Comenzile se procesează în dosare (oferta semnată sau contractul cadru), cu inspecție, verificare și livrare în portal. Facturarea vine în etapa următoare.</p>
        <div className="actions" style={{ position: "relative", zIndex: 1 }}>
          <a href={`${base}/comenzi`} className="btn btnGold btnPill">Comenzi primite →</a>
          <a href={`${base}/utilizatori/nou`} className="btn btnPill" style={{ background: "rgba(255,255,255,.1)", color: "#fff" }}>+ Utilizator nou</a>
        </div>
      </section>

      <div className="kpis">
        <a className="kpi" href={`${base}/comenzi?f=new`} style={{ ["--dot" as string]: "var(--acc)" }}><span><i />Comenzi noi · {orders?.n ?? 0} în total</span><b>{orders?.unread ?? 0}</b></a>
        <a className="kpi" href={u("interni")} style={{ ["--dot" as string]: "var(--info)" }}><span><i />Interni · {evaluators} evaluatori</span><b>{count("internal")}</b></a>
        <a className="kpi" href={u("colaboratori")} style={{ ["--dot" as string]: "var(--ok)" }}><span><i />Colaboratori</span><b>{count("partner")}</b></a>
        <a className="kpi" href={u("clienti")} style={{ ["--dot" as string]: "var(--acc)" }}><span><i />Clienți cu cont</span><b>{count("client")}</b></a>
        <a className="kpi" href={`${base}/comenzi?tab=site`} style={{ ["--dot" as string]: "var(--err)" }}><span><i />Vânzări noi de pe site</span><b>{leads?.n ?? "—"}</b></a>
      </div>

      <section className="card">
        <div className="cardHead">
          <h2>Adăugați recent</h2>
          <a href={`${base}/utilizatori`} className="btn btnGhost btnSm">Toți utilizatorii →</a>
        </div>
        {users.length <= 1 ? (
          <div className="empty">Nu ai adăugat încă niciun utilizator. <a className="rowLink" href={`${base}/utilizatori/nou`}>Adaugă primul utilizator →</a></div>
        ) : (
          <ul className="people">
            {users.slice(0, 6).map((x) => (
              <li key={x.id}>
                <span className="who">
                  <a className="rowLink" href={`${base}/utilizatori/${x.id}`}>{displayName(x)}</a>
                  <span className="muted">{KIND_LABEL[x.kind]} · {roleLabel(x.kind, x.role)}{x.partner_name ? ` · ${x.partner_name}` : ""}</span>
                </span>
                <span className="muted">Adăugat {fmtDate(x.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </CrmShell>
  );
}
