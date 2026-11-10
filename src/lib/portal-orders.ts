// Server-only: order rows for the portal lists.
import { fmtDate } from "./guard";
import { orderCode, orderPlace, orderStatus, orderWhat, type Order } from "./orders";

/** A team member's photo as the portal may load it (the CRM's address is for the team only). */
export const portalPhoto = (id: string, avatarAt: string | null | undefined) => (avatarAt ? `/api/portal/avatar/${encodeURIComponent(id)}?v=${Date.parse(avatarAt) || 0}` : null);
export type TeamFace = { id: string; name: string; role: "evaluator" | "inspector"; photo: string | null };

/** Who works on each order (the evaluator and the inspector of its report), for the avatars of the lists. */
export async function portalTeams(db: D1Database, orders: Order[]): Promise<Record<string, TeamFace[]>> {
  const ids = orders.map((o) => o.linked_order_id ?? o.id);
  if (!ids.length) return {};
  const out: Record<string, TeamFace[]> = {};
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    const { results } = await db.prepare(`SELECT r.order_id, m.role, u.id, COALESCE(NULLIF(u.name, ''), u.email) AS name, u.avatar_at FROM reports r
        JOIN report_members m ON m.report_id = r.id AND m.role IN ('evaluator', 'inspector') JOIN users u ON u.id = m.user_id
        WHERE r.order_id IN (${part.map(() => "?").join(",")}) ORDER BY m.role = 'evaluator' DESC`).bind(...part)
      .all<{ order_id: string; role: "evaluator" | "inspector"; id: string; name: string; avatar_at: string | null }>();
    for (const r of results) {
      const o = orders.find((x) => (x.linked_order_id ?? x.id) === r.order_id);
      if (!o) continue;
      const list = (out[o.id] ??= []);
      if (!list.some((x) => x.id === r.id)) list.push({ id: r.id, name: r.name, role: r.role, photo: portalPhoto(r.id, r.avatar_at) });
    }
  }
  return out;
}

export const portalRows = (orders: Order[], teams: Record<string, TeamFace[]> = {}) =>
  orders.map((o) => ({
    id: o.id, ref: orderCode(o), type: orderWhat(o), address: orderPlace(o), client: o.client_name ?? "—",
    purpose: (o.purpose ?? "—") + (o.bank ? ` · ${o.bank}` : ""), urgent: !!o.urgent, docsMissing: !!o.docs_missing, status: orderStatus(o), created: fmtDate(o.created_at),
    team: teams[o.id] ?? [],
  }));

export const portalKpis = (orders: Order[]) => ({
  progress: orders.filter((o) => !o.docs_missing && ["received", "in_progress"].includes(o.status)).length,
  action: orders.filter((o) => o.docs_missing && o.status === "received").length,
  urgent: orders.filter((o) => o.urgent && o.status === "received").length,
  done: orders.filter((o) => o.status === "done").length,
});
