import type { Metadata } from "next";
import { portalPage } from "@/lib/guard";
import { ordersFor } from "@/lib/orders";
import { portalRows } from "@/lib/portal-orders";
import { PortalShell } from "@/components/PortalShell";
import { PortalOrders } from "@/components/PortalOrders";

export const metadata: Metadata = { title: "Comenzi | Portal VALUEFY" };
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const { db, user, base } = await portalPage();
  const orders = await ordersFor(db, user);
  const partner = user.kind === "partner";
  return (
    <PortalShell user={user} base={base} active="orders" title={partner ? "Comenzi" : "Evaluările mele"} subtitle={`${orders.length} comenzi${partner ? ` · ${user.partner_name}` : ""}`}>
      <div className="actions"><a href={`${base}/comenzi/noua`} className="btn btnGold">{partner ? "+ Comandă nouă" : "+ Solicită o evaluare"}</a></div>
      <PortalOrders rows={portalRows(orders)} base={base} partner={partner} />
    </PortalShell>
  );
}
