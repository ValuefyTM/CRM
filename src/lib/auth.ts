// Server-only: email sign-in (6-digit code or one-time link), invitations and sessions.
import { cookies } from "next/headers";
import { APP, APP_NAME, appOf, appUrl, INSP_ROLES, type App, type Kind } from "./site";
import { now, uuid } from "./db";
import { normEmail, randomCode, randomToken, safeEqual, sha256 } from "./crypto";
import { esc, layout, sendEmail } from "./email";
import { canSignIn, dutiesOf, findUser, getUser, type User } from "./users";

const CODE_MINUTES = 15;
const INVITE_DAYS = 7;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_HOUR = 5;

const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
const kindsSql = (app: App) => APP[app].kinds.map((k) => `'${k}'`).join(", ");

// ---------- accounts ----------

/** Emails in CRM_OWNER_EMAILS get an owner account on their first sign-in (bootstraps the CRM). */
const ownerEmails = () => (process.env.CRM_OWNER_EMAILS || "").split(",").map(normEmail).filter(Boolean);

export async function accountFor(db: D1Database, kind: Kind, email: string): Promise<User | null> {
  const e = normEmail(email);
  const u = await findUser(db, kind, e);
  if (u || kind !== "internal" || !ownerEmails().includes(e)) return u;
  const id = uuid();
  await db.prepare("INSERT INTO users (id, kind, email, role, status, engagement) VALUES (?, 'internal', ?, 'owner', 'active', 'employee')").bind(id, e).run();
  await audit(db, "system", "user.bootstrap", "user", id, e);
  return getUser(db, id);
}

export async function audit(db: D1Database, actor: string, action: string, entity?: string, entityId?: string, details?: string) {
  await db
    .prepare("INSERT INTO audit_log (actor, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)")
    .bind(actor, action, entity ?? null, entityId ?? null, details ?? null)
    .run();
}

/**
 * The inspections app is for inspectors and evaluators, and for any team member who was given an inspection
 * (e.g. an administrator who is the main evaluator of a report). Inspectors use only that app, not the CRM.
 */
export async function allowedIn(db: D1Database, app: App, u: User) {
  if (app === "crm") return u.role !== "inspector";
  if (app !== "insp") return true;
  if (u.kind !== "internal") return false;
  if (INSP_ROLES.includes(u.role) || dutiesOf(u).some((d) => INSP_ROLES.includes(d))) return true;
  const given = await db.prepare("SELECT 1 AS ok FROM inspections WHERE inspector_id = ? AND glide_id IS NULL AND status <> 'cancelled' LIMIT 1").bind(u.id).first<{ ok: number }>();
  return !!given;
}

const appName = (app: App, kind: Kind) => (app === "insp" ? "Inspecții VALUEFY" : APP_NAME[kind]);

/** Team members sign in straight away; partners and clients first accept the invitation (name, phone, terms). */
const mustAcceptInvite = (u: User) => u.status === "invited" && u.kind !== "internal";

// ---------- sign-in codes ----------

/**
 * Sends a sign-in code + link if the email belongs to an account that may sign in. Always resolves the same way,
 * so the form never reveals whether an address has an account. Invited partners and clients get their invitation again.
 */
export async function requestSignIn(db: D1Database, kind: Kind, rawEmail: string, toApp: App = appOf(kind)): Promise<void> {
  const email = normEmail(rawEmail);
  const recent = await db
    .prepare("SELECT COUNT(*) AS n FROM auth_codes WHERE email = ? AND audience = ? AND created_at > ?")
    .bind(email, kind, inMinutes(-60))
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= MAX_CODES_PER_HOUR) return;

  const u = await accountFor(db, kind, email);
  if (!u || !canSignIn(u) || !(await allowedIn(db, toApp, u))) return;
  if (mustAcceptInvite(u)) {
    await sendInvite(db, u.id, "system");
    return;
  }

  const code = randomCode();
  const token = randomToken();
  await db
    .prepare("INSERT INTO auth_codes (id, audience, purpose, email, code_hash, token_hash, expires_at) VALUES (?, ?, 'login', ?, ?, ?, ?)")
    .bind(uuid(), kind, email, await sha256(`${email}:${code}`), await sha256(token), inMinutes(CODE_MINUTES))
    .run();

  const link = await appUrl(toApp, `/login/link?token=${encodeURIComponent(token)}`);
  const app = appName(toApp, kind);
  await sendEmail({
    to: email,
    subject: `Codul tău de autentificare: ${code}`,
    text: `Codul tău de autentificare în ${app} este ${code}.\nSau deschide linkul: ${link}\nCodul și linkul sunt valabile ${CODE_MINUTES} minute. Dacă nu ai cerut tu autentificarea, ignoră acest email.`,
    html: layout({
      eyebrow: app,
      title: "Codul tău de autentificare",
      body: `<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#4A4A66">Introdu codul de mai jos în pagina de autentificare:</p>
<p style="margin:16px 0;font-size:34px;font-weight:bold;letter-spacing:8px;font-family:ui-monospace,Menlo,monospace">${code}</p>
<p style="margin:0;font-size:14px;line-height:1.6;color:#4A4A66">Sau intră direct apăsând butonul.</p>`,
      button: { label: "Intră în cont →", url: link },
      foot: `Codul și linkul sunt valabile ${CODE_MINUTES} minute și pot fi folosite o singură dată. Dacă nu ai cerut tu autentificarea, ignoră acest email.`,
    }),
  });
}

