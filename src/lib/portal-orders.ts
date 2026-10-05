// Server-only: order rows for the portal lists.
import { fmtDate } from "./guard";
import { orderRef, orderStatus, propertyLabel, type Order } from "./orders";

export const portalRows = (orders: Order[]) =>
  orders.map((o) => ({
    id: o.id, ref: orderRef(o.seq), type: propertyLabel(o.property_type), address: `${o.address}, ${o.city}`, client: o.client_name,
    purpose: o.purpose + (o.bank ? ` · ${o.bank}` : ""), urgent: !!o.urgent, docsMissing: !!o.docs_missing, status: orderStatus(o), created: fmtDate(o.created_at),
  }));

export const portalKpis = (orders: Order[]) => ({
  progress: orders.filter((o) => !o.docs_missing).length,
  action: orders.filter((o) => o.docs_missing).length,
  urgent: orders.filter((o) => o.urgent).length,
  done: 0,
});
