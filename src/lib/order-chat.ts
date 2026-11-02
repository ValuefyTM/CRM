// Server-only: the conversation with the collaborator who sent an order (portal), and the documents asked of them.
// The team writes in the order's chat, or asks for documents; the collaborator reads and answers in the portal, and
// uploads what was asked there. Each side hears of the other by email.
import { now, uuid } from "./db";
import { appUrl } from "./site";
import { esc, layout, sendEmail } from "./email";
import { teamInbox } from "./order-emails";
import { addMessage } from "./messages";
import { bucket, getOrder, type Order } from "./orders";
import { orderCode } from "./order-labels";
import { guessDocKind } from "./doc-kinds";

export type DocRequest = { id: string; name: string; note: string | null; requested_at: string; requested_by_name: string | null; doc_id: string | null; done_at: string | null };

/** An order whose chat is shared with the one who sent it: a collaborator's portal order. */
export const sharedChat = (o: Pick<Order, "source" | "glide_id">) => o.source === "partner" && !o.glide_id;

export async function docRequests(db: D1Database, orderId: string): Promise<DocRequest[]> {
  const { results } = await db.prepare(`SELECT q.id, q.name, q.note, q.requested_at, q.doc_id, q.done_at, COALESCE(NULLIF(u.name, ''), u.email) AS requested_by_name
      FROM order_doc_requests q LEFT JOIN users u ON u.id = q.requested_by WHERE q.order_id = ? AND q.cancelled_at IS NULL ORDER BY q.requested_at`).bind(orderId)
    .all<DocRequest>().catch(() => ({ results: [] as DocRequest[] }));
  return results;
}

const p = (t: string) => `<p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#4A4A4A">${t}</p>`;
const quote = (t: string) => `<div style="margin:6px 0 12px;padding:12px 14px;border-left:3px solid #F2A93B;background:#FBF8F2;font-size:14px;line-height:1.6;color:#141414;white-space:pre-wrap">${esc(t)}</div>`;

/** The collaborator hears from the team (a message, documents asked). */
async function toBroker(o: Order, subject: string, title: string, html: string, text: string) {
  if (!o.creator_email) return;
  const link = await appUrl("portal", `/comenzi/${o.id}`);
  await sendEmail({
    to: o.creator_email, subject, text: `${text}\n\nRăspunde sau încarcă actele din pagina comenzii: ${link}`,
    html: layout({ eyebrow: `Comanda ${orderCode(o)}`, title, body: html, button: { label: "Deschide comanda →", url: link }, foot: "Răspunsul îl scrii în pagina comenzii din portal, la Mesaje." }),
  }).catch((e) => console.error("broker mail", e));
}

/** The team hears from the collaborator: the report's evaluator (when the report is open) and the orders inbox. */
async function toTeam(db: D1Database, o: Order, subject: string, title: string, html: string, text: string) {
  const work = o.linked_order_id ?? o.id;
  const { results } = await db.prepare(`SELECT DISTINCT u.email FROM reports r JOIN report_members m ON m.report_id = r.id AND m.role = 'evaluator' JOIN users u ON u.id = m.user_id
      WHERE r.order_id = ? AND u.status <> 'disabled'`).bind(work).all<{ email: string }>().catch(() => ({ results: [] as { email: string }[] }));
  const to = [...new Set([...results.map((r) => r.email), ...teamInbox()].filter(Boolean).map((x) => x.toLowerCase()))];
  const link = await appUrl("crm", `/comenzi/${o.id}`);
  for (const t of to) await sendEmail({
    to: t, subject, text: `${text}\n${link}`,
    html: layout({ eyebrow: `Comanda ${orderCode(o)}`, title, body: html, button: { label: "Deschide în CRM →", url: link }, foot: "Mesajele cu colaboratorul sunt în pagina comenzii." }),
  }).catch((e) => console.error("team mail", e));
}

/** A message in the order's chat: shared with the collaborator, who hears of it (or the team, when it is theirs). */
export async function orderMessage(db: D1Database, orderId: string, user: { id: string; name: string; email: string; kind?: string }, body: string) {
  const o = await getOrder(db, orderId);
  if (!o) return { ok: false as const, error: "Nu există." };
  const shared = sharedChat(o);
  const r = await addMessage(db, "order", orderId, user, body, shared);
  if (!r.ok || !shared) return r;
  const who = user.name || user.email;
  if (user.kind === "partner") await toTeam(db, o, `Mesaj de la ${who} · comanda ${orderCode(o)}`, `${esc(who)} a scris`, quote(body), `${who} a scris la comanda ${orderCode(o)}:\n\n${body}`);
  else await toBroker(o, `Mesaj de la VALUEFY · comanda ${orderCode(o)}`, "Ai un mesaj de la echipă", p(`${esc(who)} ți-a scris despre comanda <b>${esc(orderCode(o))}</b>${o.client_name ? ` (${esc(o.client_name)})` : ""}:`) + quote(body), `${who} ți-a scris despre comanda ${orderCode(o)}:\n\n${body}`);
  return r;
}

