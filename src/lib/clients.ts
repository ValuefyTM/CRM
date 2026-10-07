// Server-only: clients (people and companies, table "entities"), their contact people and portal access.
import { now, uuid } from "./db";
import { normEmail, validEmail } from "./crypto";
import { createUser, getUser, type UserInput } from "./users";

export const CLIENT_KINDS: [string, string][] = [
  ["person", "Persoană fizică"], ["company", "Persoană juridică"], ["bank", "Bancă"], ["ifn", "IFN"], ["uat", "Instituție publică (UAT)"],
  ["anaf", "ANAF"], ["broker", "Broker"], ["other", "Altul"],
];
export const kindName = (k: string) => CLIENT_KINDS.find(([v]) => v === k)?.[1] ?? k;

export type Client = {
  id: string; glide_id: string | null; kind: string; name: string; cui: string | null; reg_no: string | null; billing_address: string | null;
  city: string | null; county: string | null; phone: string | null; email: string | null; vat_payer: number | null; caen: string | null;
  code: string | null; notes: string | null; created_at: string; updated_at: string;
};
export type Contact = { id: string; entity_id: string; name: string; role: string | null; phone: string | null; email: string | null; is_primary: number };
export type ClientRow = Client & { reports: number; orders: number; last_report: string | null; portal: string | null };

// ---------- validation ----------

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const opt = (v: unknown, max = 200) => str(v, max) || null;
const digits = (v: string | null) => (v ?? "").replace(/\D/g, "");

export type ClientInput = Pick<Client, "kind" | "name" | "cui" | "reg_no" | "billing_address" | "city" | "county" | "phone" | "email" | "vat_payer" | "caen" | "notes">;
export type ContactInput = { name: string; role: string | null; phone: string | null; email: string | null };

/** Required for everyone: name, phone and email. Companies may add a CUI and contact people. */
export function validateClient(body: unknown): { ok: true; value: ClientInput; contacts: ContactInput[] } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const kind = CLIENT_KINDS.some(([k]) => k === b.kind) ? (b.kind as string) : "person";
  const company = kind !== "person";
  const name = str(b.name, 160);
  const phone = str(b.phone, 40);
  const email = str(b.email, 160);
  if (!name) return { ok: false, error: company ? "Completează denumirea firmei." : "Completează numele și prenumele." };
  if (digits(phone).length < 9) return { ok: false, error: "Completează un număr de telefon valid (minimum 9 cifre)." };
  if (!validEmail(email)) return { ok: false, error: "Completează o adresă de email validă." };
  const cuiRaw = str(b.cui, 20).toUpperCase().replace(/\s/g, "");
  if (company && cuiRaw && !/^(RO)?\d{2,10}$/.test(cuiRaw)) return { ok: false, error: "CUI-ul nu pare valid (doar cifre, opțional cu RO în față)." };
  const contacts: ContactInput[] = [];
  if (company && Array.isArray(b.contacts)) {
    for (const c of b.contacts.slice(0, 20) as Record<string, unknown>[]) {
      const n = str(c?.name, 120), r = opt(c?.role, 80), p = opt(c?.phone, 40), e = str(c?.email, 160);
      if (!n && !p && !e) continue;
      if (!n) return { ok: false, error: "Completează numele persoanei de contact." };
      if (e && !validEmail(e)) return { ok: false, error: `Emailul persoanei de contact ${n} nu pare valid.` };
      contacts.push({ name: n, role: r, phone: p, email: e ? normEmail(e) : null });
    }
  }
  return {
    ok: true,
    contacts,
    value: {
      kind, name, phone, email: normEmail(email), cui: company ? cuiRaw || null : null, reg_no: company ? opt(b.reg_no, 40) : null,
      billing_address: opt(b.billing_address, 240), city: opt(b.city, 80), county: opt(b.county, 60),
      vat_payer: company ? (b.vat_payer === true ? 1 : b.vat_payer === false ? 0 : null) : null, caen: company ? opt(b.caen, 10) : null,
      notes: opt(b.notes, 4000),
    },
  };
}

