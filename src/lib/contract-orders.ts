// Server-only: work under a framework contract (banks) or a collaboration agreement (other valuation firms).
// There is no offer: the fee comes from the contract. One form registers the order — the line that goes on the
// statement (borderou) — and opens its report file in the same step.
import { isAvFirm } from "./av-labels";
import { now, uuid } from "./db";
import { audit } from "./auth";
import { propertyType } from "./process-order";
import { capType, type AssetInput } from "./asset-labels";
import { feeKindOf, grossFromGrid, netFromGrid, parseFeeGrid } from "./fee-grid";
import { getBilling } from "./billing";

export type ContractChoice = {
  id: string; number: string | null; bank_id: string | null; bank: string; bank_code: string | null; fee: number | null; report_type: string | null; purpose: string | null;
  logo?: string | null; billing_mode?: string | null; fee_grid?: string | null;
};
export type CollabChoice = { id: string; number: string | null; firm: string; share: number | null; logo?: string | null; billing_mode?: string | null };

/** The open framework contracts and the collaborations; `onlyFor`: just the contracts that user is accredited on. */
export async function contractChoices(db: D1Database, onlyFor?: string) {
  const [contracts, collabs] = await Promise.all([
    db.prepare(`SELECT k.id, k.number, k.client_id AS bank_id, COALESCE(e.name, 'Fără bancă') AS bank, e.code AS bank_code, k.fee, k.report_type, k.purpose, k.billing_mode, k.fee_grid, e.logo_url AS logo
      FROM contracts k LEFT JOIN entities e ON e.id = k.client_id WHERE k.kind = 'framework' AND k.closed_on IS NULL
      ${onlyFor ? "AND EXISTS (SELECT 1 FROM contract_accreditations ca WHERE ca.contract_id = k.id AND ca.user_id = ?)" : ""} ORDER BY e.name, k.signed_on DESC`)
      .bind(...(onlyFor ? [onlyFor] : [])).all<ContractChoice>(),
    db.prepare(`SELECT c.id, c.number, e.name AS firm, c.share, c.billing_mode, e.logo_url AS logo FROM collaborations c JOIN entities e ON e.id = c.firm_id ORDER BY e.name`).all<CollabChoice>(),
  ]);
  return { contracts: contracts.results, collabs: collabs.results };
}

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const amount = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n < 1e7 ? Math.round(n * 10000) / 10000 : null; // 4 decimals: a fee out of VAT
};

/**
 * The client of the work: the one picked from the CRM, else the same name with the same phone or email, else a new
 * client — a person, or a company (with its CUI) when "PJ" was chosen.
 */
