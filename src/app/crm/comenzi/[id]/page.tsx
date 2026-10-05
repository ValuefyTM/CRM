import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmtDate, staffPage } from "@/lib/guard";
import { now } from "@/lib/db";
import { audit } from "@/lib/auth";
import { history } from "@/lib/history";
import { getOrder, orderCode, orderDocuments, orderPlace, orderWhat, SOURCE_LABEL } from "@/lib/orders";
import { reportsForOrder } from "@/lib/reports";
import { getLead, leadStatus } from "@/lib/leads";
import { CrmShell } from "@/components/CrmShell";
import { History } from "@/components/History";
import { OrderDocuments, OrderInfo, OrderStatusCard } from "@/components/OrderDetails";
import { ReportList } from "@/components/ReportList";

export const metadata: Metadata = { title: "Comandă | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const lei = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("ro-RO")} lei`);

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
  const [docs, log, reports] = await Promise.all([orderDocuments(db, id), history(db, [id]), reportsForOrder(db, id)]);
  const portal = o.source === "partner" || o.source === "client";
  const lead = o.lead_id ? await getLead(db, o.lead_id) : null;

  return (
    <CrmShell
      user={user} base={base} active="orders" title={`Comanda ${orderCode(o)}`}
      subtitle={`${SOURCE_LABEL[o.source]} · ${orderWhat(o)}${o.address ? ` · ${orderPlace(o)}` : ""} · ${o.glide_id ? `din ${fmtDate(o.ordered_on ?? o.created_at)}` : `primită ${fmtDate(o.created_at, true)}`}`}
      actions={<a href={`${base}/comenzi${o.source === "bank" ? "?tab=banci" : ""}`} className="btn btnGhost btnSm">← Comenzi</a>}
    >
      {o.glide_id && <div className="note">Comandă importată din Glide.</div>}
      <div className="cols">
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          {o.source === "site" ? (
            <section className="card">
              <div className="cardHead">
                <h2>Cerere de pe valuefy.ro</h2>
                {lead && <span className={`pill ${leadStatus(lead.status)[1]}`}><i />Site: {leadStatus(lead.status)[0]}</span>}
              </div>
              <dl className="dl">
                <div><dt>Nr. cerere</dt><dd>{o.lead_id ? <a className="rowLink mono" href={`${base}/comenzi/site/${o.lead_id}`}>{o.lead_id}</a> : "—"}</dd></div>
                <div><dt>Trimisă</dt><dd>{fmtDate(o.created_at, true)}</dd></div>
                {lead?.customer_type && <div><dt>Client</dt><dd>{lead.customer_type}</dd></div>}
                {lead?.documents_status && <div><dt>Documente (declarat)</dt><dd>{lead.documents_status}</dd></div>}
              </dl>
              {lead?.summary && <><div className="section">Rezumatul conversației cu asistentul</div><p className="prose">{lead.summary}</p></>}
              {lead && lead.files.length > 0 && (
                <>
                  <div className="section">Fișiere trimise de client (pe email)</div>
                  <ul className="docList">{lead.files.map((f) => <li key={f}><span className="docDot file" aria-hidden>{(f.split(".").pop() || "").slice(0, 4).toUpperCase()}</span><span className="who"><b>{f}</b></span></li>)}</ul>
                </>
              )}
            </section>
          ) : portal ? (
            <section className="card">
              <h2>Trimisă de</h2>
              <dl className="dl">
                <div><dt>{o.source === "partner" ? "Colaborator" : "Client"}</dt><dd>{o.created_by ? <a className="rowLink" href={`${base}/utilizatori/${o.created_by}`}>{o.creator_name || o.creator_email}</a> : "—"}</dd></div>
                {o.partner_id && <div><dt>Firmă</dt><dd><a className="rowLink" href={`${base}/utilizatori/firme/${o.partner_id}`}>{o.partner_name}</a></dd></div>}
                {o.creator_email && <div><dt>Email</dt><dd><a href={`mailto:${o.creator_email}`}>{o.creator_email}</a></dd></div>}
                {o.bank_branch && <div><dt>Agenție</dt><dd>{o.bank_branch}</dd></div>}
              </dl>
              {!o.glide_id && <p className="hint">Oferta, alocarea evaluatorului și facturarea se adaugă în etapa următoare. Deocamdată comanda poate fi doar consultată.</p>}
            </section>
          ) : (
            <section className="card">
              <h2>{o.source === "bank" ? "Comandă bancă · contract cadru" : `Colaborare · ${o.collab_firm ?? ""}`}</h2>
              <dl className="dl">
                {o.bank_ref && <div><dt>Nr. comandă bancă</dt><dd className="mono">{o.bank_ref}</dd></div>}
                <div><dt>Bancă</dt><dd>{o.bank ?? "—"}</dd></div>
                {o.bank_branch && <div><dt>Agenție</dt><dd>{o.bank_branch}</dd></div>}
                {o.contract_number && <div><dt>Contract</dt><dd>{o.contract_kind === "framework" ? "Cadru" : "Clasic"} nr. {o.contract_number}</dd></div>}
                <div><dt>Client</dt><dd>{o.client_name ?? "—"}</dd></div>
                {o.report_type && <div><dt>Tip raport</dt><dd>{o.report_type}</dd></div>}
                <div><dt>Tarif</dt><dd>{lei(o.fee)}</dd></div>
                {o.share != null && <div><dt>Cota VALUEFY</dt><dd>{Math.round(o.share * 100)}% · {lei(o.fee_net)}</dd></div>}
                <div><dt>Data comenzii</dt><dd>{fmtDate(o.ordered_on ?? o.created_at)}</dd></div>
              </dl>
            </section>
          )}
          <ReportList reports={reports} base={base} title="Rapoarte pentru această comandă" empty="Niciun raport legat de comandă." />
          {(portal || o.source === "site" || o.address) && <OrderInfo o={o} />}
          {!o.glide_id && o.source !== "site" && <OrderDocuments o={o} docs={docs} canUpload={false} href={(d) => `/api/crm/orders/${o.id}/documents/${d.id}`} />}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <OrderStatusCard o={o} docs={docs} />
          <History log={log} />
        </div>
      </div>
    </CrmShell>
  );
}