/** An existing client with the same CUI (companies) or the same email / phone. */
export async function findDuplicate(db: D1Database, v: ClientInput, exceptId?: string) {
  const cui = v.cui?.replace(/^RO/, "") ?? null;
  const phone = digits(v.phone).slice(-9);
  const row = await db
    .prepare(
      `SELECT id, name FROM entities WHERE id <> ? AND (
         (? IS NOT NULL AND replace(upper(cui), 'RO', '') = ?) OR lower(email) = ? OR
         (length(?) = 9 AND substr(replace(replace(replace(phone, ' ', ''), '+40', '0'), '-', ''), -9) = ? AND kind = ?)
       ) LIMIT 1`,
    )
    .bind(exceptId ?? "", cui, cui, v.email, phone, phone, v.kind)
    .first<{ id: string; name: string }>();
  return row;
}

// ---------- read ----------

export type ClientFilters = { q?: string; kind?: string; portal?: string; page?: number };
export const CLIENT_PAGE = 50;

export async function listClients(db: D1Database, f: ClientFilters) {
  const w = ["e.kind <> 'valuation_firm'"];
  const p: (string | number)[] = [];
  if (f.kind && CLIENT_KINDS.some(([k]) => k === f.kind)) { w.push("e.kind = ?"); p.push(f.kind); }
  if (f.portal === "yes") w.push("EXISTS (SELECT 1 FROM users u WHERE u.entity_id = e.id AND u.kind = 'client')");
  if (f.portal === "no") w.push("NOT EXISTS (SELECT 1 FROM users u WHERE u.entity_id = e.id AND u.kind = 'client')");
  const q = f.q?.trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    w.push("(e.name LIKE ? OR e.cui LIKE ? OR e.email LIKE ? OR e.phone LIKE ? OR e.city LIKE ? OR EXISTS (SELECT 1 FROM entity_contacts c WHERE c.entity_id = e.id AND (c.name LIKE ? OR c.email LIKE ?)))");
    p.push(like, like, like, like, like, like, like);
  }
  const where = `WHERE ${w.join(" AND ")}`;
  const [rows, total] = await Promise.all([
    db.prepare(
      `SELECT e.*, (SELECT COUNT(*) FROM reports r WHERE r.client_id = e.id) AS reports, (SELECT COUNT(*) FROM orders o WHERE o.client_id = e.id) AS orders,
         (SELECT MAX(r.report_date) FROM reports r WHERE r.client_id = e.id) AS last_report,
         (SELECT u.status FROM users u WHERE u.entity_id = e.id AND u.kind = 'client' ORDER BY u.status = 'active' DESC LIMIT 1) AS portal
       FROM entities e ${where} ORDER BY e.created_at DESC LIMIT ${CLIENT_PAGE} OFFSET ?`,
    ).bind(...p, ((f.page ?? 1) - 1) * CLIENT_PAGE).all<ClientRow>(),
    db.prepare(`SELECT COUNT(*) AS n FROM entities e ${where}`).bind(...p).first<{ n: number }>(),
  ]);
  return { rows: rows.results, total: total?.n ?? 0 };
}

export async function clientCounts(db: D1Database) {
  const { results } = await db.prepare("SELECT kind, COUNT(*) AS n FROM entities WHERE kind <> 'valuation_firm' GROUP BY kind").all<{ kind: string; n: number }>();
  return Object.fromEntries(results.map((r) => [r.kind, r.n])) as Record<string, number>;
}

export async function getClient(db: D1Database, id: string) {
  return db.prepare("SELECT * FROM entities WHERE id = ? AND kind <> 'valuation_firm'").bind(id).first<Client>();
}

