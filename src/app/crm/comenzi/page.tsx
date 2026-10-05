import type { Metadata } from "next";
import { fmtDate, staffPage } from "@/lib/guard";
import { allOrders, orderRef, orderStatus, propertyLabel } from "@/lib/orders";
import { CrmShell } from "@/components/CrmShell";
import { OrdersTable } from "./OrdersTable";
import { BankOrdersTable } from "./BankOrdersTable";

export const metadata: Metadata = { title: "Comenzi | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** Two inboxes: orders from the portal (partners and their clients, direct clients) and bank orders under framework contracts (from email). */
export default async function CrmOrdersPage({ searchParams }: { searchParams: Promise<{ f?: string; tab?: string }> }) {
  const { db, user, base } = await staffPage();
  const sp = await searchParams;
  const tab = sp.tab === "banci" ? "banci" : "parteneri";
  const orders = await allOrders(db);
  const rows = orders.map((o) => ({
    id: o.id, ref: orderRef(o.seq), created: fmtDate(o.created_at, true), type: propertyLabel(o.property_type), address: `${o.address}, ${o.city}`,
    client: o.client_name, clientPhone: o.client_phone, from: o.creator_name || o.creator_email || "—", fromId: o.created_by,
    firm: o.partner_name, firmId: o.partner_id, source: o.source, purpose: o.purpose + (o.bank ? ` · ${o.bank}` : ""), bank: o.bank,
    urgent: !!o.urgent, unread: !o.viewed_at, docs: o.doc_count, docsMissing: !!o.docs_missing, status: orderStatus(o),
  }));
  const portal = rows.filter((r) => r.source !== "bank");
  const banks = rows.filter((r) => r.source === "bank");
  const unread = (list: typeof rows) => list.filter((r) => r.unread).length;
  const TABS: [string, string, typeof rows][] = [["parteneri", "Comenzi parteneri", portal], ["banci", "Comenzi bănci · contracte cadru", banks]];

  return (
    <CrmShell user={user} base={base} active="orders" title="Comenzi primite" subtitle={`${orders.length} comenzi${unread(rows) ? ` · ${unread(rows)} nedeschise` : ""}`}>
      <nav className="tabs" aria-label="Tip comenzi">
        {TABS.map(([k, label, list]) => (
          <a key={k} href={`${base}/comenzi${k === "banci" ? "?tab=banci" : ""}`} aria-current={tab === k ? "page" : undefined}>
            {label} <small>{unread(list) ? `${unread(list)} noi` : list.length}</small>
          </a>
        ))}
      </nav>
      {tab === "parteneri"
        ? <OrdersTable rows={portal} base={base} initial={sp.f ?? "all"} />
        : <BankOrdersTable rows={banks} base={base} />}
    </CrmShell>
  );
}
