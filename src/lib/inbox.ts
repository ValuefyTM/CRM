// Server-only: reading Emailuri primite (the emails kept, their attachments, the tasks they opened) for the CRM pages.
import type { MailRule } from "./mail-rules";

export type InboxRow = { id: string; received_at: string; via: string; mail_from: string | null; subject: string | null; status: string; bank: string | null; bank_ref: string | null;
  client_name: string | null; rule_id: string | null; rule_name: string | null; task_id: string | null; task_status: string | null; order_id: string | null; report_id: string | null; files: number };

/** Which tab an email is in: with a rule (a task, or the same request again), without, or ignored. */
export const INBOX_TABS: [key: string, label: string, sql: string][] = [
  ["toate", "Toate", "1"],
  ["cu", "Cu regulă", "b.status IN ('task', 'duplicate', 'order', 'incomplete', 'resumed', 'noted', 'no_report')"],
  ["fara", "Fără regulă", "b.status IN ('unmatched', 'unrecognised', 'new')"],
  ["ignorate", "Ignorate", "b.status = 'ignored'"],
];

export const STATUS_LABEL: Record<string, [string, string]> = {
  task: ["Task creat", "pillInfo"], order: ["Comandă creată", "pillOk"], duplicate: ["Aceeași cerere", ""], incomplete: ["Regulă fără nr. comandă", "pillWarn"],
  resumed: ["Raport reluat în lucru", "pillOk"], noted: ["Notat pe raport", "pillInfo"], no_report: ["Raport negăsit", "pillWarn"],
  unmatched: ["Fără regulă", "pillWarn"], unrecognised: ["Fără regulă", "pillWarn"], new: ["Fără regulă", "pillWarn"], ignored: ["Ignorat", ""],
};

const COLS = `b.id, b.received_at, b.via, b.mail_from, b.subject, b.status, b.bank, b.bank_ref, b.client_name, b.rule_id, r.name AS rule_name, b.task_id, t.status AS task_status, b.order_id, b.report_id,
  (SELECT COUNT(*) FROM mail_attachments a WHERE a.email_id = b.id) AS files`;
const FROM = "FROM bank_emails b LEFT JOIN mail_rules r ON r.id = b.rule_id LEFT JOIN mail_tasks t ON t.id = b.task_id";

export async function inboxList(db: D1Database, tab: string, q: string) {
  const sql = INBOX_TABS.find(([k]) => k === tab)?.[2] ?? "1";
  const like = q.trim() ? `%${q.trim().toLowerCase()}%` : null;
  const where = `WHERE ${sql}${like ? " AND (lower(COALESCE(b.subject, '')) LIKE ?1 OR lower(COALESCE(b.mail_from, '')) LIKE ?1 OR lower(COALESCE(b.bank_ref, '')) LIKE ?1 OR lower(COALESCE(b.client_name, '')) LIKE ?1 OR lower(COALESCE(b.body, '')) LIKE ?1)" : ""}`;
  const [rows, counts] = await Promise.all([
    db.prepare(`SELECT ${COLS} ${FROM} ${where} ORDER BY b.received_at DESC LIMIT 200`).bind(...(like ? [like] : [])).all<InboxRow>().then((r) => r.results),
    db.prepare(`SELECT ${INBOX_TABS.map(([k, , s]) => `SUM(CASE WHEN ${s} THEN 1 ELSE 0 END) AS "${k}"`).join(", ")} FROM bank_emails b`).first<Record<string, number | null>>(),
  ]);
  return { rows, counts: counts ?? {} };
}

export type InboxEmail = InboxRow & { mail_to: string | null; body: string | null; request_type: string | null; created_name: string | null };
export async function inboxEmail(db: D1Database, id: string) {
  const e = await db.prepare(`SELECT ${COLS}, b.mail_to, b.body, b.request_type, COALESCE(NULLIF(u.name, ''), u.email) AS created_name ${FROM} LEFT JOIN users u ON u.id = b.created_by WHERE b.id = ?`)
    .bind(id).first<InboxEmail>();
  if (!e) return null;
  const [files, task] = await Promise.all([
    db.prepare("SELECT id, filename, content_type, size_bytes FROM mail_attachments WHERE email_id = ? ORDER BY rowid").bind(id).all<{ id: string; filename: string; content_type: string | null; size_bytes: number }>().then((r) => r.results),
    e.task_id ? db.prepare(`SELECT t.id, t.title, t.status, t.kind, t.created_at, t.done_at, t.done_note, t.order_id, COALESCE(NULLIF(d.name, ''), d.email) AS done_name
        FROM mail_tasks t LEFT JOIN users d ON d.id = t.done_by WHERE t.id = ?`).bind(e.task_id)
      .first<{ id: string; title: string; status: string; kind: string; created_at: string; done_at: string | null; done_note: string | null; order_id: string | null; done_name: string | null }>() : Promise.resolve(null),
  ]);
  return { ...e, files, task };
}

export const ruleById = (db: D1Database, id: string) => db.prepare("SELECT * FROM mail_rules WHERE id = ?").bind(id).first<MailRule>();