/** Checks a 6-digit code. Returns the user id on success. */
export async function verifyCode(db: D1Database, kind: Kind, rawEmail: string, code: string, app: App = appOf(kind)): Promise<string | null> {
  const email = normEmail(rawEmail);
  const row = await db
    .prepare(
      "SELECT id, code_hash, attempts FROM auth_codes WHERE email = ? AND audience = ? AND purpose = 'login' AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1",
    )
    .bind(email, kind, now())
    .first<{ id: string; code_hash: string; attempts: number }>();
  if (!row || row.attempts >= MAX_ATTEMPTS) return null;
  const ok = safeEqual(row.code_hash, await sha256(`${email}:${code.replace(/\D/g, "")}`));
  if (!ok) {
    await db.prepare("UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?").bind(row.id).run();
    return null;
  }
  await db.prepare("UPDATE auth_codes SET used_at = ? WHERE id = ?").bind(now(), row.id).run();
  return signInUserId(db, kind, email, app);
}

/** Checks a one-time link token (login or invite) of an app. Returns the account it belongs to and, by default, uses it up. */
export async function consumeToken(db: D1Database, app: App, purpose: "login" | "invite", token: string, consume = true) {
  const row = await db
    .prepare(`SELECT id, email, audience FROM auth_codes WHERE token_hash = ? AND audience IN (${kindsSql(app)}) AND purpose = ? AND used_at IS NULL AND expires_at > ?`)
    .bind(await sha256(token), purpose, now())
    .first<{ id: string; email: string; audience: Kind }>();
  if (!row) return null;
  if (consume) await db.prepare("UPDATE auth_codes SET used_at = ? WHERE id = ?").bind(now(), row.id).run();
  return { email: row.email, kind: row.audience };
}

export async function signInUserId(db: D1Database, kind: Kind, email: string, app: App = appOf(kind)) {
  const u = await accountFor(db, kind, email);
  return u && canSignIn(u) && !mustAcceptInvite(u) && (await allowedIn(db, app, u)) ? u.id : null;
}

// ---------- invitations ----------

/**
 * Partners and clients get a 7-day link to activate their account. Team members get an email
 * telling them they can sign in to the CRM (they need no activation).
 */
