// Server-only: email sign-in (6-digit code or one-time link), invitations and sessions.
import { cookies } from "next/headers";
import { APP, appUrl, type Audience } from "./site";
import { now, uuid } from "./db";
import { normEmail, randomCode, randomToken, safeEqual, sha256 } from "./crypto";
import { esc, layout, sendEmail } from "./email";

const CODE_MINUTES = 15;
const INVITE_DAYS = 7;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_HOUR = 5;

export type StaffUser = { id: string; email: string; name: string; role: "owner" | "admin" | "staff"; status: string };
export type PartnerUser = {
  id: string; partner_id: string; email: string; name: string; phone: string | null; role: "owner" | "member"; status: string;
  partner_name: string; partner_status: string;
};

const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

// ---------- accounts ----------

/** Emails in CRM_OWNER_EMAILS get an owner account on their first sign-in (bootstraps the CRM). */
const ownerEmails = () => (process.env.CRM_OWNER_EMAILS || "").split(",").map(normEmail).filter(Boolean);

export async function findStaff(db: D1Database, email: string): Promise<StaffUser | null> {
  const e = normEmail(email);
  let u = await db.prepare("SELECT id, email, name, role, status FROM staff_users WHERE email = ?").bind(e).first<StaffUser>();
  if (!u && ownerEmails().includes(e)) {
    const id = uuid();
    await db.prepare("INSERT INTO staff_users (id, email, name, role) VALUES (?, ?, '', 'owner')").bind(id, e).run();
    await audit(db, "system", "staff.bootstrap", "staff_user", id, e);
    u = { id, email: e, name: "", role: "owner", status: "active" };
  }
  return u;
}

export async function findPartnerUser(db: D1Database, email: string): Promise<PartnerUser | null> {
  return db
    .prepare(
      `SELECT u.id, u.partner_id, u.email, u.name, u.phone, u.role, u.status, p.name AS partner_name, p.status AS partner_status
       FROM partner_users u JOIN partners p ON p.id = u.partner_id WHERE u.email = ?`,
    )
    .bind(normEmail(email))
    .first<PartnerUser>();
}

export async function audit(db: D1Database, actor: string, action: string, entity?: string, entityId?: string, details?: string) {
  await db
    .prepare("INSERT INTO audit_log (actor, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)")
    .bind(actor, action, entity ?? null, entityId ?? null, details ?? null)
    .run();
}

// ---------- sign-in codes ----------

/**
 * Sends a sign-in code + link if the email belongs to an active account. Always resolves the same way,
 * so the form never reveals whether an address has an account. Invited partners get their invitation again.
 */
export async function requestSignIn(db: D1Database, audience: Audience, rawEmail: string): Promise<void> {
  const email = normEmail(rawEmail);
  const recent = await db
    .prepare("SELECT COUNT(*) AS n FROM auth_codes WHERE email = ? AND audience = ? AND created_at > ?")
    .bind(email, audience, inMinutes(-60))
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= MAX_CODES_PER_HOUR) return;

  if (audience === "staff") {
    const u = await findStaff(db, email);
    if (!u || u.status !== "active") return;
  } else {
    const u = await findPartnerUser(db, email);
    if (!u || u.status === "disabled" || u.partner_status !== "active") return;
    if (u.status === "invited") {
      await sendInvite(db, u.id, "system");
      return;
    }
  }

  const code = randomCode();
  const token = randomToken();
  await db
    .prepare("INSERT INTO auth_codes (id, audience, purpose, email, code_hash, token_hash, expires_at) VALUES (?, ?, 'login', ?, ?, ?, ?)")
    .bind(uuid(), audience, email, await sha256(`${email}:${code}`), await sha256(token), inMinutes(CODE_MINUTES))
    .run();

  const link = await appUrl(audience, `/login/link?token=${encodeURIComponent(token)}`);
  const app = APP[audience].name;
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
export async function verifyCode(db: D1Database, audience: Audience, rawEmail: string, code: string): Promise<string | null> {
  const email = normEmail(rawEmail);
  const row = await db
    .prepare(
      "SELECT id, code_hash, attempts FROM auth_codes WHERE email = ? AND audience = ? AND purpose = 'login' AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1",
    )
    .bind(email, audience, now())
    .first<{ id: string; code_hash: string; attempts: number }>();
  if (!row || row.attempts >= MAX_ATTEMPTS) return null;
  const ok = safeEqual(row.code_hash, await sha256(`${email}:${code.replace(/\D/g, "")}`));
  if (!ok) {
    await db.prepare("UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?").bind(row.id).run();
    return null;
  }
  await db.prepare("UPDATE auth_codes SET used_at = ? WHERE id = ?").bind(now(), row.id).run();
  return userIdFor(db, audience, email);
}

/** Checks a one-time link token (login or invite). Returns the email on success and consumes the token. */
export async function consumeToken(db: D1Database, audience: Audience, purpose: "login" | "invite", token: string, consume = true) {
  const row = await db
    .prepare("SELECT id, email FROM auth_codes WHERE token_hash = ? AND audience = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?")
    .bind(await sha256(token), audience, purpose, now())
    .first<{ id: string; email: string }>();
  if (!row) return null;
  if (consume) await db.prepare("UPDATE auth_codes SET used_at = ? WHERE id = ?").bind(now(), row.id).run();
  return row.email;
}

