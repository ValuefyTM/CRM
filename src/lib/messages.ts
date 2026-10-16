// Server-only: messages on a report or an order (the old Glide chat, and the ones written in the CRM).
import { now, uuid } from "./db";
import { fileSrc } from "./files";
import { photoUrl } from "./presence";

export type Message = { id: string; author_id: string | null; photo: string | null; author: string; mine: boolean; staff: boolean; body: string; file: string | null; at: string };
export type MessageEntity = "report" | "order";

export async function messagesOf(db: D1Database, entity: MessageEntity, id: string, me: string): Promise<Message[]> {
  const { results } = await db.prepare(
    `SELECT m.id, m.author_id, m.body, m.attachment_url, m.created_at, COALESCE(NULLIF(u.name, ''), m.author_name, u.email, m.author_email, 'Necunoscut') AS author, u.kind, u.avatar_at
      FROM messages m LEFT JOIN users u ON u.id = m.author_id WHERE m.entity = ? AND m.entity_id = ? ORDER BY m.created_at`,
  ).bind(entity, id).all<{ id: string; author_id: string | null; body: string; attachment_url: string | null; created_at: string; author: string; kind: string | null; avatar_at: string | null }>();
  return results.map((m) => ({ id: m.id, author_id: m.author_id, photo: m.author_id ? photoUrl(m.author_id, m.avatar_at) : null, author: m.author, mine: m.author_id === me, staff: m.kind === "internal", body: m.body, file: fileSrc(m.attachment_url), at: m.created_at }));
}

export async function addMessage(db: D1Database, entity: MessageEntity, id: string, user: { id: string; name: string; email: string }, body: string) {
  const table = entity === "report" ? "reports" : "orders";
  if (!(await db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).bind(id).first())) return { ok: false as const, error: "Nu există." };
  await db.prepare("INSERT INTO messages (id, entity, entity_id, author_id, author_name, author_email, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(uuid(), entity, id, user.id, user.name || null, user.email, body, now()).run();
  return { ok: true as const };
}
