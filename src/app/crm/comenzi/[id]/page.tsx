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
import { hasDuty } from "@/lib/labels";
import { isExpired, money, offerDocs, offerDraft, offerForOrder, offerTotals, type OfferInput } from "@/lib/offers";
import { offerLink } from "@/lib/offer-emails";
import { OfferEditor } from "./OfferEditor";
import { DossierOpen } from "./DossierOpen";
import { DeleteOrder } from "./DeleteOrder";
import { isAdmin } from "@/lib/users";
import { photoUrl, presenceOf } from "@/lib/presence";
import { orderProgress } from "@/lib/delivery";
import { IssueInvoice, InvoiceList } from "@/components/Invoices";
import { draftForReport, invoicesFor } from "@/lib/billing";

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
  const progress = o.glide_id ? null : await orderProgress(db, o);
  const lead = o.lead_id ? await getLead(db, o.lead_id) : null;

  // Offers: for orders from the portal and the website (bank orders follow the framework contract).
  const offerable = !o.glide_id && (portal || o.source === "site" || o.source === "direct");
  const offer = offerable ? await offerForOrder(db, id) : null;
  const evaluators = !o.glide_id
    ? (await db.prepare("SELECT id, COALESCE(NULLIF(name, ''), email) AS name, anevar_no, role, duties, last_seen_at, avatar_at FROM users WHERE kind = 'internal' AND status NOT IN ('disabled', 'deleted') AND (role IN ('evaluator', 'owner', 'admin') OR ',' || COALESCE(duties, '') || ',' LIKE '%,evaluator,%') ORDER BY name")
      .all<{ id: string; name: string; anevar_no: string | null; role: string; duties: string | null; last_seen_at: string | null; avatar_at: string | null }>()).results
      .map((e) => ({ ...e, ...presenceOf(e.last_seen_at), photo: photoUrl(e.id, e.avatar_at), role: hasDuty(e, "evaluator") ? "evaluator" : e.role }))
    : [];
  // Processing: the order becomes a report file. Portal / website orders open it when the offer is signed (or by hand,
  // e.g. accepted by phone); bank and collaboration orders are processed straight away under their contract.
  const dossier = reports[0] ?? null;
  // Per-order billing (e.g. BRD): the button appears once the order's report is finished; its invoices are listed here.
  const billable = isAdmin(user) && (o.source === "bank" || o.source === "collab") && dossier
    ? await Promise.all(reports.map(async (rep) => ({ id: rep.id, d: await draftForReport(db, rep.id) })))
    : [];
  const toBill = billable.find((x) => !("error" in x.d))?.id ?? null;
  const why = billable.length && !toBill ? ("error" in billable[0].d ? billable[0].d.error : "") : "";
  const orderInvoices = dossier ? (await Promise.all(reports.map((rep) => invoicesFor(db, { report: rep.id })))).flat() : [];
  const contractOrder = o.source === "bank" || o.source === "collab";
  let offerInitial: OfferInput | null = null;
  if (offerable) {
    const draft = offerDraft(o, docs, evaluators.find((e) => e.id === user.id && e.role === "evaluator") ?? evaluators.find((e) => e.role === "evaluator") ?? null);
    offerInitial = offer && offer.status !== "declined"
      ? {
          client_name: offer.client_name ?? "", client_email: offer.client_email ?? "", fee: offer.fee, travel_fee: offer.travel_fee, travel_label: offer.travel_label,
          urgent_fee: offer.urgent_fee, vat_rate: offer.vat_rate, term_days: offer.term_days, urgent_days: offer.urgent_days, valid_until: offer.valid_until,
          payment_terms: offer.payment_terms, evaluator_id: offer.evaluator_id, message: offer.message, object_text: offer.object_text ?? "", value_type: offer.value_type ?? "",
          approaches: offer.approaches ?? "", standards: offer.standards ?? "", documents: offerDocs(offer), terms: offer.terms ?? "",
        }
      : draft;
  }

  const backTo = `${base}/comenzi?tab=${({ site: "site", partner: "parteneri", bank: "banci", collab: "colaborari" } as Record<string, string>)[o.source] ?? "directe"}`;
  return (
    <CrmShell
      user={user} base={base} active="orders" title={`Comanda ${orderCode(o)}`}
      subtitle={`${SOURCE_LABEL[o.source]} · ${orderWhat(o)}${o.address ? ` · ${orderPlace(o)}` : ""} · ${o.glide_id ? `din ${fmtDate(o.ordered_on ?? o.created_at)}` : `primită ${fmtDate(o.created_at, true)}`}`}
      actions={<>
        <a href={backTo} className="btn btnGhost btnSm">← Comenzi</a>
        {isAdmin(user) && <DeleteOrder id={o.id} label={orderCode(o)} back={backTo}
          blocked={reports.length ? "Comanda are deja raport creat: anulează sau șterge întâi raportul." : offer?.status === "accepted" ? "Clientul a acceptat oferta: comanda nu se mai poate șterge, doar anula." : o.statement_id ? "Comanda este pe un borderou." : null} />}
      </>}
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
            </section>
          ) : o.source === "direct" ? (
            <section className="card">
              <h2>Lucrare directă · contract clasic</h2>
              <dl className="dl">
                <div><dt>Client</dt><dd>{o.client_id ? <a className="rowLink" href={`${base}/clienti/${o.client_id}`}>{o.client_name ?? "—"}</a> : o.client_name ?? "—"}</dd></div>
                {o.client_phone && <div><dt>Telefon</dt><dd><a href={`tel:${o.client_phone}`}>{o.client_phone}</a></dd></div>}
                {o.client_email && <div><dt>Email</dt><dd><a href={`mailto:${o.client_email}`}>{o.client_email}</a></dd></div>}
                {o.report_type && <div><dt>Tip raport</dt><dd>{o.report_type}</dd></div>}
                {o.purpose && <div><dt>Scop</dt><dd>{o.purpose}</dd></div>}
                <div><dt>Onorariu</dt><dd>{lei(o.fee)}</dd></div>
                <div><dt>Înregistrată de</dt><dd>{o.creator_name || o.creator_email || "—"}</dd></div>
                {o.contract_number && <div><dt>Contract</dt><dd>Clasic nr. {o.contract_number}</dd></div>}
              </dl>
              <p className="hint">Contractul clasic se generează automat la acceptarea ofertei (sau când creezi raportul de mai jos), cu numărul următor.</p>
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
          {!o.glide_id && o.status !== "cancelled" && (
            <section className="card" style={{ border: `1.5px solid ${dossier ? "var(--line)" : "var(--acc)"}` }}>
              <div className="cardHead">
                <h2>Procesare</h2>
                <span className={`pill ${dossier ? "pillOk" : offer?.status === "accepted" || contractOrder ? "pillWarn" : ""}`}><i />
                  {dossier ? "Raport creat" : offer?.status === "accepted" || contractOrder ? "De creat raportul" : "Așteaptă acceptarea ofertei"}</span>
              </div>
              {dossier ? (
                <>
                  <div className="actions">
                    <p className="hint" style={{ margin: 0 }}>Comanda se lucrează în raportul {dossier.number ? `nr. ${dossier.number}` : dossier.label ?? ""}: inspecție, redactare, verificare și livrare.</p>
                    <a className="btn btnNavy btnSm" href={`${base}/rapoarte/${dossier.id}`}>Deschide raportul →</a>
                    {toBill && <IssueInvoice report={toBill} label="Emite factura" />}
                  </div>
                  {billable.length > 0 && !toBill && why && !orderInvoices.length && <p className="hint" style={{ margin: 0 }}>Facturare: {why}</p>}
                  {orderInvoices.length > 0 && <><div className="section">Facturi</div><InvoiceList rows={orderInvoices} admin={isAdmin(user)} /></>}
                </>
              ) : (
                <div className="actions">
                  <p className="hint" style={{ margin: 0, flex: "1 1 260px" }}>
                    {contractOrder ? `Comandă ${o.source === "bank" ? `${o.bank ?? "bancă"}${o.contract_number ? ` · contract cadru ${o.contract_number}` : ""}` : `colaborare ${o.collab_firm ?? ""}`}: fără ofertă. Completezi clientul și bunurile (din captura aplicației băncii sau manual) și se creează raportul.`
                      : offer?.status === "accepted" ? "Oferta e semnată. Creează raportul și alocă evaluatorul; inspecțiile le aloci apoi pe raport, pentru fiecare bun."
                      : "Raportul se creează automat când clientul semnează oferta, pe evaluatorul din ofertă. Dacă a acceptat pe alt canal (telefon, email), îl poți crea acum."}
                  </p>
                  {contractOrder ? (
                    <a className="btn btnGold" href={`${base}/comenzi/${o.id}/procesare`}>Procesează: client, bunuri, echipă →</a>
                  ) : <DossierOpen
                    order={o.id} base={base} me={user.id} evaluator={offer?.evaluator_id ?? null}
                    evaluators={evaluators.map((e) => ({ id: e.id, name: e.name, sub: e.anevar_no ? `Evaluator ANEVAR ${e.anevar_no}` : "Evaluator", presence: e.presence, seen: e.seen, photo: e.photo }))}
                    label={contractOrder || offer?.status === "accepted" ? "Creează raportul" : "Creează raportul acum"}
                    primary={contractOrder || offer?.status === "accepted"}
                    hint={`${orderWhat(o)}${o.address ? ` · ${orderPlace(o)}` : ""} · ${o.client_name ?? ""}. Evaluatorul principal primește raportul pe email.`}
                    warn={!contractOrder && offer?.status !== "accepted" ? "Oferta nu este semnată în portal. Creează raportul doar dacă clientul a acceptat pe alt canal." : null}
                    dueDefault={contractOrder ? null : undefined}
                  />}
                </div>
              )}
            </section>
          )}
          {offerable && offerInitial && (
            <OfferEditor
              orderId={o.id} base={base} initial={offerInitial} evaluators={evaluators}
              status={offer ? {
                number: offer.number, status: offer.status, link: await offerLink(offer), created_at: offer.created_at, sent_at: offer.sent_at, sent_to: offer.sent_to,
                viewed_at: offer.viewed_at, accepted_at: offer.accepted_at, accepted_name: offer.accepted_name, accepted_urgent: offer.accepted_urgent,
                total: money(offerTotals(offer).total), accepted_total: offer.accepted_at ? money(offerTotals(offer, !!offer.accepted_urgent).total) : null,
                declined_at: offer.declined_at, decline_reason: offer.decline_reason, expired: offer.status === "sent" && isExpired(offer),
              } : null}
            />
          )}
          <ReportList reports={reports} base={base} title="Rapoarte pentru această comandă" empty="Niciun raport legat de comandă." />
          {(portal || o.source === "site" || o.address) && <OrderInfo o={o} />}
          {!o.glide_id && o.source !== "site" && <OrderDocuments o={o} docs={docs} canUpload={false} href={(d) => `/api/crm/orders/${o.id}/documents/${d.id}`} />}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <OrderStatusCard o={o} docs={docs} progress={progress ? { ...progress, due: progress.report?.due } : undefined} />
          <History log={log} />
        </div>
      </div>
    </CrmShell>
  );
}
