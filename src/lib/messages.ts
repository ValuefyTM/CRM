// Server-only: messages on a report or an order (the old Glide chat, and the ones written in the CRM).
import { now, uuid } from "./db";
import { fileSrc } from "./files";
import { photoUrl } from "./presence";

/** `tag`: where a message comes from in a mixed thread — "portal" written by the collaborator in the portal,
 *  "broker" written by the team to the collaborator, "order" written on the order (internal). */
export type MsgTag = "portal" | "broker" | "order";
export type Message = { id: string; author_id: string | null; photo: string | null; author: string; mine: boolean; staff: boolean; body: string; file: string | null; at: string; tag?: MsgTag | null };
export type MessageEntity = "report" | "order";

/** `sharedOnly`: the conversation with the collaborator of an order, as the portal shows it. */
export async function messagesOf(db: D1Database, entity: MessageEntity, id: string, me: string, sharedOnly = false): Promise<Message[]> {
  const { results } = await db.prepare(
    `SELECT m.id, m.author_id, m.body, m.attachment_url, m.created_at, COALESCE(NULLIF(u.name, ''), m.author_name, u.email, m.author_email, 'Necunoscut') AS author, u.kind, u.avatar_at
      FROM messages m LEFT JOIN users u ON u.id = m.author_id WHERE m.entity = ? AND m.entity_id = ? ${sharedOnly ? "AND m.shared = 1" : ""} ORDER BY m.created_at`,
  ).bind(entity, id).all<Row>();
  return results.map((m) => toMessage(m, me));
}

type Row = { id: string; author_id: string | null; body: string; attachment_url: string | null; created_at: string; author: string; kind: string | null; avatar_at: string | null; shared?: number };
const toMessage = (m: Row, me: string, tag: MsgTag | null = null): Message => ({ id: m.id, author_id: m.author_id, photo: m.author_id ? photoUrl(m.author_id, m.avatar_at) : null, author: m.author,
  mine: m.author_id === me, staff: m.kind === "internal", body: m.body, file: fileSrc(m.attachment_url), at: m.created_at, tag });

/** The orders behind a report: the one it was made for and the collaborator's portal order that leads to it (if any). */
export async function reportOrders(db: D1Database, reportId: string) {
  const r = await db.prepare("SELECT order_id FROM reports WHERE id = ?").bind(reportId).first<{ order_id: string | null }>();
  if (!r?.order_id) return { work: null as string | null, broker: null as { id: string; name: string | null } | null };
  // the collaborator's portal order: the report's own order, or the one linked to it when processed as a collaboration
  const b = await db.prepare(`SELECT o.id, COALESCE(NULLIF(u.name, ''), u.email) AS name FROM orders o LEFT JOIN users u ON u.id = o.created_by
      WHERE (o.id = ?1 OR o.linked_order_id = ?1) AND o.source = 'partner' AND o.glide_id IS NULL ORDER BY o.id = ?1 DESC LIMIT 1`).bind(r.order_id).first<{ id: string; name: string | null }>();
  return { work: r.order_id, broker: b ?? null };
}

/**
 * A report's whole conversation: the team's messages on the report, and those on its orders — the collaborator's
 * messages from the portal (tag "portal"), the team's to them (tag "broker"), the internal ones on the order ("order").
 */
export async function reportThread(db: D1Database, reportId: string, me: string): Promise<Message[]> {
  const [own, { work, broker }] = await Promise.all([messagesOf(db, "report", reportId, me), reportOrders(db, reportId)]);
  const ids = [...new Set([work, broker?.id].filter((x): x is string => !!x))];
  if (!ids.length) return own;
  const { results } = await db.prepare(
    `SELECT m.id, m.author_id, m.body, m.attachment_url, m.created_at, m.shared, COALESCE(NULLIF(u.name, ''), m.author_name, u.email, m.author_email, 'Necunoscut') AS author, u.kind, u.avatar_at
      FROM messages m LEFT JOIN users u ON u.id = m.author_id WHERE m.entity = 'order' AND m.entity_id IN (${ids.map(() => "?").join(",")}) ORDER BY m.created_at`,
  ).bind(...ids).all<Row>();
  const fromOrders = results.map((m) => toMessage(m, me, m.kind === "partner" ? "portal" : m.shared ? "broker" : "order"));
  return [...own, ...fromOrders].sort((a, b) => a.at.localeCompare(b.at));
}

/** An order's conversation as the CRM shows it: its messages, the collaborator's tagged as coming from the portal. */
export async function orderThread(db: D1Database, orderId: string, me: string): Promise<Message[]> {
  const { results } = await db.prepare(
    `SELECT m.id, m.author_id, m.body, m.attachment_url, m.created_at, m.shared, COALESCE(NULLIF(u.name, ''), m.author_name, u.email, m.author_email, 'Necunoscut') AS author, u.kind, u.avatar_at
      FROM messages m LEFT JOIN users u ON u.id = m.author_id WHERE m.entity = 'order' AND m.entity_id = ? ORDER BY m.created_at`,
  ).bind(orderId).all<Row>();
  return results.map((m) => toMessage(m, me, m.kind === "partner" ? "portal" : null));
}

export async function addMessage(db: D1Database, entity: MessageEntity, id: string, user: { id: string; name: string; email: string }, body: string, shared = false) {
  const table = entity === "report" ? "reports" : "orders";
  if (!(await db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).bind(id).first())) return { ok: false as const, error: "Nu există." };
  await db.prepare("INSERT INTO messages (id, entity, entity_id, author_id, author_name, author_email, body, created_at, shared) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(uuid(), entity, id, user.id, user.name || null, user.email, body, now(), shared ? 1 : 0).run();
  return { ok: true as const };
}
