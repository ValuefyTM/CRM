// Server-only: direct work of VALUEFY (a client of the firm, classic contract). It is registered as an order of source
// 'direct' with its assets, then either opens its report at once — the client has accepted: the classic contract is
// generated with the next number — or waits for the offer to be accepted (the same path as portal orders).
import { now, uuid } from "./db";
import { audit } from "./auth";
import { createClient, findDuplicate, type ClientInput } from "./clients";
import { openDossier } from "./dossier";
import { propertyType } from "./process-order";
import type { AssetInput } from "./asset-labels";
import type { ReportSpec } from "./dossier";

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const id_ = (v: unknown) => (typeof v === "string" && /^[\w-]{1,80}$/.test(v) ? v : null);
const amount = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n < 1e7 ? Math.round(n * 100) / 100 : null;
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Party = { id: string; name: string; phone: string | null; email: string | null; reused: boolean };

/** The client: one picked from the CRM, or a new one (an existing client with the same CUI, email or phone is used instead). */
async function clientOf(db: D1Database, actor: string, b: Record<string, unknown>): Promise<{ ok: true; party: Party } | { ok: false; error: string }> {
  const picked = id_(b.client_id);
  if (picked) {
    const e = await db.prepare("SELECT id, name, phone, email FROM entities WHERE id = ? AND kind <> 'valuation_firm'").bind(picked)
      .first<{ id: string; name: string; phone: string | null; email: string | null }>();
    if (!e) return { ok: false, error: "Clientul ales nu mai există." };
    return { ok: true, party: { ...e, reused: true } };
  }
  const c = (b.client ?? {}) as Record<string, unknown>;
  const kind = c.kind === "company" ? "company" : "person";
  const name = str(c.name, 160);
  if (!name) return { ok: false, error: "Alege clientul sau completează numele clientului nou." };
  const email = str(c.email, 160).toLowerCase() || null;
  if (email && !EMAIL.test(email)) return { ok: false, error: "Emailul clientului nu pare corect." };
  const phone = str(c.phone, 40) || null;
  if (!phone && !email) return { ok: false, error: "Completează telefonul sau emailul clientului." };
  const cui = kind === "company" ? str(c.cui, 20).toUpperCase().replace(/\s/g, "") || null : null;
  const v: ClientInput = { kind, name, cui, reg_no: null, billing_address: str(c.address, 300) || null, city: str(c.city, 80) || null, county: null, phone, email,
    vat_payer: null, caen: null, notes: null };
  const dup = await findDuplicate(db, v);
  if (dup) {
    const e = (await db.prepare("SELECT id, kind, name, cui, phone, email FROM entities WHERE id = ?").bind(dup.id)
      .first<{ id: string; kind: string; name: string; cui: string | null; phone: string | null; email: string | null }>())!;
    // The same client only when the CUI matches or the name is the same: a shared email / phone (an administrator, a
    // family member) must not put the contract on someone else.
    const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const sameCui = !!cui && !!e.cui && e.cui.replace(/^RO/i, "") === cui.replace(/^RO/i, "");
    if (!sameCui && norm(e.name) !== norm(name))
      return { ok: false, error: `Emailul / telefonul aparține deja clientului „${e.name}”. Alege-l din „Client existent” sau folosește alte date de contact.` };
    return { ok: true, party: { ...e, phone: e.phone ?? phone, email: e.email ?? email, reused: true } };
  }
  const id = await createClient(db, v, [], actor);
  await audit(db, `user:${actor}`, "client.create", "client", id, `${name} (lucrare directă)`);
  return { ok: true, party: { id, name, phone, email, reused: false } };
}

/**
 * Registers direct work. `mode`: 'accepted' opens the report and its classic contract now; 'offer' keeps it as an order
 * waiting for the offer. `contract_id`: another report under an existing classic contract (no new contract).
 */
