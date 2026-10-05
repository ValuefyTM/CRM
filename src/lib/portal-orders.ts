// Server-only: order rows for the portal lists.
import { fmtDate } from "./guard";
import { orderCode, orderPlace, orderStatus, orderWhat, type Order } from "./orders";

export const portalRows = (orders: Order[]) =>
  orders.map((o) => ({
    id: o.id, ref: orderCode(o), type: orderWhat(o), address: orderPlace(o), client: o.client_name ?? "—",
    purpose: (o.purpose ?? "—") + (o.bank ? ` · ${o.bank}` : ""), urgent: !!o.urgent, docsMissing: !!o.docs_missing, status: orderStatus(o), created: fmtDate(o.created_at),
  }));

export const portalKpis = (orders: Order[]) => ({
  progress: orders.filter((o) => !o.docs_missing && ["received", "in_progress"].includes(o.status)).length,
  action: orders.filter((o) => o.docs_missing && o.status === "received").length,
  urgent: orders.filter((o) => o.urgent && o.status === "received").length,
  done: orders.filter((o) => o.status === "done").length,
});
