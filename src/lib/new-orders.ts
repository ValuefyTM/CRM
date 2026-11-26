// Server-only: the orders received and not processed yet ("Comenzi noi" on the dashboard, the red circle in the top bar).
import { can, type WithPerms } from "./perms";
import { openTasks } from "./mail-rules";

/**
 * An order of the website or of the collaborators' portal nobody took over yet (alias `o`): no report, not marked
 * processed, no offer sent. The website sends requests for an offer, so the offer sent is what answers them.
 */
export const PENDING = `o.status = 'received' AND o.processed_at IS NULL AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.order_id = COALESCE(o.linked_order_id, o.id))
  AND NOT EXISTS (SELECT 1 FROM offers f WHERE f.order_id = o.id AND f.sent_at IS NOT NULL)`;

/** Who works on every order (the accredited on framework contracts see the banks only). */
export const seesEveryOrder = (u: WithPerms) => can(u, "orders") && !(can(u, "orders.contract") && !can(u, "orders.all"));

/** How many orders wait to be processed, as this person sees them: the tasks from the banks' emails, the website, the portal. */
export async function pendingOrdersCount(db: D1Database, u: WithPerms & { id: string; role: string }): Promise<number> {
  const orders = can(u, "orders");
  const tasks = await openTasks(db, u, orders).catch(() => []);
  if (!seesEveryOrder(u)) return tasks.length;
  const n = await db.prepare(`SELECT COUNT(*) AS n FROM orders o WHERE o.source IN ('site', 'partner') AND o.glide_id IS NULL AND ${PENDING}`).first<{ n: number }>().then((r) => r?.n ?? 0).catch(() => 0);
  return tasks.length + n;
}
