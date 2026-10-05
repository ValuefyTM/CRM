import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmtDate, staffPage } from "@/lib/guard";
import { history } from "@/lib/history";
import { clientContacts, clientPortalUsers, getClient, kindName } from "@/lib/clients";
import { STATUS_LABEL } from "@/lib/labels";
import { orderCode, orderStatus, orderWhat, type Order } from "@/lib/orders";
import { lei, type ReportRow } from "@/lib/reports";
import { CrmShell } from "@/components/CrmShell";
import { History } from "@/components/History";
import { ReportList } from "@/components/ReportList";
import { ClientForm } from "../ClientForm";
import { ContactsPanel } from "./ContactsPanel";
import { PortalButton } from "./PortalButton";

export const metadata: Metadata = { title: "Client | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const NEW_MSG: Record<string, [string, string]> = {
  "1": ["okMsg", "Clientul a fost salvat."],
  portal: ["okMsg", "Clientul a fost salvat și a primit invitația în portalul client."],
  "portal-neinvitat": ["note", "Clientul a fost salvat și contul de portal a fost creat, dar emailul de invitație nu a putut fi trimis. Deschide contul din cardul „Portal client” și retrimite invitația de acolo."],
  "portal-eroare": ["note", "Clientul a fost salvat, dar contul de portal nu a putut fi creat (verifică adresa de email)."],
};

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nou?: string }> }) {
  const { db, user, base } = await staffPage();
  const { id } = await params;
  const c = await getClient(db, id);
  if (!c) notFound();
  const [contacts, portalUsers, reports, orders, totals, log] = await Promise.all([
    clientContacts(db, id),
    clientPortalUsers(db, id),
    db.prepare(`SELECT r.id, r.number, r.label, r.report_date, r.status, r.fee, r.result_value, r.report_type, NULL AS client_name, NULL AS bank_code, NULL AS issuer_name,
        (SELECT u.name FROM report_members m JOIN users u ON u.id = m.user_id WHERE m.report_id = r.id AND m.role = 'evaluator' LIMIT 1) AS evaluator,
        (SELECT COALESCE(p.type, '') || '|' || COALESCE(p.full_address, p.city, '') FROM assets a JOIN crm_properties p ON p.id = a.property_id WHERE a.report_id = r.id ORDER BY a.is_main DESC LIMIT 1) AS asset
      FROM reports r WHERE r.client_id = ? ORDER BY r.report_date DESC LIMIT 50`).bind(id).all<ReportRow>().then((r) => r.results),
    db.prepare("SELECT o.*, NULL AS creator_name FROM orders o WHERE o.client_id = ? ORDER BY o.created_at DESC LIMIT 50").bind(id).all<Order>().then((r) => r.results),
    db.prepare("SELECT COUNT(*) AS n, SUM(CASE WHEN status = 'done' THEN fee END) AS fees FROM reports WHERE client_id = ?").bind(id).first<{ n: number; fees: number | null }>(),
    history(db, [id]),
  ]);
  const byEmail = new Map(portalUsers.map((u) => [u.email, u.status]));
  const company = c.kind !== "person";
  const nou = (await searchParams).nou;

  return (
    <CrmShell
      user={user} base={base} active="clients" title={c.name}
      subtitle={`${kindName(c.kind)}${c.cui ? ` · CUI ${c.cui}` : ""}${c.city ? ` · ${c.city}` : ""} · ${totals?.n ?? 0} rapoarte${totals?.fees ? ` · ${lei(Math.round(totals.fees))} onorarii` : ""}`}
      actions={<a href={`${base}/clienti`} className="btn btnGhost btnSm">← Clienți</a>}
    >
      {nou && NEW_MSG[nou] && <div className={NEW_MSG[nou][0]}>{NEW_MSG[nou][1]}</div>}
      <div className="cols">
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <ClientForm
            base={base} clientId={c.id}
            initial={{ kind: c.kind, name: c.name, cui: c.cui ?? "", reg_no: c.reg_no ?? "", billing_address: c.billing_address ?? "", city: c.city ?? "", county: c.county ?? "",
              phone: c.phone ?? "", email: c.email ?? "", vat_payer: c.vat_payer == null ? null : !!c.vat_payer, caen: c.caen ?? "", notes: c.notes ?? "" }}
          />
          {company && <ContactsPanel clientId={c.id} contacts={contacts.map((x) => ({ ...x, portal: x.email ? byEmail.get(x.email) ?? null : null }))} />}
          <ReportList reports={reports} base={base} title={`Rapoarte (${totals?.n ?? 0})`} empty="Niciun raport pentru acest client." />
          {orders.length > 0 && (
            <section className="card">
              <h2>Comenzi</h2>
              <ul className="people">
                {orders.map((o) => {
                  const [l, cls] = orderStatus(o);
                  return (
                    <li key={o.id}>
                      <span className="who"><a className="rowLink" href={`${base}/comenzi/${o.id}`}>{orderCode(o)}</a><span className="muted">{orderWhat(o)} · {fmtDate(o.ordered_on ?? o.created_at)}{o.bank ? ` · ${o.bank}` : ""}</span></span>
                      <span className={`pill ${cls}`}><i />{l}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <section className="card">
            <h2>Portal client</h2>
            {portalUsers.length > 0 ? (
              <ul className="people">
                {portalUsers.map((u) => {
                  const [l, cls] = STATUS_LABEL[u.status] ?? [u.status, ""];
                  return (
                    <li key={u.id}>
                      <span className="who"><a className="rowLink" href={`${base}/utilizatori/${u.id}`}>{u.name || u.email}</a><span className="muted">{u.email} · {u.last_login_at ? `ultima autentificare ${fmtDate(u.last_login_at, true)}` : u.invited_at ? `invitat ${fmtDate(u.invited_at)}` : "neinvitat"}</span></span>
                      <span className={`pill ${cls}`}><i />{l}</span>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="hint">Clientul nu are încă acces în portal. {company ? "Activează-l pentru una dintre persoanele de contact sau pentru emailul firmei." : ""}</p>}
            {c.email && !byEmail.has(c.email) && <PortalButton clientId={c.id} label={company ? `Activează pentru ${c.email}` : "Activează contul în portal"} />}
          </section>
          <History log={log} />
        </div>
      </div>
    </CrmShell>
  );
}