export async function clientContacts(db: D1Database, id: string) {
  return (await db.prepare("SELECT * FROM entity_contacts WHERE entity_id = ? ORDER BY is_primary DESC, created_at").bind(id).all<Contact>()).results;
}

export async function clientPortalUsers(db: D1Database, id: string) {
  return (await db.prepare("SELECT id, name, email, status, invited_at, last_login_at FROM users WHERE entity_id = ? AND kind = 'client' ORDER BY created_at").bind(id)
    .all<{ id: string; name: string; email: string; status: string; invited_at: string | null; last_login_at: string | null }>()).results;
}

// ---------- write ----------

export async function createClient(db: D1Database, v: ClientInput, contacts: ContactInput[], actor: string) {
  const id = `cl-${uuid()}`;
  await db
    .prepare(
      `INSERT INTO entities (id, kind, name, cui, reg_no, billing_address, city, county, phone, email, vat_payer, caen, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, v.kind, v.name, v.cui, v.reg_no, v.billing_address, v.city, v.county, v.phone, v.email, v.vat_payer, v.caen, v.notes, actor)
    .run();
  for (const [i, c] of contacts.entries()) await addContact(db, id, c, i === 0);
  return id;
}

export async function updateClient(db: D1Database, id: string, v: ClientInput) {
  await db
    .prepare(
      `UPDATE entities SET kind = ?, name = ?, cui = ?, reg_no = ?, billing_address = ?, city = ?, county = ?, phone = ?, email = ?, vat_payer = ?, caen = ?,
         notes = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(v.kind, v.name, v.cui, v.reg_no, v.billing_address, v.city, v.county, v.phone, v.email, v.vat_payer, v.caen, v.notes, now(), id)
    .run();
}

export async function addContact(db: D1Database, entityId: string, c: ContactInput, primary = false) {
  const id = `ct-${uuid()}`;
  if (primary) await db.prepare("UPDATE entity_contacts SET is_primary = 0 WHERE entity_id = ?").bind(entityId).run();
  await db.prepare("INSERT INTO entity_contacts (id, entity_id, name, role, phone, email, is_primary) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, entityId, c.name, c.role, c.phone, c.email, primary ? 1 : 0).run();
  return id;
}

/**
 * Gives a client access to the client portal: a client account for the person (or a company's contact),
 * linked to the client. Reuses an existing client account with the same email.
 */
export async function enablePortal(db: D1Database, client: Client, contact: Contact | null, actor: string) {
  const email = normEmail(contact?.email ?? client.email ?? "");
  if (!validEmail(email)) return { ok: false as const, error: contact ? "Persoana de contact nu are o adresă de email." : "Clientul nu are o adresă de email." };
  const existing = await db.prepare("SELECT id, entity_id FROM users WHERE kind = 'client' AND email = ?").bind(email).first<{ id: string; entity_id: string | null }>();
  if (existing) {
    if (existing.entity_id && existing.entity_id !== client.id) return { ok: false as const, error: "Adresa de email are deja cont de client pentru alt client." };
    await db.prepare("UPDATE users SET entity_id = ?, updated_at = ? WHERE id = ?").bind(client.id, now(), existing.id).run();
    return { ok: true as const, userId: existing.id, created: false };
  }
  const company = client.kind !== "person";
  const input: UserInput = {
    name: contact?.name ?? (company ? "" : client.name), email, phone: contact?.phone ?? client.phone, role: "client", partner_id: null, duties: null,
    engagement: null, anevar_no: null, specializations: null, coverage: null,
    client_type: company ? "company" : "person", company: company ? client.name : null, cui: client.cui, city: client.city, notes: null,
  };
  const r = await createUser(db, "client", input, actor);
  if (!r.ok) return { ok: false as const, error: r.error };
  await db.prepare("UPDATE users SET entity_id = ? WHERE id = ?").bind(client.id, r.id).run();
  return { ok: true as const, userId: r.id, created: true };
}

export { getUser };
