import type { Metadata } from "next";
import { fmtDate, staffPage } from "@/lib/guard";
import { allOrders, orderRef, orderStatus, propertyLabel } from "@/lib/orders";
import { CrmShell } from "@/components/CrmShell";
import { OrdersTable } from "./OrdersTable";

export const metadata: Metadata = { title: "Comenzi | CRM VALUEFY" };
export const dynamic = "force-dynamic";

export default async function CrmOrdersPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { db, user, base } = await staffPage();
  const orders = await allOrders(db);
  const unread = orders.filter((o) => !o.viewed_at).length;
  const rows = orders.map((o) => ({
    id: o.id, ref: orderRef(o.seq), created: fmtDate(o.created_at, true), type: propertyLabel(o.property_type), address: `${o.address}, ${o.city}`,
    client: o.client_name, clientPhone: o.client_phone, from: o.creator_name || o.creator_email || "—", fromId: o.created_by,
    firm: o.partner_name, firmId: o.partner_id, source: o.source, purpose: o.purpose + (o.bank ? ` · ${o.bank}` : ""),
    urgent: !!o.urgent, unread: !o.viewed_at, docs: o.doc_count, docsMissing: !!o.docs_missing, status: orderStatus(o),
  }));
  return (
    <CrmShell user={user} base={base} active="orders" title="Comenzi primite" subtitle={`${orders.length} comenzi din portal${unread ? ` · ${unread} nedeschise` : ""}`}>
      <OrdersTable rows={rows} base={base} initial={(await searchParams).f ?? "all"} />
    </CrmShell>
  );
}
