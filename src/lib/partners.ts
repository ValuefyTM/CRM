// Server-only: partners (colaboratori) and their portal users.
import { now, uuid } from "./db";
import { normEmail, validEmail } from "./crypto";

export const PARTNER_KINDS = [
  ["broker", "Broker de credite"],
  ["agency", "Agenție imobiliară"],
  ["bank", "Bancă / IFN"],
  ["legal", "Avocat / notar / executor"],
  ["accounting", "Contabil / consultant fiscal"],
  ["developer", "Dezvoltator imobiliar"],
  ["other", "Altul"],
] as const;
export type PartnerKind = (typeof PARTNER_KINDS)[number][0];
export const kindLabel = (k: string) => PARTNER_KINDS.find(([v]) => v === k)?.[1] ?? k;

export type Partner = {
  id: string; name: string; kind: string; cui: string | null; reg_com: string | null; email: string | null; phone: string | null;
  city: string | null; address: string | null; notes: string | null; status: string; created_at: string; updated_at: string;
};
export type PartnerRow = Partner & { users: number; active_users: number; invited_users: number; last_login_at: string | null };
export type PartnerUserRow = {
  id: string; partner_id: string; email: string; name: string; phone: string | null; role: string; status: string;
  invited_at: string | null; activated_at: string | null; last_login_at: string | null; created_at: string;
};

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export type PartnerInput = Pick<Partner, "name" | "kind" | "cui" | "reg_com" | "email" | "phone" | "city" | "address" | "notes">;

export function validatePartner(body: unknown): { ok: true; value: PartnerInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = str(b.name, 160);
  const kind = str(b.kind, 40);
  const email = str(b.email, 160);
  if (!name) return { ok: false, error: "Completează denumirea colaboratorului." };
  if (!PARTNER_KINDS.some(([k]) => k === kind)) return { ok: false, error: "Alege tipul colaboratorului." };
  if (email && !validEmail(email)) return { ok: false, error: "Adresa de email a firmei nu pare validă." };
  return {
    ok: true,
    value: {
      name, kind,
      cui: str(b.cui, 20) || null, reg_com: str(b.reg_com, 40) || null, email: email ? normEmail(email) : null,
      phone: str(b.phone, 40) || null, city: str(b.city, 80) || null, address: str(b.address, 240) || null, notes: str(b.notes, 4000) || null,
    },
  };
}

export function validatePerson(body: unknown): { ok: true; value: { name: string; email: string; phone: string | null; role: "owner" | "member" } } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = str(b.name, 120);
  const email = str(b.email, 160);
  if (!validEmail(email)) return { ok: false, error: "Adresa de email a persoanei de contact nu pare validă." };
  return { ok: true, value: { name, email: normEmail(email), phone: str(b.phone, 40) || null, role: b.role === "owner" ? "owner" : "member" } };
}

export async function listPartners(db: D1Database): Promise<PartnerRow[]> {
  const { results } = await db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM partner_users u WHERE u.partner_id = p.id) AS users,
        (SELECT COUNT(*) FROM partner_users u WHERE u.partner_id = p.id AND u.status = 'active') AS active_users,
        (SELECT COUNT(*) FROM partner_users u WHERE u.partner_id = p.id AND u.status = 'invited') AS invited_users,
        (SELECT MAX(last_login_at) FROM partner_users u WHERE u.partner_id = p.id) AS last_login_at
       FROM partners p ORDER BY p.created_at DESC LIMIT 1000`,
    )
    .all<PartnerRow>();
  return results;
}

export async function getPartner(db: D1Database, id: string) {
  return db.prepare("SELECT * FROM partners WHERE id = ?").bind(id).first<Partner>();
}

export async function partnerUsers(db: D1Database, partnerId: string) {
  const { results } = await db
    .prepare("SELECT * FROM partner_users WHERE partner_id = ? ORDER BY role = 'owner' DESC, created_at")
    .bind(partnerId)
    .all<PartnerUserRow>();
  return results;
}

export async function createPartner(db: D1Database, v: PartnerInput, createdBy: string) {
  const id = uuid();
  await db
    .prepare("INSERT INTO partners (id, name, kind, cui, reg_com, email, phone, city, address, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, v.name, v.kind, v.cui, v.reg_com, v.email, v.phone, v.city, v.address, v.notes, createdBy)
    .run();
  return id;
}

export async function updatePartner(db: D1Database, id: string, v: PartnerInput) {
  await db
    .prepare("UPDATE partners SET name = ?, kind = ?, cui = ?, reg_com = ?, email = ?, phone = ?, city = ?, address = ?, notes = ?, updated_at = ? WHERE id = ?")
    .bind(v.name, v.kind, v.cui, v.reg_com, v.email, v.phone, v.city, v.address, v.notes, now(), id)
    .run();
}

/** Adds a portal user to a partner. Fails with a message when the email is already used. */
export async function addPartnerUser(db: D1Database, partnerId: string, p: { name: string; email: string; phone: string | null; role: string }) {
  const taken = await db.prepare("SELECT partner_id FROM partner_users WHERE email = ?").bind(p.email).first<{ partner_id: string }>();
  if (taken) return { ok: false as const, error: taken.partner_id === partnerId ? "Persoana are deja acces la acest colaborator." : "Adresa de email este folosită deja la alt colaborator." };
  const id = uuid();
  await db
    .prepare("INSERT INTO partner_users (id, partner_id, email, name, phone, role, status) VALUES (?, ?, ?, ?, ?, ?, 'invited')")
    .bind(id, partnerId, p.email, p.name, p.phone, p.role)
    .run();
  return { ok: true as const, id };
}
