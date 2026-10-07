import type { Metadata } from "next";
import { fmtDate, staffPage } from "@/lib/guard";
import { allOrders, orderCode, orderPlace, orderStatus, orderWhat } from "@/lib/orders";
import { CrmShell } from "@/components/CrmShell";
import { OrdersTable } from "./OrdersTable";
import { BankOrdersTable } from "./BankOrdersTable";
import { LeadsTable } from "./LeadsTable";
import { LEAD_STATUSES, leadStatus, listLeads } from "@/lib/leads";

export const metadata: Metadata = { title: "Comenzi | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** Three inboxes: portal orders (partners, collaborations, direct clients), bank orders under framework contracts, and requests from the website. */
export default async function CrmOrdersPage({ searchParams }: { searchParams: Promise<{ f?: string; tab?: string }> }) {
  const { db, user, base } = await staffPage();
  const sp = await searchParams;
  const tab = sp.tab === "banci" || sp.tab === "site" ? sp.tab : "parteneri";
  const [orders, leadList] = await Promise.all([allOrders(db), listLeads(db)]);
  // Calendar day in Romania, so "astăzi" matches the team's day.
  const day = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });
  const today = day(new Date().toISOString());
  const rows = orders.map((o) => ({
    id: o.id, ref: orderCode(o), created: fmtDate(o.created_at, !o.glide_id), type: orderWhat(o), address: orderPlace(o),
    client: o.client_name ?? "—", clientPhone: o.client_phone, from: o.source === "collab" ? o.collab_firm ?? "Colaborare" : o.source === "site" ? "valuefy.ro" : o.creator_name || o.creator_email || "—",
    fromId: o.created_by, firm: o.partner_name, firmId: o.partner_id, source: o.source, purpose: (o.purpose ?? "—") + (o.bank ? ` · ${o.bank}` : ""), bank: o.bank,
    bankRef: o.bank_ref, branch: o.bank_branch, reportType: o.report_type, fee: o.fee, contract: o.contract_number,
    urgent: !!o.urgent, unread: !o.viewed_at, docs: o.doc_count, docsMissing: !!o.docs_missing, status: orderStatus(o),
    today: day(o.created_at) === today, pending: o.status === "received",
  }));
  // Valuation requests from the website are orders now (source "site"); this tab keeps the properties offered for sale.
  const leads = leadList.filter((l) => l.kind === "sale").map((l) => ({
    id: l.id, created: fmtDate(l.created_at, true), kind: l.kind, status: l.status, statusLabel: leadStatus(l.status),
    urgent: l.deadline === "Urgent" || l.priority === "URGENT", today: day(l.created_at) === today, name: l.name, phone: l.phone, email: l.email,
    type: l.property_type ?? "—", place: [l.address, l.city].filter(Boolean).join(", ") || "—", purpose: l.purpose ?? "—", files: l.files.length,
  }));
  const newLeads = leads.filter((l) => l.status === "NEW").length;
  const portal = rows.filter((r) => r.source !== "bank");
  const banks = rows.filter((r) => r.source === "bank");
  const unread = (list: typeof rows) => list.filter((r) => r.unread).length;
  const TABS: [string, string, number, number][] = [
    ["parteneri", "Comenzi site și parteneri", unread(portal), portal.length],
    ["banci", "Comenzi bănci · contracte cadru", unread(banks), banks.length],
    ["site", "Vânzări de pe site", newLeads, leads.length],
  ];
  const tabQs = tab === "parteneri" ? "" : `tab=${tab}`;
  const link = (f: string) => `${base}/comenzi?${tabQs ? `${tabQs}&` : ""}f=${f}`;
  const CARDS: [string, string, string, number, string][] = [
    ["pending", "Neprocesate", "var(--info)", rows.filter((r) => r.pending).length, "fără ofertă încă"],
    ["today", "Noi astăzi", "var(--acc)", rows.filter((r) => r.today).length,
      `${rows.filter((r) => r.today && r.source === "site").length} site · ${rows.filter((r) => r.today && !["site", "bank"].includes(r.source)).length} parteneri · ${banks.filter((r) => r.today).length} bănci`],
    ["new", "Nedeschise", "var(--acc-ink)", unread(rows), "nimeni nu le-a deschis"],
    ["docs", "Documente lipsă", "var(--err)", rows.filter((r) => r.docsMissing).length, "așteaptă documente"],
    ["urgent", "Urgente", "var(--err)", rows.filter((r) => r.urgent && r.pending).length, "neprocesate, termen ~2 zile"],
  ];

  return (
    <CrmShell user={user} base={base} active="orders" title="Comenzi primite" subtitle={`${orders.length.toLocaleString("ro-RO")} comenzi${unread(rows) ? ` · ${unread(rows)} noi` : ""}${newLeads ? ` · ${newLeads} vânzări noi de pe site` : ""}`}
      actions={<a href={`${base}/comenzi/noua`} className="btn btnGold btnSm">+ Lucrare bancă / colaborare</a>}>
      <div className="kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        {CARDS.map(([f, label, dot, n, sub]) => (
          <a key={f} className="kpi" href={sp.f === f ? `${base}/comenzi${tabQs ? `?${tabQs}` : ""}` : link(f)} aria-current={sp.f === f ? "true" : undefined} style={{ ["--dot" as string]: dot }}>
            <span><i />{label}</span>
            <b>{n}</b>
            <small className="muted">{sub}</small>
          </a>
        ))}
      </div>
      <nav className="tabs" aria-label="Tip comenzi">
        {TABS.map(([k, label, fresh, total]) => (
          <a key={k} href={`${base}/comenzi${k === "parteneri" ? "" : `?tab=${k}`}`} aria-current={tab === k ? "page" : undefined}>
            {label} <small>{fresh ? `${fresh} noi` : total}</small>
          </a>
        ))}
      </nav>
      {tab === "parteneri" ? <OrdersTable rows={portal} base={base} initial={sp.f ?? "all"} />
        : tab === "banci" ? <BankOrdersTable rows={banks} base={base} initial={sp.f ?? "all"} />
        : <LeadsTable rows={leads} base={base} initial={sp.f} statuses={LEAD_STATUSES.map(([k, l]) => [k, l])} />}
    </CrmShell>
  );
}