export async function sendInvite(db: D1Database, userId: string, actor: string): Promise<boolean> {
  const u = await getUser(db, userId);
  if (!u) return false;
  const hello = u.name ? `Bună, ${u.name.split(" ")[0]}!` : "Bună!";
  await db.prepare("UPDATE users SET invited_at = ? WHERE id = ?").bind(now(), u.id).run();
  await audit(db, actor, "user.invite", "user", u.id, u.email);

  if (u.kind === "internal" && u.role === "inspector") {
    const link = await appUrl("insp", "/login");
    return sendEmail({
      to: u.email,
      subject: "Ai acces în aplicația de inspecții VALUEFY",
      text: `${hello}\nAi primit acces în aplicația de inspecții VALUEFY. Deschide-o pe telefon și intră cu adresa ${u.email}: ${link}\nNu ai nevoie de parolă: primești un cod pe email la fiecare autentificare. Din browser poți alege „Adaugă pe ecranul principal”, ca să o ai ca aplicație.`,
      html: layout({
        eyebrow: "Inspecții VALUEFY",
        title: `${hello} Ai primit acces în aplicația de inspecții.`,
        body: `<p style="margin:0 0 10px;font-size:15px;line-height:1.65;color:#4A4A66">Deschide linkul de pe telefon și intră cu adresa <strong style="color:#17173A">${esc(u.email)}</strong>. Nu ai nevoie de parolă: la fiecare autentificare primești un cod pe email.</p>
<p style="margin:0;font-size:15px;line-height:1.65;color:#4A4A66">Din meniul browserului alege „Adaugă pe ecranul principal”, ca să o ai ca aplicație și să poți lucra și fără semnal.</p>`,
        button: { label: "Deschide aplicația →", url: link },
        foot: "Dacă nu te aștepți la acest email, îl poți ignora.",
      }),
    });
  }

  if (u.kind === "internal") {
    const link = await appUrl("crm", "/login");
    return sendEmail({
      to: u.email,
      subject: "Ai acces în CRM-ul VALUEFY",
      text: `${hello}\nAi primit acces în CRM-ul VALUEFY. Intră cu adresa ${u.email}: ${link}\nNu ai nevoie de parolă: primești un cod pe email la fiecare autentificare.`,
      html: layout({
        eyebrow: "VALUEFY CRM",
        title: `${hello} Ai primit acces în CRM-ul VALUEFY.`,
        body: `<p style="margin:0;font-size:15px;line-height:1.65;color:#4A4A66">Intră cu adresa <strong style="color:#17173A">${esc(u.email)}</strong>. Nu ai nevoie de parolă: la fiecare autentificare primești un cod pe email.</p>`,
        button: { label: "Intră în CRM →", url: link },
        foot: "Dacă nu te aștepți la acest email, îl poți ignora.",
      }),
    });
  }

  // A new invitation replaces the previous ones.
  await db.prepare("UPDATE auth_codes SET used_at = ? WHERE email = ? AND audience = ? AND purpose = 'invite' AND used_at IS NULL").bind(now(), u.email, u.kind).run();
  const token = randomToken();
  await db
    .prepare("INSERT INTO auth_codes (id, audience, purpose, email, token_hash, expires_at) VALUES (?, ?, 'invite', ?, ?, ?)")
    .bind(uuid(), u.kind, u.email, await sha256(token), inMinutes(INVITE_DAYS * 24 * 60))
    .run();
  const link = await appUrl("portal", `/invitatie?token=${encodeURIComponent(token)}`);
  const partner = u.kind === "partner";
  const subject = partner ? `Invitație în Portalul colaboratori VALUEFY — ${u.partner_name}` : "Contul tău în Portalul client VALUEFY";
  const intro = partner
    ? `Contul tău face parte din <strong style="color:#17173A">${esc(u.partner_name)}</strong>. Din portal vei putea comanda evaluări în numele clienților tăi, urmări fiecare dosar și primi rapoartele.`
    : "Din portal vei putea urmări evaluările comandate la VALUEFY, încărca documentele necesare și descărca rapoartele.";
  return sendEmail({
    to: u.email,
    subject,
    text: `${hello}\n${partner ? `Ai fost invitat(ă) în Portalul colaboratori VALUEFY, în contul ${u.partner_name}.` : "Ți-am deschis un cont în Portalul client VALUEFY."}\nActivează contul: ${link}\nInvitația este valabilă ${INVITE_DAYS} zile.`,
    html: layout({
      eyebrow: partner ? "Portal colaboratori" : "Portal client",
      title: partner ? `${hello} Ai fost invitat(ă) în portalul VALUEFY.` : `${hello} Contul tău VALUEFY te așteaptă.`,
      body: `<p style="margin:0 0 10px;font-size:15px;line-height:1.65;color:#4A4A66">${intro}</p>
<p style="margin:0;font-size:15px;line-height:1.65;color:#4A4A66">Activează-ți contul în mai puțin de un minut. Nu ai nevoie de parolă: te autentifici cu un cod primit pe email.</p>`,
      button: { label: "Activează contul →", url: link },
      foot: `Invitația este valabilă ${INVITE_DAYS} zile. Dacă nu te aștepți la acest email, îl poți ignora.`,
    }),
  });
}

// ---------- sessions ----------

export async function createSession(db: D1Database, kind: Kind, userId: string, toApp: App = appOf(kind)) {
  const app = APP[toApp];
  const token = randomToken();
  const expires = new Date(Date.now() + app.sessionDays * 864e5);
  await db
    .prepare("INSERT INTO sessions (id, token_hash, audience, user_id, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(uuid(), await sha256(token), kind, userId, expires.toISOString())
    .run();
  // A team member's first sign-in activates the account.
  await db
    .prepare("UPDATE users SET last_login_at = ?1, status = CASE WHEN status = 'invited' THEN 'active' ELSE status END, activated_at = COALESCE(activated_at, ?1) WHERE id = ?2")
    .bind(now(), userId)
    .run();
  await audit(db, `user:${userId}`, "session.create", "user", userId);
  return { name: app.cookie, value: token, httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", expires };
}

/** The signed-in, active user of an app, or null. */
export async function currentUser(db: D1Database, app: App): Promise<User | null> {
  const token = (await cookies()).get(APP[app].cookie)?.value;
  if (!token) return null;
  const row = await db
    .prepare(`SELECT user_id FROM sessions WHERE token_hash = ? AND audience IN (${kindsSql(app)}) AND expires_at > ?`)
    .bind(await sha256(token), now())
    .first<{ user_id: string }>();
  const u = row ? await getUser(db, row.user_id) : null;
  return u && u.status === "active" && canSignIn(u) && (await allowedIn(db, app, u)) ? u : null;
}

export async function endSession(db: D1Database, app: App) {
  const token = (await cookies()).get(APP[app].cookie)?.value;
  if (token) await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

/** Signs out every session of a user (when an account is disabled). */
export async function endAllSessions(db: D1Database, userId: string) {
  await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
}