async function clientOf(db: D1Database, actor: string, b: Record<string, unknown>, name: string, phone: string) {
  const picked = str(b.client_id, 80);
  if (picked) {
    const e = await db.prepare("SELECT id FROM entities WHERE id = ? AND kind IN ('person', 'company')").bind(picked).first<{ id: string }>();
    if (e) {
      // Fill in what the client record did not have yet.
      await db.prepare("UPDATE entities SET phone = COALESCE(NULLIF(phone, ''), ?), email = COALESCE(NULLIF(email, ''), ?), updated_at = ? WHERE id = ?")
        .bind(phone || null, str(b.client_email, 160).toLowerCase() || null, now(), e.id).run();
      return e.id;
    }
  }
  const email = str(b.client_email, 160).toLowerCase() || null;
  const last9 = phone.replace(/\D/g, "").slice(-9);
  const found = await db.prepare(`SELECT id FROM entities WHERE kind IN ('person', 'company') AND lower(trim(name)) = lower(trim(?))
      AND ((? IS NOT NULL AND lower(email) = ?) OR (length(?) = 9 AND substr(replace(replace(replace(phone, ' ', ''), '.', ''), '-', ''), -9) = ?))
    ORDER BY updated_at DESC LIMIT 1`).bind(name, email, email, last9, last9).first<{ id: string }>();
  if (found) return found.id;
  const id = uuid();
  const company = b.client_kind === "company";
  await db.prepare("INSERT INTO entities (id, kind, name, phone, email, cui, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, company ? "company" : "person", name, phone || null, email, company ? str(b.client_cui, 20).toUpperCase().replace(/^RO\s*/, "") || null : null, actor).run();
  await audit(db, `user:${actor}`, "client.create", "entity", id, `${name} · din lucrare nouă`);
  return id;
}

/** The collaborator who brought the work: a collaborator's account (Utilizatori → Colaboratori), when given and real. */
export async function referralOf(db: D1Database, v: unknown) {
  const id = str(v, 80);
  if (!/^[\w-]{1,80}$/.test(id)) return null;
  return (await db.prepare("SELECT id FROM users WHERE id = ? AND kind = 'partner' AND status <> 'deleted'").bind(id).first<{ id: string }>())?.id ?? null;
}

/** The collaborators' accounts to pick from ("Recomandată de"): name, contact and firm. */
export async function referralPeople(db: D1Database, q: string) {
  const s = q.trim().replace(/[%_]/g, "");
  const like = `%${s}%`;
  const { results } = await db.prepare(`SELECT u.id, COALESCE(NULLIF(u.name, ''), u.email) AS name, u.phone, u.email, p.name AS firm
      FROM users u LEFT JOIN partners p ON p.id = u.partner_id WHERE u.kind = 'partner' AND u.status <> 'deleted'
      ${s ? "AND (u.name LIKE ?1 OR u.email LIKE ?1 OR u.phone LIKE ?1 OR p.name LIKE ?1)" : ""} ORDER BY u.status = 'active' DESC, name LIMIT 30`)
    .bind(...(s ? [like] : [])).all<{ id: string; name: string; phone: string | null; email: string | null; firm: string | null }>();
  return results;
}

/**
 * Registers the order of a bank (framework contract) or of a collaborating firm, with its assets (the first is the
 * main one: its place goes on the order). Returns its id.
 */
export async function createContractOrder(db: D1Database, actor: string, b: Record<string, unknown>, assets: AssetInput[]) {
  const kind = b.kind === "collab" ? "collab" : "bank";
  const client = str(b.client_name, 160);
  if (!client) return { ok: false as const, error: "Completează numele clientului." };
  const phone = str(b.client_phone, 40);
  if (phone.replace(/\D/g, "").length < 9) return { ok: false as const, error: "Completează telefonul clientului." };
  // Bank orders carry the bank's number; a collaboration gets the next number of the CRM (CO-<n>).
  if (kind === "bank" && !str(b.bank_ref, 60)) return { ok: false as const, error: "Completează numărul comenzii." };
  const main = assets[0];
  const type = propertyType(main), city = main.city ?? "", address = main.full_address ?? "";
  const contactName = main.contact_kind && main.contact_kind !== "client" ? main.contact_name : null;
  const contactPhone = contactName ? main.contact_phone : null;
  const ordered = /^\d{4}-\d{2}-\d{2}$/.test(str(b.ordered_on, 10)) ? str(b.ordered_on, 10) : now().slice(0, 10);
  let fee = amount(b.fee);
  let feeGross: number | null = null;
  let contract: ContractChoice | null = null, collab: CollabChoice | null = null;

  if (kind === "bank") {
    contract = await db.prepare(`SELECT k.id, k.number, k.client_id AS bank_id, COALESCE(e.name, '') AS bank, e.code AS bank_code, k.fee, k.report_type, k.purpose, k.fee_grid
      FROM contracts k LEFT JOIN entities e ON e.id = k.client_id WHERE k.id = ? AND k.kind = 'framework' AND k.closed_on IS NULL`).bind(str(b.contract_id, 80)).first<ContractChoice>();
    if (!contract) return { ok: false as const, error: "Alege contractul cadru (unul deschis)." };
    // The fee: the one typed, else the contract's grid for the kind of the main asset (net of VAT), else the contract's standard fee.
    // Without any: the fee is required, unless it is left for later ("Completez mai târziu").
    const grid = parseFeeGrid(contract.fee_grid);
    const vat = (await getBilling(db)).vatPercent, kindOf = feeKindOf(main.category, main.type);
    fee ??= netFromGrid(grid, kindOf, vat) ?? (contract.fee || null); // 0 in the old CRM = no fee set
    // The grid's fee with VAT: the invoice is issued on it, VAT included (its total is exactly the grid's amount).
    feeGross = grossFromGrid(grid, kindOf, vat, fee);
    if (fee == null && b.fee_later !== true) {
      return { ok: false as const, error: grid ? `Tipul bunului principal (${capType(main.type) || "—"}) nu e în grila de tarife a contractului: completează tariful sau bifează „Completez mai târziu”.` : "Completează tariful sau bifează „Completez mai târziu”." };
    }
  } else {
    collab = await db.prepare("SELECT c.id, c.number, e.name AS firm, c.share FROM collaborations c JOIN entities e ON e.id = c.firm_id WHERE c.id = ?")
      .bind(str(b.collaboration_id, 80)).first<CollabChoice>();
    if (!collab) return { ok: false as const, error: "Alege colaborarea (firma de evaluare)." };
    // Appraisal & Valuation process the order in their CRM: the client's email is required there
    if (isAvFirm(collab.firm) && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(str(b.client_email, 160))) return { ok: false as const, error: "Emailul clientului e obligatoriu la Appraisal & Valuation." };
    const nr = str(b.report_number, 30);
    if (nr && await db.prepare("SELECT 1 AS x FROM reports r JOIN collaborations c ON c.firm_id = r.issuer_id WHERE c.id = ? AND r.number = ? AND r.status <> 'cancelled' LIMIT 1").bind(collab.id, nr).first())
      return { ok: false as const, error: `Există deja un raport cu nr. ${nr} emis pe ${collab.firm}.` };
  }
  // The designated user: the one chosen (a bank, IFN, institution), else the contract's bank; none when only the client
  let recipient: { id: string; label: string } | null = null;
  if (b.client_only !== true) {
    const rid = str(b.recipient_id, 80) || contract?.bank_id || "";
    const e = rid ? await db.prepare("SELECT id, name, code FROM entities WHERE id = ? AND kind <> 'valuation_firm'").bind(rid).first<{ id: string; name: string; code: string | null }>() : null;
    if (!e) return { ok: false as const, error: "Alege utilizatorul desemnat (banca) sau bifează „Doar clientul”." };
    recipient = { id: e.id, label: e.code || e.name };
  }
  const share = collab?.share ?? null;
  const clientId = await clientOf(db, actor, b, client, phone);
  const referral = await referralOf(db, b.referral_id);
  const id = uuid(), t = now();
  await db.prepare(`INSERT INTO orders (id, source, created_by, property_type, city, address, surface_area, purpose, bank, urgent, client_name, client_phone, client_email,
      contact_name, contact_phone, inspection_notes, notes, status, client_id, contract_id, collaboration_id, bank_id, bank_branch, bank_ref, report_type, fee, share, fee_net,
      ordered_on, viewed_at, viewed_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, kind, actor, type, city || null, address || null, main.usable_area || null, str(b.purpose, 120) || contract?.purpose || (kind === "bank" ? "Garantare bancară" : null),
      recipient && contract && recipient.id === contract.bank_id ? contract.bank_code || contract.bank : recipient?.label ?? null, b.urgent === true ? 1 : 0, client, phone, str(b.client_email, 160).toLowerCase() || null,
      contactName, contactPhone, str(b.inspection_notes, 1000) || null, str(b.notes, 2000) || null,
      clientId, contract?.id ?? null, collab?.id ?? null, recipient?.id ?? null, str(b.bank_branch, 120) || null, kind === "bank" ? str(b.bank_ref, 60) || null : null,
      str(b.report_type, 120) || contract?.report_type || null, fee, share, fee != null && share != null ? Math.round(fee * share * 100) / 100 : null,
      ordered, t, actor, t, t)
    .run();
  if (feeGross != null) await db.prepare("UPDATE orders SET fee_gross = ? WHERE id = ?").bind(feeGross, id).run();
  if (referral) await db.prepare("UPDATE orders SET referral_user_id = ? WHERE id = ?").bind(referral, id).run();
  const parent = str(b.parent_report_id, 80);
  if (parent && /^[\w-]{1,80}$/.test(parent)) await db.prepare("UPDATE orders SET parent_report_id = (SELECT id FROM reports WHERE id = ?) WHERE id = ?").bind(parent, id).run();
  if (kind === "collab") {
    await db.prepare("UPDATE orders SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM orders) WHERE id = ? AND seq IS NULL").bind(id).run();
    // The collaborating firm's number of the report (VALUEFY's reports are numbered automatically).
    const nr = str(b.report_number, 30);
    if (nr) await db.prepare("UPDATE orders SET collab_report_number = ? WHERE id = ?").bind(nr, id).run();
  }
  await audit(db, `user:${actor}`, "order.create", "order", id, kind === "bank" ? `${contract!.bank} ${str(b.bank_ref, 60)}` : `colaborare ${collab!.firm}`);
  return { ok: true as const, id };
}
