// Server-only: bank orders that arrive by email. The banks' valuation apps (BCR, BRD) send a short notice — request id
// and client name. Each notice received on the intake address (or pasted in the CRM) becomes a bank order waiting to
// be processed; the same request twice is recorded once.
// Also runs in the worker's email handler (worker.ts), outside Next.js: it imports only the email helpers.
import { esc, layout, sendEmail } from "./email";

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const audit = (db: D1Database, actor: string, action: string, entity: string, entityId: string, details: string) =>
  db.prepare("INSERT INTO audit_log (actor, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)").bind(actor, action, entity, entityId, details).run();
/** Team inbox for new orders: ORDERS_NOTIFY_EMAIL, else the CRM owners (same rule as the portal orders). */
const teamInbox = () => (process.env.ORDERS_NOTIFY_EMAIL || process.env.CRM_OWNER_EMAILS || "").split(",").map((x) => x.trim()).filter(Boolean);

export type BankNotice = { bank: string; ref: string; client: string | null; requestType: string | null; link: string | null };

/** Plain text of an email body (HTML tags dropped, entities decoded, spaces collapsed). */
export function plainText(html: string) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t\r]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

/** "ALIN BOGDAN" / "stefan chira" → "Alin Bogdan", "Stefan Chira". */
const nameCase = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());

/** First link that looks like the bank's app (not a logo, not an unsubscribe / social link). */
function bankLink(html: string | null, domain: RegExp) {
  if (!html) return null;
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const u = m[1].replace(/&amp;/g, "&");
    // The bank's domain must be the link's own host (not just anywhere in the URL, e.g. evil.tld/?bcr.ro).
    let host = "";
    try { host = new URL(u).hostname; } catch { continue; }
    if (/^https:\/\//i.test(u) && domain.test(host) && !/unsubscribe|facebook|linkedin|instagram|twitter|youtube/i.test(u)) return u;
  }
  return null;
}

/**
 * Reads a bank notice from an email (sender, subject and body, also when it was forwarded).
 * BCR: "Cerere nouă primită în aplicatia de Valuator: EV…", "Numele clientului: …", "Codul cererii: …".
 * BRD: "Ati fost selectat pentru realizarea urmatoarei evaluari REV…, client …".
 */
export function parseBankEmail(m: { from?: string | null; subject?: string | null; text?: string | null; html?: string | null }): BankNotice | null {
  const text = [m.subject ?? "", m.text?.trim() ? m.text : plainText(m.html ?? "")].join("\n");
  const flat = text.replace(/\s+/g, " ");
  const from = `${m.from ?? ""} ${flat}`.toLowerCase();

  // BCR — "ID de cerere: EV2610070000000045"
  const bcr = flat.match(/ID de cerere:\s*(EV\d{6,})/i) ?? flat.match(/aplica[tţț]ia de Valuator:\s*(EV\d{6,})/i) ?? (from.includes("bcr.ro") ? flat.match(/\b(EV\d{8,})\b/) : null);
  if (bcr) {
    const client = flat.match(/Numele clientului:\s*(.+?)(?=\s+(?:Codul cererii|ID de cerere|V[ăa] rug[ăa]m|Link)\b|$)/i)?.[1] ?? null;
    const type = flat.match(/Codul cererii:\s*(.+?)(?=\s+(?:ID de cerere|Numele clientului|V[ăa] rug[ăa]m|Link)\b|$)/i)?.[1] ?? null;
    return { bank: "BCR", ref: bcr[1].toUpperCase(), client: client ? nameCase(client) : null, requestType: type?.trim() || null, link: bankLink(m.html ?? null, /(^|\.)bcr\.ro$/i) };
  }
  // BRD — "evaluari REV2610070090, client ALIN BOGDAN."
  const brd = flat.match(/evalu[aă]ri(?:i)?\s+(REV\d{6,})\s*,?\s*client\s+(.+?)(?:\.\s|\.$|\s+V[aă] rug[aă]m|$)/i)
    ?? flat.match(/(?:Alocare|Alocat[aă])\s+comand[aă]\s+(REV\d{6,})()/i)
    ?? (from.includes("brd.ro") ? flat.match(/\b(REV\d{6,})\b()/) : null);
  if (brd) {
    const client = brd[2] || flat.match(/client\s+([A-ZĂÂÎȘȚŞŢ][A-ZĂÂÎȘȚŞŢa-zăâîșțşţ.\- ]{2,80}?)(?:\.|,|\s+V[aă] rug[aă]m|$)/)?.[1] || null;
    return { bank: "BRD", ref: brd[1].toUpperCase(), client: client ? nameCase(client) : null, requestType: null, link: bankLink(m.html ?? null, /(^|\.)brd\.ro$/i) };
  }
  return null;
}

