// Server-only: every account (team, partner users, clients) lives in the `users` table.
import { now, uuid } from "./db";
import { normEmail, validEmail } from "./crypto";
import type { Kind } from "./site";

export type { Kind } from "./site";

export * from "./labels";
import { CLIENT_TYPES, ENGAGEMENTS, INTERNAL_ROLES, SPECIALIZATIONS , DUTIES } from "./labels";

export type User = {
  id: string; kind: Kind; email: string; name: string; phone: string | null; role: string; status: "invited" | "active" | "disabled" | "deleted";
  partner_id: string | null; partner_name: string | null; partner_status: string | null;
  engagement: string | null; anevar_no: string | null; specializations: string | null; coverage: string | null; duties: string | null;
  client_type: string | null; company: string | null; cui: string | null; city: string | null; notes: string | null;
  entity_id?: string | null; created_by: string | null; invited_at: string | null; activated_at: string | null; last_login_at: string | null; created_at: string; updated_at: string;
  last_seen_at?: string | null; avatar_at?: string | null;
  /** CRM only: the permissions of the role (see perms.ts). */
  perms?: string[];
  /** CRM only: what each role in a report's team may do (Setări → Permisiuni). */
  team?: import("./perms").TeamMatrix;
  /** CRM only: the owner or administrator looking at the CRM as this user (read-only). */
  impersonator?: { id: string; name: string; role: string };
};

/** Owners and administrators manage the team and can suspend partner firms. */
export const isAdmin = (u: Pick<User, "kind" | "role">) => u.kind === "internal" && (u.role === "owner" || u.role === "admin");

/** Who may change an account: partner and client accounts any team member; team accounts their owner or an administrator (owners only by owners). */
export const canManageUser = (me: Pick<User, "id" | "kind" | "role">, u: Pick<User, "id" | "kind" | "role">) =>
  u.kind !== "internal" || u.id === me.id || (isAdmin(me) && (u.role !== "owner" || me.role === "owner"));

/**
 * Deletes an account. One with no work behind it goes for good; one that appears in reports, orders or inspections
 * keeps its name there (status "deleted", email freed so it can be used again) and leaves every list and choice.
 */
export async function deleteUser(db: D1Database, u: User) {
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(u.id),
    db.prepare("DELETE FROM auth_codes WHERE lower(email) = lower(?)").bind(u.email),
  ]);
  try {
    await db.prepare("DELETE FROM users WHERE id = ?").bind(u.id).run();
    return { removed: true as const };
  } catch {
    await db.prepare(`UPDATE users SET status = 'deleted', email = ?, avatar_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`)
      .bind(`${u.email}#sters-${u.id.slice(-6)}`, u.id).run();
    return { removed: false as const };
  }
}

/** Account and (for partner users) firm are not blocked. Invited partners and clients still have to accept the invitation. */
export const canSignIn = (u: User) => u.status !== "disabled" && u.status !== "deleted" && (u.kind !== "partner" || u.partner_status === "active");

const SELECT = "SELECT u.*, p.name AS partner_name, p.status AS partner_status FROM users u LEFT JOIN partners p ON p.id = u.partner_id";

export async function getUser(db: D1Database, id: string) {
  return db.prepare(`${SELECT} WHERE u.id = ?`).bind(id).first<User>();
}

export async function findUser(db: D1Database, kind: Kind, email: string) {
  return db.prepare(`${SELECT} WHERE u.kind = ? AND u.email = ?`).bind(kind, normEmail(email)).first<User>();
}

export async function listUsers(db: D1Database) {
  const { results } = await db.prepare(`${SELECT} WHERE u.status <> 'deleted' ORDER BY u.created_at DESC LIMIT 5000`).all<User>();
  return results;
}

export async function partnerPeople(db: D1Database, partnerId: string) {
  const { results } = await db.prepare(`${SELECT} WHERE u.kind = 'partner' AND u.partner_id = ? AND u.status <> 'deleted' ORDER BY u.role = 'owner' DESC, u.created_at`).bind(partnerId).all<User>();
  return results;
}

