// Server-only: Emailuri primite. Every email received on the intake address (or pasted in the CRM) is kept, with its
// attachments; the rules (Emailuri primite → Reguli), in their order, decide what it becomes: a processing task for a
// bank order (opens "Comandă nouă" on the bank's framework contract with the number and the client filled in), a
// plain task, or nothing (ignored). The first rule that matches wins. A task stays open until someone processes it;
// the people the rule names see it on the dashboard and the bell, with a reminder every 2 hours (notifications.ts).
// Also runs in the worker's email handler (worker.ts), outside Next.js: relative imports only, no Next APIs.

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

export type MailRule = {
  id: string; name: string; active: number; sort: number;
  from_has: string | null; subject_has: string | null; body_has: string | null;
  ref_after: string | null; ref_shape: string | null; client_after: string | null; type_after: string | null;
  action: "bank_order" | "task" | "ignore"; bank_id: string | null; task_title: string | null;
  notify_roles: string | null; notify_users: string | null; updated_at: string | null;
};
export type MailIn = { from?: string | null; to?: string | null; subject?: string | null; text?: string | null; html?: string | null };
export type Extracted = { ref: string | null; client: string | null; type: string | null };
export type Attachment = { filename: string; contentType: string | null; content: ArrayBuffer };

export const RULE_ACTIONS: [MailRule["action"], string, string][] = [
  ["bank_order", "Procesare comandă bancă", "task urgent: deschide „Comandă nouă” pe contractul cadru al băncii, cu numărul și clientul completate"],
  ["task", "Task simplu", "un task cu titlul ales, de bifat când e rezolvat"],
  ["ignore", "Ignoră", "emailul e doar păstrat (reclame, newslettere)"],
];
/** The roles a rule can notify (the custom roles of Permisiuni are added by the page). */
export const BASE_ROLES: [string, string][] = [["owner", "Proprietar"], ["admin", "Administrator"], ["operator", "Secretariat"], ["evaluator", "Evaluator"]];
export const REMIND_HOURS = 2;
/** The working hours (Romania's time): the reminders count only this time, and go out only in it. */
export const WORK_FROM = 8, WORK_TO = 18;

/** Hour and minute on the wall clock in Romania. */
function wall(t: number) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Bucharest", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t));
  return Number(p.find((x) => x.type === "hour")?.value ?? 0) * 60 + Number(p.find((x) => x.type === "minute")?.value ?? 0);
}

/** The moment `minutes` of working time (8:00–18:00) have passed since `start` (the nights skipped). */
export function addWorking(start: number, minutes: number) {
  let t = start, left = minutes;
  for (let i = 0; i < 400 && left > 0; i++) {
    const m = wall(t);
    if (m >= WORK_FROM * 60 && m < WORK_TO * 60) {
      const take = Math.min(left, WORK_TO * 60 - m);
      t += take * 60000; left -= take;
    } else t += (((WORK_FROM * 60 - m) % 1440) + 1440) % 1440 * 60000;
  }
  return t;
}

/** The last reminder due for a task open since `created` (every 2 working hours), or null: none yet. */
export function lastReminder(created: string, now = Date.now()) {
  let k = 0, at = 0;
  for (let n = 1; n < 200; n++) {
    const t = addWorking(Date.parse(created), n * REMIND_HOURS * 60);
    if (t > now) break;
    k = n; at = t;
  }
  return k ? { k, at } : null;
}

/** Plain text of an email body (HTML tags dropped, entities decoded, spaces collapsed, lines kept). */
export function plainText(html: string) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t\r]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}
export const bodyOf = (m: MailIn) => (m.text?.trim() ? m.text : plainText(m.html ?? "")).replace(/\r/g, "").slice(0, 20000);

/** Lower case, without diacritics, one char for one char (so positions map back to the original text). */
function fold(s: string) {
  let out = "";
  for (const c of s) {
    const f = c.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    out += f.length === 1 ? f : c.length === 1 ? c.toLowerCase() : f[0] ?? " ";
  }
  return out;
}
const alts = (s: string | null) => (s ?? "").split("|").map((x) => fold(x.trim()).replace(/\s+/g, " ")).filter(Boolean);
const flatFold = (s: string) => fold(s).replace(/\s+/g, " ");
const has = (hay: string, list: string[]) => !list.length || list.some((x) => hay.includes(x));