/** Documents asked of the collaborator: each a missing document of the order, a line in the chat, an email. */
export async function requestDocs(db: D1Database, orderId: string, user: { id: string; name: string; email: string }, names: string[], note: string) {
  const o = await getOrder(db, orderId);
  if (!o) return { ok: false as const, error: "Nu există." };
  if (!sharedChat(o)) return { ok: false as const, error: "Actele se cer așa doar pe comenzile colaboratorilor din portal." };
  const list = [...new Set(names.map((n) => n.trim().slice(0, 160)).filter(Boolean))].slice(0, 15);
  if (!list.length) return { ok: false as const, error: "Alege sau scrie actele solicitate." };
  const t = now();
  await db.batch(list.map((n) => db.prepare("INSERT INTO order_doc_requests (id, order_id, name, note, requested_by, requested_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(uuid(), orderId, n, note.trim().slice(0, 1000) || null, user.id, t)));
  await db.prepare("UPDATE orders SET docs_missing = 1, updated_at = ? WHERE id = ?").bind(t, orderId).run();
  const body = `Am solicitat actele:\n${list.map((n) => `• ${n}`).join("\n")}${note.trim() ? `\n\n${note.trim()}` : ""}\n\nLe poți încărca din pagina comenzii, la Documente.`;
  await addMessage(db, "order", orderId, user, body, true);
  await toBroker(o, `Acte solicitate · comanda ${orderCode(o)}`, "Avem nevoie de câteva acte",
    p(`Pentru comanda <b>${esc(orderCode(o))}</b>${o.client_name ? ` (${esc(o.client_name)})` : ""} avem nevoie de:`)
      + `<ul style="margin:0 0 12px;padding-left:20px;font-size:15px;line-height:1.7;color:#141414">${list.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`
      + (note.trim() ? quote(note.trim()) : "") + p("Le încarci din pagina comenzii, fiecare în dreptul lui."),
    `Pentru comanda ${orderCode(o)} avem nevoie de:\n${list.map((n) => `- ${n}`).join("\n")}${note.trim() ? `\n\n${note.trim()}` : ""}`);
  return { ok: true as const, count: list.length };
}

export async function cancelRequest(db: D1Database, orderId: string, requestId: string) {
  const r = await db.prepare("UPDATE order_doc_requests SET cancelled_at = ? WHERE id = ? AND order_id = ? AND done_at IS NULL").bind(now(), requestId, orderId).run();
  return !!r.meta.changes;
}

/**
 * A document uploaded for a request: the request is fulfilled, the chat says so, the team hears, and — when the
 * report is already open — the document goes on its main asset too.
 */
export async function fulfillRequest(db: D1Database, orderId: string, requestId: string, docId: string, user: { id: string; name: string; email: string; kind?: string }) {
  const q = await db.prepare("SELECT id, name FROM order_doc_requests WHERE id = ? AND order_id = ? AND cancelled_at IS NULL AND done_at IS NULL").bind(requestId, orderId).first<{ id: string; name: string }>();
  if (!q) return;
  const t = now();
  await db.prepare("UPDATE order_doc_requests SET doc_id = ?, done_at = ? WHERE id = ?").bind(docId, t, q.id).run();
  const left = await db.prepare("SELECT COUNT(*) AS n FROM order_doc_requests WHERE order_id = ? AND done_at IS NULL AND cancelled_at IS NULL").bind(orderId).first<{ n: number }>();
  await addMessage(db, "order", orderId, user, `Am încărcat: ${q.name}.`, true);
  const o = await getOrder(db, orderId);
  if (!o) return;
  await copyToReport(db, o, docId, user.id).catch((e) => console.error("doc to report", e));
  const who = user.name || user.email;
  await toTeam(db, o, `Act încărcat: ${q.name} · comanda ${orderCode(o)}`, `${esc(who)} a încărcat un act solicitat`,
    p(`<b>${esc(q.name)}</b> la comanda <b>${esc(orderCode(o))}</b>.${left?.n ? ` Mai sunt ${left.n} de primit.` : " Toate actele solicitate au fost încărcate."}`),
    `${who} a încărcat „${q.name}” la comanda ${orderCode(o)}.`);
}

/** The document also on the report of the order (its own, or the collaboration order's), on the main asset. */
async function copyToReport(db: D1Database, o: Order, docId: string, actor: string) {
  const rep = await db.prepare("SELECT r.id, (SELECT a.id FROM assets a WHERE a.report_id = r.id ORDER BY a.is_main DESC, a.rowid LIMIT 1) AS asset FROM reports r WHERE r.order_id = ? ORDER BY r.created_at LIMIT 1")
    .bind(o.linked_order_id ?? o.id).first<{ id: string; asset: string | null }>();
  const d = await db.prepare("SELECT filename, content_type, size_bytes, r2_key FROM order_documents WHERE id = ?").bind(docId).first<{ filename: string; content_type: string | null; size_bytes: number; r2_key: string }>();
  const r2 = await bucket();
  if (!rep || !d || !r2) return;
  const obj = await r2.get(d.r2_key);
  if (!obj) return;
  const id = uuid(), safe = d.filename.replace(/[^\w.\-() ăâîșțĂÂÎȘȚ]/g, "_").slice(-120) || "document";
  const key = `reports/${rep.id}/${id}-${safe}`;
  await r2.put(key, await obj.arrayBuffer(), { httpMetadata: { contentType: d.content_type ?? "application/octet-stream" }, customMetadata: { report: rep.id, kind: "source", order: o.id } });
  await db.prepare("INSERT INTO report_documents (id, report_id, kind, filename, content_type, size_bytes, r2_key, uploaded_by, doc_type, asset_id) VALUES (?, ?, 'source', ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, rep.id, safe, d.content_type, d.size_bytes, key, actor, guessDocKind(safe), rep.asset).run();
}