// ---------- create / edit ----------

export type UserInput = {
  name: string; email: string; phone: string | null; role: string; partner_id: string | null; duties: string | null;
  engagement: string | null; anevar_no: string | null; specializations: string | null; coverage: string | null;
  client_type: string | null; company: string | null; cui: string | null; city: string | null; notes: string | null;
};

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const opt = (v: unknown, max = 200) => str(v, max) || null;
const oneOf = (list: readonly (readonly [string, string])[], v: unknown) => (list.some(([k]) => k === v) ? (v as string) : null);

/**
 * Checks the fields for a kind of account. `currentRole` is the role the account has today: an owner stays owner.
 * Only an owner can make someone else owner (`byOwner`); the first owners come from CRM_OWNER_EMAILS.
 */
export function validateUser(kind: Kind, body: unknown, currentRole?: string, byOwner = false, roleIds?: string[]): { ok: true; value: UserInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const email = str(b.email, 160);
  if (!validEmail(email)) return { ok: false, error: "Adresa de email nu pare validă." };
  const v: UserInput = {
    name: str(b.name, 120), email: normEmail(email), phone: opt(b.phone, 40), role: "", partner_id: null, duties: null,
    engagement: null, anevar_no: null, specializations: null, coverage: null,
    client_type: null, company: null, cui: null, city: opt(b.city, 80), notes: opt(b.notes, 4000),
  };
  if (kind === "internal") {
    if (currentRole === "owner") v.role = "owner";
    else {
      // The roles of Setări → Permisiuni (built-in and added by the owner); "owner" only by an owner.
      const ids = roleIds ?? INTERNAL_ROLES.map(([k]) => k as string);
      const role = typeof b.role === "string" && (ids.includes(b.role) || b.role === "owner") ? b.role : null;
      if (!role || (role === "owner" && !byOwner) || (role === currentRole ? false : role === "inspector")) return { ok: false, error: "Alege rolul persoanei." };
      v.role = role;
    }
    v.engagement = oneOf(ENGAGEMENTS, b.engagement) ?? "employee";
    v.anevar_no = opt(b.anevar_no, 40);
    // The ticks (evaluator, verifier, inspector): who can be what in a report's team; only with the ANEVAR card filled in.
    const duties = Array.isArray(b.duties) ? b.duties : String(b.duties ?? "").split(",");
    v.duties = DUTIES.map(([k]) => k as string).filter((k) => duties.includes(k)).join(",");
    if (v.duties && !v.anevar_no) return { ok: false, error: "Bifele de evaluator, verificator sau inspector se pot pune doar cu nr. de legitimație ANEVAR completat." };
    const specs = Array.isArray(b.specializations) ? b.specializations : String(b.specializations ?? "").split(",");
    v.specializations = SPECIALIZATIONS.map(([k]) => k).filter((k) => specs.includes(k)).join(",") || null;
    v.coverage = opt(b.coverage, 200);
  } else if (kind === "partner") {
    v.partner_id = str(b.partner_id, 60) || null;
    if (!v.partner_id) return { ok: false, error: "Alege firma colaboratorului." };
    v.role = b.role === "owner" ? "owner" : "member";
  } else {
    v.role = "client";
    v.client_type = oneOf(CLIENT_TYPES, b.client_type) ?? "person";
    if (v.client_type === "company") {
      v.company = opt(b.company, 160);
      v.cui = opt(b.cui, 20);
      if (!v.company) return { ok: false, error: "Completează denumirea companiei." };
    }
  }
  if (kind === "client" && v.client_type === "person" && !v.name) return { ok: false, error: "Completează numele clientului." };
  return { ok: true, value: v };
}

const TAKEN: Record<Kind, string> = {
  internal: "Există deja un utilizator intern cu această adresă de email.",
  partner: "Adresa de email este folosită deja de un colaborator.",
  client: "Există deja un client cu această adresă de email.",
};

