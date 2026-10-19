// Server-only: push notifications of the CRM. What is pushed is exactly what the bell shows (notifications.ts): after
// an event, the dispatcher finds, for each person with a device subscribed, the bell items newer than what was
// already pushed to them, and sends them. The VAPID keys are made once and kept in the settings table.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { now, uuid } from "./db";
import { notificationsFor, type Notice } from "./notifications";
import { getConfig } from "./perms-db";
import { permsFor } from "./perms";
import { origin } from "./site";
import { esc, layout, sendEmail } from "./email";
import { generateVapidKeys, sendWebPush, type PushKeys, type Subscription } from "./webpush";

const KEY = "vapid";

/** The firm's VAPID keys (made at the first use). */
export async function vapidKeys(db: D1Database): Promise<PushKeys> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(KEY).first<{ value: string }>().catch(() => null);
  if (row) { try { return JSON.parse(row.value) as PushKeys; } catch { /* made again below */ } }
  const keys = await generateVapidKeys();
  await db.prepare("INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, 'system') ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(KEY, JSON.stringify(keys), now()).run();
  return keys;
}

export const vapidPublicKey = async (db: D1Database) => (await vapidKeys(db)).publicKey;

/** Saves a device's subscription for a user (the same endpoint moves to this user if it was someone else's). */
export async function savePushSubscription(db: D1Database, userId: string, sub: Subscription, ua: string | null) {
  await db.prepare(`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, ua, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua, failures = 0`)
    .bind(uuid(), userId, sub.endpoint, sub.p256dh, sub.auth, ua?.slice(0, 200) ?? null, now()).run();
  // nothing from before the subscription is pushed
  await db.prepare("UPDATE users SET push_sent_at = COALESCE(push_sent_at, ?) WHERE id = ?").bind(now(), userId).run();
}

export const removePushSubscription = (db: D1Database, userId: string, endpoint: string) =>
  db.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?").bind(userId, endpoint).run();

export const hasPushSubscription = async (db: D1Database, userId: string, endpoint: string) =>
  !!(await db.prepare("SELECT 1 AS ok FROM push_subscriptions WHERE user_id = ? AND endpoint = ?").bind(userId, endpoint).first());

type Target = { id: string; name: string | null; email: string; role: string; push_sent_at: string | null; mail_sent_at: string | null; subscribed: number };

/**
 * Pushes the new bell items to every subscribed person, and emails the ones ticked "și pe email" (Setări → Alerte) to
 * everyone. Each person has two marks (push_sent_at, mail_sent_at): only what is newer than them goes out. Safe to call
 * often: nothing new, nothing sent.
 */
export async function dispatchPush(db: D1Database, baseUrl?: string) {
  const { results: users } = await db.prepare(`SELECT u.id, u.name, u.email, u.role, u.push_sent_at, u.mail_sent_at,
        EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.user_id = u.id AND s.failures < 5) AS subscribed
      FROM users u WHERE u.status = 'active' AND u.kind = 'internal'`).all<Target>().catch(() => ({ results: [] as Target[] }));
  if (!users.length) return 0;
  // the CRM's address: of the request, or (email handler, no request) the configured one
  const base = baseUrl ?? (await origin().catch(() => process.env.CRM_URL || "https://crm.valuefy.ro"));
  const [cfg, keys] = await Promise.all([getConfig(db), vapidKeys(db)]);
  let sent = 0;
  for (const u of users) {
    const t = now();
    const viewer = { ...u, perms: permsFor(cfg, u.role), team: cfg.team, name: u.name ?? "", email: u.email };
    const { items } = await notificationsFor(db, viewer, base);
    const fresh = u.subscribed ? items.filter((n) => u.push_sent_at && n.at > u.push_sent_at && n.at <= t) : [];
    if (fresh.length) {
      const { results: subs } = await db.prepare("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ? AND failures < 5").bind(u.id)
        .all<{ id: string; endpoint: string; p256dh: string; auth: string }>();
      for (const s of subs) {
        let okAny = false;
        for (const n of fresh.slice(0, 5)) {
          const r = await sendWebPush(keys, base, s, payloadOf(n)).catch(() => ({ ok: false as const, status: 0, gone: false }));
          if (r.ok) { okAny = true; sent++; }
          else if (r.gone) { await db.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(s.id).run(); break; }
          else { await db.prepare("UPDATE push_subscriptions SET failures = failures + 1 WHERE id = ?").bind(s.id).run(); break; }
        }
        if (okAny) await db.prepare("UPDATE push_subscriptions SET last_ok_at = ?, failures = 0 WHERE id = ?").bind(t, s.id).run();
      }
    }
    // by email: the alerts ticked for it, in one message
    const mail = items.filter((n) => n.email && u.mail_sent_at && n.at > u.mail_sent_at && n.at <= t);
    if (mail.length && u.email) await sendAlertMail(u, mail).catch((e) => console.error("alert mail", e));
    await db.prepare("UPDATE users SET push_sent_at = ?, mail_sent_at = ? WHERE id = ?").bind(t, t, u.id).run();
  }
  return sent;
}

/** One email with the new alerts of a person: each with its text and a link into the CRM. */
async function sendAlertMail(u: Target, list: Notice[]) {
  const first = (u.name ?? "").split(" ")[0];
  const rows = list.slice(0, 20).map((n) => `<p style="margin:0 0 12px"><a href="${esc(n.href)}" style="color:#111111;font-weight:bold">${esc(n.title)}</a>${n.sub ? `<br><span style="color:#6B6B85;font-size:13px">${esc(n.sub)}</span>` : ""}</p>`).join("");
  const subject = list.length === 1 ? `CRM: ${list[0].title}` : `CRM: ${list.length} alerte noi`;
  await sendEmail({
    to: u.email, subject,
    html: layout({ eyebrow: "Alertă CRM", title: list.length === 1 ? list[0].title : `${list.length} alerte noi`, body: `<p style="margin:0 0 16px">${esc(first ? `Bună, ${first}.` : "Bună.")}</p>${rows}`,
      button: { label: "Deschide CRM-ul", url: list[0].href }, foot: "Primești acest email pentru că alerta are bifat „și pe email” în Setări → Alerte." }),
    text: `${list.map((n) => `${n.title}${n.sub ? ` — ${n.sub}` : ""}\n${n.href}`).join("\n\n")}`,
  });
}

const payloadOf = (n: Notice) => ({ id: n.id, title: n.title, body: n.sub, href: n.href, kind: n.kind, at: n.at });

/**
 * The dispatcher after the answer is sent (the request does not wait for the push services), a moment later: it can
 * be called at the start of a request, before the change it will push is written.
 */
export function pushLater(db: D1Database, delayMs = 2500) {
  const job = new Promise((r) => setTimeout(r, delayMs)).then(() => dispatchPush(db)).catch((e) => console.error("push", e));
  try { getCloudflareContext().ctx.waitUntil(job); } catch { /* outside the worker: the promise still runs */ }
}

let lastSweep = 0;
/** The dispatcher at most once a minute per worker: called from the bell's polling, a safety net for events without a hook. */
export function pushSweep(db: D1Database) {
  if (Date.now() - lastSweep < 60000) return;
  lastSweep = Date.now();
  pushLater(db);
}