export async function userIdFor(db: D1Database, audience: Audience, email: string) {
  if (audience === "staff") {
    const u = await findStaff(db, email);
    return u && u.status === "active" ? u.id : null;
  }
  const u = await findPartnerUser(db, email);
  return u && u.status === "active" && u.partner_status === "active" ? u.id : null;
}

// ---------- invitations ----------

export async function sendInvite(db: D1Database, partnerUserId: string, actor: string): Promise<boolean> {
  const u = await db
    .prepare("SELECT u.email, u.name, p.name AS partner_name FROM partner_users u JOIN partners p ON p.id = u.partner_id WHERE u.id = ?")
    .bind(partnerUserId)
    .first<{ email: string; name: string; partner_name: string }>();
  if (!u) return false;
  // A new invitation replaces the previous ones.
  await db.prepare("UPDATE auth_codes SET used_at = ? WHERE email = ? AND audience = 'partner' AND purpose = 'invite' AND used_at IS NULL").bind(now(), u.email).run();
  const token = randomToken();
  await db
    .prepare("INSERT INTO auth_codes (id, audience, purpose, email, token_hash, expires_at) VALUES (?, 'partner', 'invite', ?, ?, ?)")
    .bind(uuid(), u.email, await sha256(token), inMinutes(INVITE_DAYS * 24 * 60))
    .run();
  await db.prepare("UPDATE partner_users SET invited_at = ? WHERE id = ?").bind(now(), partnerUserId).run();
  await audit(db, actor, "partner_user.invite", "partner_user", partnerUserId, u.email);

  const link = await appUrl("partner", `/invitatie?token=${encodeURIComponent(token)}`);
  const hello = u.name ? `Bună, ${u.name.split(" ")[0]}!` : "Bună!";
  return sendEmail({
    to: u.email,
    subject: `Invitație în Portalul colaboratori VALUEFY — ${u.partner_name}`,
    text: `${hello}\nAi fost invitat(ă) în Portalul colaboratori VALUEFY, în contul ${u.partner_name}. De aici vei putea comanda evaluări pentru clienții tăi și urmări fiecare dosar.\nActivează contul: ${link}\nInvitația este valabilă ${INVITE_DAYS} zile.`,
    html: layout({
      eyebrow: "Portal colaboratori",
      title: `${hello} Ai fost invitat(ă) în portalul VALUEFY.`,
      body: `<p style="margin:0 0 10px;font-size:15px;line-height:1.65;color:#4A4A66">Contul tău face parte din <strong style="color:#17173A">${esc(u.partner_name)}</strong>. Din portal vei putea comanda evaluări în numele clienților tăi, urmări fiecare dosar și primi rapoartele.</p>
<p style="margin:0;font-size:15px;line-height:1.65;color:#4A4A66">Activează-ți contul în mai puțin de un minut. Nu ai nevoie de parolă: te autentifici cu un cod primit pe email.</p>`,
      button: { label: "Activează contul →", url: link },
      foot: `Invitația este valabilă ${INVITE_DAYS} zile. Dacă nu te aștepți la acest email, îl poți ignora.`,
    }),
  });
}

// ---------- sessions ----------

export async function createSession(db: D1Database, audience: Audience, userId: string) {
  const token = randomToken();
  const expires = new Date(Date.now() + APP[audience].sessionDays * 864e5);
  await db
    .prepare("INSERT INTO sessions (id, token_hash, audience, user_id, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(uuid(), await sha256(token), audience, userId, expires.toISOString())
    .run();
  const table = audience === "staff" ? "staff_users" : "partner_users";
  await db.prepare(`UPDATE ${table} SET last_login_at = ? WHERE id = ?`).bind(now(), userId).run();
  await audit(db, `${audience === "staff" ? "staff" : "partner"}:${userId}`, "session.create");
  return {
    name: APP[audience].cookie,
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

async function sessionUserId(db: D1Database, audience: Audience) {
  const token = (await cookies()).get(APP[audience].cookie)?.value;
  if (!token) return null;
  const row = await db
    .prepare("SELECT user_id FROM sessions WHERE token_hash = ? AND audience = ? AND expires_at > ?")
    .bind(await sha256(token), audience, now())
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}

export async function currentStaff(db: D1Database): Promise<StaffUser | null> {
  const id = await sessionUserId(db, "staff");
  if (!id) return null;
  const u = await db.prepare("SELECT id, email, name, role, status FROM staff_users WHERE id = ?").bind(id).first<StaffUser>();
  return u && u.status === "active" ? u : null;
}

export async function currentPartner(db: D1Database): Promise<PartnerUser | null> {
  const id = await sessionUserId(db, "partner");
  if (!id) return null;
  const u = await db
    .prepare(
      `SELECT u.id, u.partner_id, u.email, u.name, u.phone, u.role, u.status, p.name AS partner_name, p.status AS partner_status
       FROM partner_users u JOIN partners p ON p.id = u.partner_id WHERE u.id = ?`,
    )
    .bind(id)
    .first<PartnerUser>();
  return u && u.status === "active" && u.partner_status === "active" ? u : null;
}

export async function endSession(db: D1Database, audience: Audience) {
  const token = (await cookies()).get(APP[audience].cookie)?.value;
  if (token) await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

/** Signs out every session of a user (when an account is disabled). */
export async function endAllSessions(db: D1Database, audience: Audience, userId: string) {
  await db.prepare("DELETE FROM sessions WHERE audience = ? AND user_id = ?").bind(audience, userId).run();
}