/** "ALIN BOGDAN" / "stefan chira" → "Alin Bogdan", "Stefan Chira"; a name in mixed case stays as written. */
export const nameCase = (s: string) => {
  const t = s.trim().replace(/\s+/g, " ");
  if (/\p{Ll}/u.test(t) && /\p{Lu}/u.test(t)) return t;
  return t.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
};

/** Where the text after `label` starts in `text` (case and diacritics ignored; a label ending in a letter is a whole word). */
function after(text: string, labels: string[]) {
  const f = fold(text);
  for (const l of labels) {
    const re = new RegExp(`${/^\p{L}/u.test(l) ? "(?<![\\p{L}])" : ""}${l.replace(/[.*+?^${}()[\]\\]/g, "\\$&").replace(/ /g, "\\s+")}${/\p{L}$/u.test(l) ? "(?![\\p{L}])" : ""}`, "u");
    const m = re.exec(f);
    if (m) return m.index + m[0].length;
  }
  return -1;
}

/** The number, the client and the type of request, as the rule reads them. */
export function extract(rule: Pick<MailRule, "ref_after" | "ref_shape" | "client_after" | "type_after">, m: MailIn): Extracted {
  const text = `${m.subject ?? ""}\n${bodyOf(m)}`;
  const shapes = (rule.ref_shape ?? "").split("|").map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]{1,8}$/.test(x));
  const codeRe = shapes.length ? new RegExp(`^(?:${shapes.join("|")})\\d{5,}`, "i") : /^[A-Z]{0,8}\d{5,}[A-Z0-9]*/i;
  let ref: string | null = null;
  const p = after(text, alts(rule.ref_after));
  if (p >= 0) ref = text.slice(p).replace(/^[\s:#\-–nr.]*/i, "").match(codeRe)?.[0] ?? null;
  if (!ref && shapes.length) ref = text.match(new RegExp(`\\b(?:${shapes.join("|")})\\d{5,}\\b`, "i"))?.[0] ?? null;
  const words = (labels: string | null, max: number) => {
    const q = after(text, alts(labels));
    if (q < 0) return null;
    const v = text.slice(q).replace(/^[\s:\-–]+/, "").split(/\n|\.\s|\.$|,\s|;|\s{3,}/)[0].trim().replace(/\.$/, "");
    return v && v.length <= max ? v : null;
  };
  const client = words(rule.client_after, 90);
  return { ref: ref ? ref.toUpperCase() : null, client: client && /\p{L}{2}/u.test(client) ? nameCase(client) : null, type: words(rule.type_after, 80) };
}

/** Does the rule apply to the email (sender, subject and text, each "contains any of")? */
export function matches(rule: MailRule, m: MailIn) {
  const text = flatFold(`${m.subject ?? ""}\n${bodyOf(m)}`);
  return has(flatFold(m.from ?? ""), alts(rule.from_has)) && has(flatFold(m.subject ?? ""), alts(rule.subject_has)) && has(text, alts(rule.body_has))
    && (!!rule.from_has || !!rule.subject_has || !!rule.body_has);
}

export const loadRules = (db: D1Database, all = false) =>
  db.prepare(`SELECT * FROM mail_rules ${all ? "" : "WHERE active = 1"} ORDER BY sort, created_at`).all<MailRule>().then((r) => r.results).catch(() => [] as MailRule[]);

export type Ingested = { status: "task" | "duplicate" | "unmatched" | "ignored" | "incomplete"; emailId: string; taskId: string | null; orderId: string | null; rule: MailRule | null; fields: Extracted | null };

const audit = (db: D1Database, actor: string, action: string, entity: string, entityId: string, details: string) =>
  db.prepare("INSERT INTO audit_log (actor, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)").bind(actor, action, entity, entityId, details).run().catch(() => null);

/** What a rule does with an email (the task it opens, or why not): also used to apply a rule again to an email kept. */
async function apply(db: D1Database, rule: MailRule, m: MailIn, emailId: string, receivedAt: string): Promise<Omit<Ingested, "emailId" | "rule">> {
  if (rule.action === "ignore") return { status: "ignored", taskId: null, orderId: null, fields: null };
  const fields = extract(rule, m);
  const bank = rule.bank_id ? await db.prepare("SELECT id, name, code FROM entities WHERE id = ?").bind(rule.bank_id).first<{ id: string; name: string; code: string | null }>() : null;
  if (rule.action === "bank_order") {
    if (!fields.ref) return { status: "incomplete", taskId: null, orderId: null, fields };
    // the same request: an order already made with it, or a task already opened for it
    const order = await db.prepare("SELECT id FROM orders WHERE upper(bank_ref) = ? AND status <> 'cancelled' AND (? IS NULL OR bank_id = ? OR bank_id IS NULL) LIMIT 1")
      .bind(fields.ref, bank?.id ?? null, bank?.id ?? null).first<{ id: string }>();
    if (order) return { status: "duplicate", taskId: null, orderId: order.id, fields };
    const task = await db.prepare("SELECT id FROM mail_tasks WHERE kind = 'bank_order' AND upper(ref) = ? AND status <> 'dismissed' LIMIT 1").bind(fields.ref).first<{ id: string }>();
    if (task) return { status: "duplicate", taskId: task.id, orderId: null, fields };
  }
  const id = uuid();
  const code = bank?.code || bank?.name.split(/\s+/)[0] || "bancă";
  const title = rule.action === "bank_order"
    ? `Procesează comanda ${code} ${fields.ref}${fields.client ? ` · ${fields.client}` : ""}`
    : (rule.task_title || rule.name).replace(/\{ref\}/g, fields.ref ?? "").replace(/\{client\}/g, fields.client ?? "").replace(/\s+·\s*$|\s{2,}/g, " ").trim().slice(0, 200) || rule.name;
  await db.prepare(`INSERT INTO mail_tasks (id, email_id, rule_id, kind, title, bank_id, ref, client_name, request_type, notify_roles, notify_users, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`)
    .bind(id, emailId, rule.id, rule.action, title, bank?.id ?? null, fields.ref, fields.client, fields.type, rule.notify_roles, rule.notify_users, receivedAt).run();
  await audit(db, "email:rule", "mailtask.create", "mail_task", id, `${rule.name}: ${title}`);
  return { status: "task", taskId: id, orderId: null, fields };
}

/** Keeps a received email (and its attachments) and runs the rules on it. */
export async function ingestEmail(db: D1Database, m: MailIn, via: "email" | "paste", actor: string | null, files?: { bucket: R2Bucket | null; list: Attachment[] }): Promise<Ingested> {
  const emailId = uuid(), t = now();
  const body = bodyOf(m);
  await db.prepare(`INSERT INTO bank_emails (id, received_at, via, mail_from, mail_to, subject, body, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, 'unmatched', ?)`)
    .bind(emailId, t, via, m.from?.slice(0, 300) ?? null, m.to?.slice(0, 300) ?? null, m.subject?.slice(0, 500) ?? null, body, actor).run();
  if (files?.bucket) {
    for (const a of files.list.slice(0, 20)) {
      if (!a.content || a.content.byteLength > 25 * 1024 * 1024) continue;
      const id = uuid(), name = (a.filename || "atasament").replace(/[^\w.\-() ăâîșțĂÂÎȘȚ]/g, "_").slice(-120);
      const key = `inbox/${emailId}/${id}-${name}`;
      try {
        await files.bucket.put(key, a.content, { httpMetadata: { contentType: a.contentType ?? "application/octet-stream" }, customMetadata: { email: emailId } });
        await db.prepare("INSERT INTO mail_attachments (id, email_id, filename, content_type, size_bytes, r2_key) VALUES (?, ?, ?, ?, ?, ?)").bind(id, emailId, name, a.contentType, a.content.byteLength, key).run();
      } catch (e) { console.error("inbox attachment", e); }
    }
  }
  return runRules(db, emailId, m, t);
}

/** The rules on an email kept (at arrival, or again from its page): the first that matches decides. */
export async function runRules(db: D1Database, emailId: string, m: MailIn, receivedAt: string, only?: MailRule): Promise<Ingested> {
  const rules = only ? [only] : await loadRules(db);
  for (const rule of rules) {
    if (!matches(rule, m)) continue;
    const r = await apply(db, rule, m, emailId, receivedAt);
    await db.prepare("UPDATE bank_emails SET status = ?, rule_id = ?, task_id = ?, order_id = ?, bank_ref = ?, client_name = ?, request_type = ?, bank = (SELECT COALESCE(code, name) FROM entities WHERE id = ?) WHERE id = ?")
      .bind(r.status, rule.id, r.taskId, r.orderId, r.fields?.ref ?? null, r.fields?.client ?? null, r.fields?.type ?? null, rule.bank_id, emailId).run();
    return { ...r, emailId, rule };
  }
  return { status: "unmatched", emailId, taskId: null, orderId: null, rule: null, fields: null };
}

/** Closes the open processing tasks of a bank request once its order is made (by the task, or by the number). */
export async function closeTasksForOrder(db: D1Database, orderId: string, ref: string | null, taskId: string | null, actor: string) {
  if (!ref && !taskId) return 0;
  const r = await db.prepare(`UPDATE mail_tasks SET status = 'done', done_at = ?, done_by = ?, order_id = ?, done_note = COALESCE(done_note, 'comanda creată')
      WHERE status = 'open' AND (id = ? OR (kind = 'bank_order' AND ? IS NOT NULL AND upper(ref) = upper(?)))`).bind(now(), actor, orderId, taskId, ref, ref).run().catch(() => null);
  return r?.meta.changes ?? 0;
}

type TaskWho = { kind?: string; bank_id?: string | null; notify_roles: string | null; notify_users: string | null };

/** The banks whose framework contracts (open) a person is accredited on (agreeri): they process those banks' orders. */
export async function accreditedBanks(db: D1Database, userId: string) {
  const { results } = await db.prepare(`SELECT DISTINCT k.client_id AS bank FROM contract_accreditations ca JOIN contracts k ON k.id = ca.contract_id
      WHERE ca.user_id = ? AND k.kind = 'framework' AND k.closed_on IS NULL AND k.client_id IS NOT NULL`).bind(userId).all<{ bank: string }>().catch(() => ({ results: [] as { bank: string }[] }));
  return new Set(results.map((r) => r.bank));
}

/**
 * Who a task is for: the roles and the people its rule names (team accounts, active) and, for a bank order, those
 * accredited on that bank's framework contract (they may process its orders).
 */
export const taskFor = (t: TaskWho, u: { id: string; role: string }, banks?: Set<string>) =>
  (t.notify_roles ?? "").split(",").map((x) => x.trim()).includes(u.role) || (t.notify_users ?? "").split(",").map((x) => x.trim()).includes(u.id)
  || (t.kind === "bank_order" && !!t.bank_id && !!banks?.has(t.bank_id));

export const canSeeTask = async (db: D1Database, t: TaskWho, u: { id: string; role: string }) => taskFor(t, u) || taskFor(t, u, await accreditedBanks(db, u.id));

export type OpenTask = { id: string; kind: string; title: string; ref: string | null; client_name: string | null; created_at: string; opened_at: string | null; opened_name: string | null;
  bank_id: string | null; bank_code: string | null; bank_name: string | null; bank_logo: string | null; notify_roles: string | null; notify_users: string | null; email_id: string | null };

/** The open tasks a person sees (theirs by the rule; an administrator sees them all). */
export async function openTasks(db: D1Database, u: { id: string; role: string }, all = false): Promise<OpenTask[]> {
  const { results } = await db.prepare(`SELECT t.id, t.kind, t.title, t.ref, t.client_name, t.created_at, t.opened_at, t.bank_id, t.notify_roles, t.notify_users, t.email_id,
        e.code AS bank_code, e.name AS bank_name, e.logo_url AS bank_logo, COALESCE(NULLIF(ou.name, ''), ou.email) AS opened_name
      FROM mail_tasks t LEFT JOIN entities e ON e.id = t.bank_id LEFT JOIN users ou ON ou.id = t.opened_by
      WHERE t.status = 'open' ORDER BY t.created_at`).all<OpenTask>().catch(() => ({ results: [] as OpenTask[] }));
  if (all || !results.length) return results;
  const banks = await accreditedBanks(db, u.id);
  return results.filter((t) => taskFor(t, u, banks));
}
