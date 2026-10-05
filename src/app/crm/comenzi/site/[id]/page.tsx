import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmtDate, staffPage } from "@/lib/guard";
import { history } from "@/lib/history";
import { getLead, LEAD_STATUSES, leadStatus } from "@/lib/leads";
import { CrmShell } from "@/components/CrmShell";
import { History } from "@/components/History";
import { LeadControls } from "./LeadControls";

export const metadata: Metadata = { title: "Cerere de pe site | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const num = (n: number | null, unit: string) => (n ? `${n.toLocaleString("ro-RO")} ${unit}` : null);

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, user, base } = await staffPage();
  const { id } = await params;
  const l = await getLead(db, id);
  if (!l) notFound();
  const log = await history(db, [id]);
  const [label, cls] = leadStatus(l.status);
  const sale = l.kind === "sale";
  const area = [num(l.surface_area, "mp utili"), l.rooms ? `${l.rooms} camere` : null, num(l.land_area, "mp teren")].filter(Boolean).join(" · ");

  return (
    <CrmShell
      user={user} base={base} active="orders" title={`Cerere ${l.id}`}
      subtitle={`${sale ? "Vânzare" : "Evaluare"} · trimisă de pe valuefy.ro ${fmtDate(l.created_at, true)}`}
      actions={<a href={`${base}/comenzi?tab=site`} className="btn btnGhost btnSm">← Cereri de pe site</a>}
    >
      <div className="cols">
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <section className="card">
            <div className="cardHead"><h2>{sale ? "Proprietate de vânzare" : "Cerere de evaluare"}</h2><span className={`pill ${cls}`}><i />{label}</span></div>
            <dl className="dl">
              <div><dt>Tip</dt><dd>{l.property_type ?? "—"}</dd></div>
              <div><dt>Adresă</dt><dd>{[l.address, l.city].filter(Boolean).join(", ") || "—"}</dd></div>
              {area && <div><dt>Suprafețe</dt><dd>{area}</dd></div>}
              {sale ? <div><dt>Preț cerut</dt><dd>{l.asking_price ? `${l.asking_price.toLocaleString("ro-RO")} €` : "—"}</dd></div> : (
                <>
                  <div><dt>Scop</dt><dd>{l.purpose ?? "—"}</dd></div>
                  <div><dt>Termen</dt><dd>{l.deadline ?? "—"}</dd></div>
                </>
              )}
              <div><dt>Documente</dt><dd>{l.documents_status ?? "—"}</dd></div>
              {l.priority !== "NORMAL" && <div><dt>Prioritate</dt><dd>{l.priority === "URGENT" ? "Urgentă" : "Prioritară"}</dd></div>}
            </dl>
            {l.description && <><div className="section">Descriere</div><p className="prose">{l.description}</p></>}
            {l.notes && <><div className="section">Observații client</div><p className="prose">{l.notes}</p></>}
          </section>
          {l.summary && (
            <section className="card">
              <h2>Rezumatul conversației cu asistentul</h2>
              <p className="prose">{l.summary}</p>
            </section>
          )}
          <section className="card">
            <h2>Fișiere trimise</h2>
            {l.files.length ? (
              <>
                <ul className="docList">{l.files.map((f) => <li key={f}><span className="docDot file" aria-hidden>{(f.split(".").pop() || "").slice(0, 4).toUpperCase()}</span><span className="who"><b>{f}</b></span></li>)}</ul>
                <p className="hint">Fișierele de pe site au fost trimise pe email{l.email_sent ? "" : " (emailul nu a putut fi trimis)"}; în CRM apar doar numele lor.</p>
              </>
            ) : <p className="hint">Niciun fișier.</p>}
          </section>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <section className="card">
            <h2>Client</h2>
            <dl className="dl">
              <div style={{ gridColumn: "1 / -1" }}><dt>{l.customer_type ?? "Client"}</dt><dd>{l.name}</dd></div>
              {l.phone && <div><dt>Telefon</dt><dd><a href={`tel:${l.phone.replace(/\s/g, "")}`}>{l.phone}</a></dd></div>}
              {l.email && <div><dt>Email</dt><dd><a href={`mailto:${l.email}`}>{l.email}</a></dd></div>}
            </dl>
          </section>
          <LeadControls id={l.id} status={l.status} notes={l.admin_notes ?? ""} statuses={LEAD_STATUSES.map(([k, v]) => [k, v])} />
          <History log={log} />
        </div>
      </div>
    </CrmShell>
  );
}