export type Ingested = { status: "order" | "duplicate" | "unrecognised"; orderId: string | null; notice: BankNotice | null; emailId: string };

/**
 * Records a received email and, for a recognised bank notice, creates the bank order (under the bank's framework
 * contract when there is one) — or points to the existing order when the same request came before.
 */
export async function ingestBankEmail(db: D1Database, m: { from?: string | null; to?: string | null; subject?: string | null; text?: string | null; html?: string | null },
  via: "email" | "paste", actor: string | null): Promise<Ingested> {
  const notice = parseBankEmail(m);
  const id = uuid();
  const body = (m.text?.trim() ? m.text : plainText(m.html ?? "")).slice(0, 20000);
  let status: Ingested["status"] = notice ? "order" : "unrecognised";
  let orderId: string | null = null;

  if (notice) {
    const bank = await db.prepare("SELECT id, name, code FROM entities WHERE kind IN ('bank', 'ifn') AND upper(code) = ? ORDER BY approved DESC LIMIT 1")
      .bind(notice.bank).first<{ id: string; name: string; code: string | null }>();
    const dup = await db.prepare("SELECT id FROM orders WHERE bank_ref = ? AND source = 'bank' AND (bank_id = ? OR upper(bank) = ?) LIMIT 1")
      .bind(notice.ref, bank?.id ?? null, notice.bank).first<{ id: string }>();
    if (dup) { status = "duplicate"; orderId = dup.id; }
    else {
      const contract = bank
        ? await db.prepare("SELECT id, fee FROM contracts WHERE kind = 'framework' AND client_id = ? ORDER BY signed_on DESC LIMIT 1").bind(bank.id).first<{ id: string; fee: number | null }>()
        : null;
      orderId = uuid();
      const t = now();
      await db.prepare(`INSERT INTO orders (id, source, created_by, purpose, bank, client_name, notes, status, contract_id, bank_id, bank_ref, report_type, fee,
          ordered_on, intake, bank_link, created_at, updated_at)
        VALUES (?, 'bank', ?, 'Credit bancar', ?, ?, ?, 'received', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(orderId, actor, notice.bank, notice.client, m.subject ? `Email: ${m.subject.slice(0, 300)}` : null, contract?.id ?? null, bank?.id ?? null, notice.ref,
          notice.requestType, contract?.fee || null, t.slice(0, 10), via, notice.link, t, t)
        .run();
      await audit(db, actor ? `user:${actor}` : "email:bank", "order.create", "order", orderId, `${notice.bank} ${notice.ref}${via === "email" ? " (din email)" : " (lipit din email)"}`);
    }
  }
  await db.prepare(`INSERT INTO bank_emails (id, via, mail_from, mail_to, subject, body, bank, bank_ref, client_name, request_type, link, status, order_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, via, m.from ?? null, m.to ?? null, m.subject?.slice(0, 500) ?? null, body, notice?.bank ?? null, notice?.ref ?? null, notice?.client ?? null,
      notice?.requestType ?? null, notice?.link ?? null, status, orderId, actor)
    .run();
  return { status, orderId, notice, emailId: id };
}

/** Tells the team inbox that a bank order arrived by email (link to process it). */
export async function notifyBankOrder(n: BankNotice, orderId: string, crmBase: string) {
  const link = `${crmBase}/comenzi/${orderId}`;
  for (const to of teamInbox()) await sendEmail({
    to,
    subject: `Comandă nouă ${n.bank} ${n.ref}${n.client ? ` · ${n.client}` : ""}`,
    text: `${n.bank} a trimis o comandă nouă: ${n.ref}${n.client ? `, client ${n.client}` : ""}${n.requestType ? ` (${n.requestType})` : ""}.\nProceseaz-o în CRM: ${link}`,
    html: layout({
      eyebrow: "CRM VALUEFY · Comenzi bănci", title: `Comandă nouă ${n.bank}`,
      body: `<p style="margin:0;font-size:15px;line-height:1.65;color:#4A4A4A"><strong style="color:#111111">${esc(n.ref)}</strong>${n.client ? ` · client ${esc(n.client)}` : ""}${n.requestType ? ` · ${esc(n.requestType)}` : ""}.<br>Completează datele clientului și ale bunului (din captura aplicației băncii) și creează raportul.</p>`,
      button: { label: "Procesează comanda →", url: link }, foot: "Comanda a fost preluată automat din emailul băncii.",
    }),
  });
}