async function emailTaken(db: D1Database, kind: Kind, email: string, exceptId?: string) {
  const row = await db.prepare("SELECT id FROM users WHERE kind = ? AND email = ?").bind(kind, email).first<{ id: string }>();
  return !!row && row.id !== exceptId;
}

export async function createUser(db: D1Database, kind: Kind, v: UserInput, createdBy: string) {
  if (await emailTaken(db, kind, v.email)) return { ok: false as const, error: TAKEN[kind] };
  const id = uuid();
  await db
    .prepare(
      `INSERT INTO users (id, kind, email, name, phone, role, status, partner_id, engagement, anevar_no, specializations, coverage, duties,
        client_type, company, cui, city, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, 'invited', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, kind, v.email, v.name, v.phone, v.role, v.partner_id, v.engagement, v.anevar_no, v.specializations, v.coverage, v.duties, v.client_type, v.company, v.cui, v.city, v.notes, createdBy)
    .run();
  return { ok: true as const, id };
}

/** Fee shares of a team member (owner only): % as main evaluator / verifier, inspection fee fixed (lei) or %. */
export function validateShares(body: unknown): { ok: true; value: [number | null, number | null, string | null, number | null] } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => { const t = String(v ?? "").trim().replace(",", "."); return t === "" ? null : Number(t); };
  const se = num(b.share_evaluator), sv = num(b.share_verifier), fi = num(b.inspector_fee);
  const kind = b.inspector_fee_kind === "pct" ? "pct" : "fixed";
  for (const [x, l] of [[se, "evaluator principal"], [sv, "verificator"]] as const) if (x != null && (!Number.isFinite(x) || x < 0 || x > 100)) return { ok: false, error: `Cota ca ${l} trebuie să fie între 0 și 100%.` };
  if (fi != null && (!Number.isFinite(fi) || fi < 0 || (kind === "pct" && fi > 100))) return { ok: false, error: kind === "pct" ? "Procentul de inspecție trebuie să fie între 0 și 100." : "Tariful de inspecție nu este valid." };
  return { ok: true, value: [se, sv, fi == null ? null : kind, fi] };
}

export async function saveShares(db: D1Database, id: string, s: [number | null, number | null, string | null, number | null]) {
  await db.prepare("UPDATE users SET share_evaluator = ?, share_verifier = ?, inspector_fee_kind = ?, inspector_fee = ?, updated_at = ? WHERE id = ?").bind(...s, now(), id).run();
}

export async function updateUser(db: D1Database, u: User, v: UserInput) {
  if (await emailTaken(db, u.kind, v.email, u.id)) return { ok: false as const, error: TAKEN[u.kind] };
  await db
    .prepare(
      `UPDATE users SET email = ?, name = ?, phone = ?, role = ?, partner_id = ?, engagement = ?, anevar_no = ?, specializations = ?, coverage = ?, duties = ?,
        client_type = ?, company = ?, cui = ?, city = ?, notes = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(v.email, v.name, v.phone, v.role, v.partner_id, v.engagement, v.anevar_no, v.specializations, v.coverage, v.duties, v.client_type, v.company, v.cui, v.city, v.notes, now(), u.id)
    .run();
  return { ok: true as const };
}

/** Display name: the person, or the company for company clients without a contact name. */
export const displayName = (u: Pick<User, "name" | "email" | "company">) => u.name || u.company || u.email;

/** The share of the profit (owner only, set and seen): a percent, or empty. */
export async function saveProfitShare(db: D1Database, id: string, raw: unknown) {
  const t = String(raw ?? "").trim().replace(",", ".");
  const v = t === "" ? null : Number(t);
  if (v != null && (!Number.isFinite(v) || v < 0 || v > 100)) return { ok: false as const, error: "Cota din profit trebuie să fie între 0 și 100%." };
  await db.prepare("UPDATE users SET profit_share = ?, updated_at = ? WHERE id = ?").bind(v, now(), id).run();
  return { ok: true as const, value: v };
}