export async function createDirectWork(db: D1Database, actor: { id: string; name: string }, b: Record<string, unknown>, assets: AssetInput[]) {
  const mode = b.mode === "offer" ? "offer" : "accepted";
  const evaluator = id_(b.evaluator_id);
  if (mode === "accepted" && !evaluator) return { ok: false as const, error: "Alege evaluatorul principal." };
  let contractId: string | null = null;
  if (id_(b.contract_id)) {
    const k = await db.prepare("SELECT id, client_id, signed_at FROM contracts WHERE id = ? AND kind = 'classic'").bind(id_(b.contract_id))
      .first<{ id: string; client_id: string | null; signed_at: string | null }>();
    if (!k) return { ok: false as const, error: "Contractul ales nu există." };
    if (k.signed_at) return { ok: false as const, error: "Contractul este semnat de client: un raport nou se adaugă printr-un act adițional sau pe un contract nou." };
    if (k.client_id && id_(b.client_id) && id_(b.client_id) !== k.client_id) return { ok: false as const, error: "Clientul nu este cel al contractului." };
    contractId = k.id;
    if (k.client_id) b = { ...b, client_id: k.client_id };
  }
  const who = await clientOf(db, actor.id, b);
  if (!who.ok) return who;
  const c = who.party;
  if (mode === "offer" && !c.email) return { ok: false as const, error: "Pentru ofertă e nevoie de emailul clientului." };

  // Several reports under the contract: each with its purpose, type, fee, term and assets (indexes into `assets`), plus
  // properties already valued in this contract (`shared`, inspected in their first report).
  const specs = parseSpecs(b.reports, assets.length);
  if (!specs.ok) return specs;
  // Properties "already in the contract" must really be in this contract's reports.
  const shared = [...new Set(specs.list.flatMap((x) => x.shared ?? []))];
  if (shared.length) {
    if (!contractId) return { ok: false as const, error: "Bunurile din contract se aleg doar pe un contract existent." };
    const inside = new Set((await db.prepare(`SELECT DISTINCT a.property_id AS id FROM assets a JOIN reports r ON r.id = a.report_id WHERE r.contract_id = ? AND r.status <> 'cancelled'`)
      .bind(contractId).all<{ id: string }>()).results.map((x) => x.id));
    if (shared.some((x) => !inside.has(x))) return { ok: false as const, error: "Un bun ales nu face parte din acest contract." };
  }
  // A report of only properties already in the contract: the order takes its place from the first of them.
  const firstShared = specs.list.find((x) => x.shared?.length)?.shared?.[0];
  const sharedProp = !assets[0] && firstShared
    ? await db.prepare("SELECT category, type, city, full_address, usable_area FROM crm_properties WHERE id = ?").bind(firstShared)
      .first<{ category: string | null; type: string | null; city: string | null; full_address: string | null; usable_area: number | null }>()
    : null;
  const main: AssetInput | null = assets[0] ?? (sharedProp ? { ...(assets[0] as unknown as AssetInput), category: sharedProp.category, type: sharedProp.type ?? "", city: sharedProp.city,
    full_address: sharedProp.full_address, usable_area: sharedProp.usable_area, contact_kind: "client" } as AssetInput : null);
  if (!main) return { ok: false as const, error: "Adaugă cel puțin un bun de evaluat." };
  const contactName = main.contact_kind && main.contact_kind !== "client" ? main.contact_name : null;
  const ordered = /^\d{4}-\d{2}-\d{2}$/.test(str(b.ordered_on, 10)) ? str(b.ordered_on, 10) : now().slice(0, 10);
  const fee = amount(b.fee);
  const id = uuid(), t = now();
  for (let attempt = 0; ; attempt++) {
    const seq = ((await db.prepare("SELECT MAX(seq) AS m FROM orders").first<{ m: number | null }>())?.m ?? 1000) + 1;
    try {
      await db.prepare(`INSERT INTO orders (id, seq, source, created_by, property_type, city, address, surface_area, purpose, urgent, client_name, client_phone, client_email,
          contact_name, contact_phone, inspection_notes, notes, status, docs_missing, client_id, contract_id, report_type, fee, ordered_on, viewed_at, viewed_by, assets_json, reports_json, created_at, updated_at)
        VALUES (?, ?, 'direct', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, seq, actor.id, propertyType(main), main.city || null, main.full_address || null, main.usable_area || null, specs.list[0]?.purpose || str(b.purpose, 120) || null, b.urgent === true ? 1 : 0,
          c.name, c.phone, c.email, contactName, contactName ? main.contact_phone : null, str(b.inspection_notes, 1000) || null, str(b.notes, 2000) || null,
          c.id, contractId, specs.list[0]?.report_type || str(b.report_type, 120) || "Raport de evaluare", specs.list.length ? specs.total ?? fee : fee, ordered, t, actor.id, JSON.stringify(assets), specs.list.length ? JSON.stringify(specs.list) : null, t, t)
        .run();
      break;
    } catch (e) {
      if (!String(e).includes("UNIQUE") || attempt >= 4) throw e;
    }
  }
  await audit(db, `user:${actor.id}`, "order.create", "order", id, `lucrare directă · ${c.name}${mode === "offer" ? " · cu ofertă" : ""}`);
  if (mode === "offer") return { ok: true as const, order: id, report: null, contract: null, client: c };

  const due = /^\d{4}-\d{2}-\d{2}$/.test(str(b.due_on, 10)) ? str(b.due_on, 10) : null;
  const r = await openDossier(db, id, actor, { evaluator_id: evaluator, verifier_id: id_(b.verifier_id), due_on: due, fee });
  if (!r.ok) return r;
  return { ok: true as const, order: id, report: r.id, contract: (r.created && r.contract) || null, client: c };
}

/** The reports of direct work, checked: each values at least one asset; every asset is in at least one report. */
function parseSpecs(raw: unknown, assets: number): { ok: true; list: ReportSpec[]; total: number | null } | { ok: false; error: string } {
  const arr = Array.isArray(raw) ? (raw as Record<string, unknown>[]).slice(0, 10) : [];
  if (arr.length === 0) return { ok: true, list: [], total: null };
  const list: ReportSpec[] = [];
  const used = new Set<number>();
  for (const [n, r] of arr.entries()) {
    const idx = (Array.isArray(r.assets) ? r.assets : []).map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < assets);
    const shared = (Array.isArray(r.shared) ? r.shared : []).filter((x): x is string => typeof x === "string" && /^[\w-]{1,80}$/.test(x));
    if (!idx.length && !shared.length) return { ok: false, error: `Raportul ${n + 1}: alege bunurile evaluate.` };
    idx.forEach((i) => used.add(i));
    const term = Number(r.term_days);
    list.push({ purpose: str(r.purpose, 120) || null, report_type: str(r.report_type, 120) || null, fee: amount(r.fee), term_days: Number.isInteger(term) && term > 0 && term < 200 ? term : null,
      assets: [...new Set(idx)], shared });
  }
  if (used.size < assets) return { ok: false, error: "Fiecare bun trebuie să fie în cel puțin un raport." };
  const fees = list.map((x) => x.fee);
  return { ok: true, list, total: fees.some((x) => x != null) ? fees.reduce<number>((a, x) => a + (x ?? 0), 0) : null };
}
