// Server-only: work under a framework contract (banks) or a collaboration agreement (other valuation firms).
// There is no offer: the fee comes from the contract. One form registers the order — the line that goes on the
// statement (borderou) — and opens its report file in the same step.
import { now, uuid } from "./db";
import { audit } from "./auth";
import { PROPERTY_TYPES } from "./order-labels";

export type ContractChoice = { id: string; number: string | null; bank_id: string | null; bank: string; bank_code: string | null; fee: number | null; report_type: string | null; purpose: string | null };
export type CollabChoice = { id: string; number: string | null; firm: string; share: number | null };

export async function contractChoices(db: D1Database) {
  const [contracts, collabs] = await Promise.all([
    db.prepare(`SELECT k.id, k.number, k.client_id AS bank_id, COALESCE(e.name, 'Fără bancă') AS bank, e.code AS bank_code, k.fee, k.report_type, k.purpose
      FROM contracts k LEFT JOIN entities e ON e.id = k.client_id WHERE k.kind = 'framework' ORDER BY e.name, k.signed_on DESC`).all<ContractChoice>(),
    db.prepare(`SELECT c.id, c.number, e.name AS firm, c.share FROM collaborations c JOIN entities e ON e.id = c.firm_id ORDER BY e.name`).all<CollabChoice>(),
  ]);
  return { contracts: contracts.results, collabs: collabs.results };
}

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const amount = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n < 1e7 ? Math.round(n * 100) / 100 : null;
};

/** Registers the order of a bank (framework contract) or of a collaborating firm. Returns its id. */
export async function createContractOrder(db: D1Database, actor: string, b: Record<string, unknown>) {
  const kind = b.kind === "collab" ? "collab" : "bank";
  const type = PROPERTY_TYPES.some(([k]) => k === b.property_type) ? (b.property_type as string) : null;
  const client = str(b.client_name, 160);
  const city = str(b.city, 80), address = str(b.address, 200);
  if (!client) return { ok: false as const, error: "Completează numele clientului." };
  if (!type) return { ok: false as const, error: "Alege tipul proprietății." };
  if (!city || !address) return { ok: false as const, error: "Completează localitatea și adresa proprietății." };
  const ordered = /^\d{4}-\d{2}-\d{2}$/.test(str(b.ordered_on, 10)) ? str(b.ordered_on, 10) : now().slice(0, 10);
  let fee = amount(b.fee);
  let contract: ContractChoice | null = null, collab: CollabChoice | null = null;

  if (kind === "bank") {
    contract = await db.prepare(`SELECT k.id, k.number, k.client_id AS bank_id, COALESCE(e.name, '') AS bank, e.code AS bank_code, k.fee, k.report_type, k.purpose
      FROM contracts k LEFT JOIN entities e ON e.id = k.client_id WHERE k.id = ? AND k.kind = 'framework'`).bind(str(b.contract_id, 80)).first<ContractChoice>();
    if (!contract) return { ok: false as const, error: "Alege contractul cadru." };
    if (!str(b.bank_ref, 60)) return { ok: false as const, error: "Completează numărul comenzii din aplicația băncii." };
    fee ??= contract.fee || null; // 0 in Glide = no fee set on the contract
  } else {
    collab = await db.prepare("SELECT c.id, c.number, e.name AS firm, c.share FROM collaborations c JOIN entities e ON e.id = c.firm_id WHERE c.id = ?")
      .bind(str(b.collaboration_id, 80)).first<CollabChoice>();
    if (!collab) return { ok: false as const, error: "Alege colaborarea (firma de evaluare)." };
  }
  const share = collab?.share ?? null;
  const id = uuid(), t = now();
  await db.prepare(`INSERT INTO orders (id, source, created_by, property_type, city, address, surface_area, purpose, bank, urgent, client_name, client_phone, client_email,
      contact_name, contact_phone, inspection_notes, notes, status, contract_id, collaboration_id, bank_id, bank_branch, bank_ref, report_type, fee, share, fee_net,
      ordered_on, viewed_at, viewed_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, kind, actor, type, city, address, amount(b.surface_area) || null, str(b.purpose, 120) || contract?.purpose || (kind === "bank" ? "Credit bancar" : null),
      contract ? contract.bank_code || contract.bank : null, b.urgent === true ? 1 : 0, client, str(b.client_phone, 40) || null, str(b.client_email, 160).toLowerCase() || null,
      str(b.contact_name, 120) || null, str(b.contact_phone, 40) || null, str(b.inspection_notes, 1000) || null, str(b.notes, 2000) || null,
      contract?.id ?? null, collab?.id ?? null, contract?.bank_id ?? null, str(b.bank_branch, 120) || null, str(b.bank_ref, 60) || null,
      str(b.report_type, 120) || contract?.report_type || null, fee, share, fee != null && share != null ? Math.round(fee * share * 100) / 100 : null,
      ordered, t, actor, t, t)
    .run();
  await audit(db, `user:${actor}`, "order.create", "order", id, kind === "bank" ? `${contract!.bank} ${str(b.bank_ref, 60)}` : `colaborare ${collab!.firm}`);
  return { ok: true as const, id };
}
