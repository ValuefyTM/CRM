// Server-only: the contracts of VALUEFY. Classic: one client, one piece of work (the report, sometimes several) — made
// automatically when a report opens from an order of the portal, the website or direct work. Framework: an agreement
// with a bank and its standard fees; the bank's orders are worked under it and invoiced on the monthly statement.
import { bucharestDay, now, uuid } from "./db";
import { audit } from "./auth";
import { fileSrc } from "./files";

export type Contract = {
  id: string; glide_id: string | null; kind: "classic" | "framework"; number: string | null; signed_on: string | null; client_id: string | null; currency: string | null;
  fee: number | null; services: string | null; valuation_types: string | null; report_type: string | null; purpose: string | null; notes: string | null;
  created_at: string; updated_at: string; sign_sent_at?: string | null; signed_at?: string | null;
};
export type ContractRow = Contract & {
  client: string | null; client_kind: string | null; reports: number; open: number; done: number; report_id: string | null; report_number: string | null;
  report_status: string | null; report_label: string | null; month: number;
};
export type ContractFilters = { tip?: string; an?: string; stare?: string; q?: string; page?: number };

export const CONTRACT_PAGE = 50;
export const CONTRACT_KINDS: [string, string][] = [["", "Toate"], ["clasic", "Clasice"], ["cadru", "Cadru"]];
export const CONTRACT_STATES: [string, string][] = [["", "Oricare"], ["fara-raport", "Fără raport"], ["in-lucru", "Cu rapoarte în lucru"], ["finalizat", "Finalizate"],
  ["de-semnat", "Trimise la semnat, nesemnate"], ["semnate", "Semnate online"]];
export const CONTRACT_PURPOSES = ["Garantare bancară", "Impozitare", "Informare", "Vânzare / cumpărare", "Raportare financiară", "Succesiune / partaj", "Expertiză / litigiu",
  "Eșalonare datorii", "Insolvență", "Alt scop"];
export const REPORT_KINDS = ["Raport de evaluare", "Notă de opinie", "Notă de inspecție", "Notă de informare"];
export const KIND_LABEL: Record<string, string> = { classic: "Clasic", framework: "Cadru" };

const OPEN = "r.status IN ('draft', 'in_progress') AND r.delivered_at IS NULL";
const DONE = "(r.status = 'done' OR r.delivered_at IS NOT NULL)";

/** The next classic contract number: the series goes on from the last one. */
export async function nextContractNumber(db: D1Database) {
  const r = await db.prepare("SELECT MAX(CAST(number AS INTEGER)) AS n FROM contracts WHERE kind = 'classic'").first<{ n: number | null }>();
  return String((r?.n ?? 0) + 1);
}

export type ClassicInput = {
  client_id: string; fee: number | null; purpose: string | null; report_type: string | null; valuation_types?: string | null; signed_on?: string | null;
  notes?: string | null;
};

/**
 * A classic contract with the next number. The number is taken in the same statement as the insert, so two contracts
 * made at the same moment do not get the same one.
 */
export async function createClassicContract(db: D1Database, actor: string, v: ClassicInput) {
  const id = `ctr-${uuid()}`, t = now();
  await db.prepare(`INSERT INTO contracts (id, kind, number, signed_on, client_id, currency, fee, services, valuation_types, report_type, purpose, notes, created_at, updated_at)
      SELECT ?, 'classic', CAST(COALESCE(MAX(CAST(number AS INTEGER)), 0) + 1 AS TEXT), ?, ?, 'RON', ?, 'SERVICII DE EVALUARE', ?, ?, ?, ?, ?, ?
      FROM contracts WHERE kind = 'classic'`)
    .bind(id, v.signed_on ?? bucharestDay(t), v.client_id, v.fee, v.valuation_types ?? "EPI", v.report_type ?? "Raport de evaluare", v.purpose, v.notes ?? null, t, t).run();
  const c = (await db.prepare("SELECT number FROM contracts WHERE id = ?").bind(id).first<{ number: string }>())!;
  await audit(db, actor, "contract.create", "contract", id, `clasic nr. ${c.number}`);
  return { id, number: c.number };
}

export type FrameworkInput = { client_id: string; number: string; signed_on: string; fee: number | null; report_type: string | null; purpose: string | null; notes: string | null };

export async function createFrameworkContract(db: D1Database, actor: string, v: FrameworkInput) {
  const id = `ctr-${uuid()}`, t = now();
  await db.prepare(`INSERT INTO contracts (id, kind, number, signed_on, client_id, currency, fee, services, valuation_types, report_type, purpose, notes, created_at, updated_at)
      VALUES (?, 'framework', ?, ?, ?, 'RON', ?, 'SERVICII DE EVALUARE', 'EPI', ?, ?, ?, ?, ?)`)
    .bind(id, v.number, v.signed_on, v.client_id, v.fee, v.report_type, v.purpose ?? "Garantare bancară", v.notes, t, t).run();
  await audit(db, `user:${actor}`, "contract.create", "contract", id, `cadru nr. ${v.number}`);
  return id;
}

export async function updateContract(db: D1Database, actor: string, id: string, v: { number: string; signed_on: string | null; fee: number | null; report_type: string | null; purpose: string | null; notes: string | null }) {
  await db.prepare("UPDATE contracts SET number = ?, signed_on = ?, fee = ?, report_type = ?, purpose = ?, notes = ?, updated_at = ? WHERE id = ?")
    .bind(v.number, v.signed_on, v.fee, v.report_type, v.purpose, v.notes, now(), id).run();
  await audit(db, `user:${actor}`, "contract.edit", "contract", id, `nr. ${v.number}`);
}

function where(f: ContractFilters) {
  const w: string[] = [];
  const a: (string | number)[] = [];
  if (f.tip === "clasic") w.push("k.kind = 'classic'");
  if (f.tip === "cadru") w.push("k.kind = 'framework'");
  if (f.an && /^\d{4}$/.test(f.an)) { w.push("substr(k.signed_on, 1, 4) = ?"); a.push(f.an); }
  if (f.stare === "de-semnat") w.push("k.sign_sent_at IS NOT NULL AND k.signed_at IS NULL");
  if (f.stare === "semnate") w.push("k.signed_at IS NOT NULL");
  if (f.stare === "fara-raport") w.push("NOT EXISTS (SELECT 1 FROM reports r WHERE r.contract_id = k.id)");
  if (f.stare === "in-lucru") w.push(`EXISTS (SELECT 1 FROM reports r WHERE r.contract_id = k.id AND ${OPEN})`);
  if (f.stare === "finalizat") w.push(`EXISTS (SELECT 1 FROM reports r WHERE r.contract_id = k.id) AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.contract_id = k.id AND NOT ${DONE})`);
  const q = f.q?.trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    w.push("(k.number = ? OR e.name LIKE ? OR e.cui LIKE ? OR EXISTS (SELECT 1 FROM reports r WHERE r.contract_id = k.id AND (r.number = ? OR r.label LIKE ?)))");
    a.push(q, like, like, q, like);
  }
  return { sql: w.length ? `WHERE ${w.join(" AND ")}` : "", args: a };
}

export async function listContracts(db: D1Database, f: ContractFilters) {
  const { sql, args } = where(f);
  const page = Math.max(1, f.page ?? 1);
  const month = bucharestDay().slice(0, 7);
  const [rows, total] = await Promise.all([
    db.prepare(`SELECT k.id, k.glide_id, k.kind, k.number, k.signed_on, k.client_id, k.currency, k.fee, k.services, k.valuation_types, k.report_type, k.purpose, k.notes, k.created_at, k.updated_at, k.sign_sent_at, k.signed_at, e.name AS client, e.kind AS client_kind,
        (SELECT COUNT(*) FROM reports r WHERE r.contract_id = k.id) AS reports,
        (SELECT COUNT(*) FROM reports r WHERE r.contract_id = k.id AND ${OPEN}) AS open,
        (SELECT COUNT(*) FROM reports r WHERE r.contract_id = k.id AND ${DONE}) AS done,
        (SELECT COUNT(*) FROM reports r WHERE r.contract_id = k.id AND substr(COALESCE(r.received_on, r.created_at), 1, 7) = ?) AS month,
        x.id AS report_id, x.number AS report_number, x.status AS report_status, x.label AS report_label
      FROM contracts k LEFT JOIN entities e ON e.id = k.client_id
        LEFT JOIN reports x ON x.id = (SELECT r.id FROM reports r WHERE r.contract_id = k.id ORDER BY r.created_at DESC LIMIT 1)
      ${sql} ORDER BY k.kind = 'framework' DESC, k.signed_on DESC, CAST(k.number AS INTEGER) DESC LIMIT ${CONTRACT_PAGE} OFFSET ?`)
      .bind(month, ...args, (page - 1) * CONTRACT_PAGE).all<ContractRow>(),
    db.prepare(`SELECT COUNT(*) AS n FROM contracts k LEFT JOIN entities e ON e.id = k.client_id ${sql}`).bind(...args).first<{ n: number }>(),
  ]);
  return { rows: rows.results, total: total?.n ?? 0, page };
}

/** Numbers for the cards at the top of the page. */
export async function contractStats(db: D1Database) {
  const t = bucharestDay();
  const year = t.slice(0, 4), month = t.slice(0, 7);
  const [s, years] = await Promise.all([
    db.prepare(`SELECT SUM(kind = 'classic' AND substr(signed_on, 1, 4) = ?1) AS year, SUM(kind = 'classic' AND substr(signed_on, 1, 7) = ?2) AS month,
        SUM(CASE WHEN kind = 'classic' AND substr(signed_on, 1, 4) = ?1 THEN fee END) AS value,
        SUM(kind = 'classic' AND substr(signed_on, 1, 4) = ?1 AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.contract_id = k.id)) AS empty,
        SUM(kind = 'framework') AS framework,
        (SELECT COUNT(*) FROM reports r JOIN contracts f ON f.id = r.contract_id WHERE f.kind = 'framework' AND substr(COALESCE(r.received_on, r.created_at), 1, 7) = ?2) AS framework_month,
        MAX(CASE WHEN kind = 'classic' THEN CAST(number AS INTEGER) END) AS last,
        SUM(sign_sent_at IS NOT NULL AND signed_at IS NULL) AS unsigned
      FROM contracts k`).bind(year, month)
      .first<{ year: number | null; month: number | null; value: number | null; empty: number | null; framework: number | null; framework_month: number | null; last: number | null; unsigned: number | null }>(),
    db.prepare("SELECT substr(signed_on, 1, 4) AS k, COUNT(*) AS n FROM contracts WHERE signed_on IS NOT NULL GROUP BY k ORDER BY k DESC").all<{ k: string; n: number }>(),
  ]);
  return {
    year: s?.year ?? 0, month: s?.month ?? 0, value: s?.value ?? 0, empty: s?.empty ?? 0, framework: s?.framework ?? 0, frameworkMonth: s?.framework_month ?? 0,
    next: String((s?.last ?? 0) + 1), years: years.results, unsigned: s?.unsigned ?? 0,
  };
}

export type ContractReport = {
  id: string; number: string | null; label: string | null; status: string; delivered_at: string | null; received_on: string | null; report_date: string | null;
  fee: number | null; result_value: number | null; order_id: string | null; evaluator: string | null; asset: string | null; photo: string | null;
};

export async function getContract(db: D1Database, id: string) {
  const c = await db.prepare(`SELECT k.id, k.glide_id, k.kind, k.number, k.signed_on, k.client_id, k.currency, k.fee, k.services, k.valuation_types, k.report_type, k.purpose, k.notes, k.created_at, k.updated_at, k.sign_sent_at, k.signed_at, e.name AS client, e.kind AS client_kind, e.cui AS client_cui, e.phone AS client_phone, e.email AS client_email, e.city AS client_city
      FROM contracts k LEFT JOIN entities e ON e.id = k.client_id WHERE k.id = ?`).bind(id)
    .first<Contract & { client: string | null; client_kind: string | null; client_cui: string | null; client_phone: string | null; client_email: string | null; client_city: string | null }>();
  if (!c) return null;
  const [reports, totals, order] = await Promise.all([
    db.prepare(`SELECT r.id, r.number, r.label, r.status, r.delivered_at, r.received_on, r.report_date, r.fee, r.result_value, r.order_id,
        (SELECT COALESCE(NULLIF(u.name, ''), u.email) FROM report_members m JOIN users u ON u.id = m.user_id WHERE m.report_id = r.id AND m.role = 'evaluator' LIMIT 1) AS evaluator,
        (SELECT COALESCE(p.type, '') || '|' || COALESCE(p.full_address, p.city, '') FROM assets a JOIN crm_properties p ON p.id = a.property_id WHERE a.report_id = r.id ORDER BY a.is_main DESC LIMIT 1) AS asset,
        (SELECT COALESCE(NULLIF(p.image_url, ''), (SELECT 'r2:' || f.r2_key FROM inspection_photos f JOIN inspections i ON i.id = f.inspection_id WHERE i.asset_id = a.id AND f.deleted_at IS NULL ORDER BY f.category = 'exterior' DESC LIMIT 1))
          FROM assets a JOIN crm_properties p ON p.id = a.property_id WHERE a.report_id = r.id ORDER BY a.is_main DESC LIMIT 1) AS photo
      FROM reports r WHERE r.contract_id = ? ORDER BY COALESCE(r.received_on, r.created_at) DESC LIMIT 40`).bind(id).all<ContractReport>(),
    db.prepare(`SELECT COUNT(*) AS n, SUM(${OPEN}) AS open, SUM(${DONE}) AS done, SUM(r.fee) AS fees, SUM(substr(COALESCE(r.received_on, r.created_at), 1, 7) = ?) AS month
      FROM reports r WHERE r.contract_id = ? AND r.status <> 'cancelled'`).bind(bucharestDay().slice(0, 7), id)
      .first<{ n: number; open: number | null; done: number | null; fees: number | null; month: number | null }>(),
    // The order the contract came from (direct work, portal, website) and its accepted offer.
    db.prepare(`SELECT o.id, o.source, o.seq, f.number AS offer_number, f.accepted_at FROM reports r JOIN orders o ON o.id = r.order_id
        LEFT JOIN offers f ON f.id = r.offer_id WHERE r.contract_id = ? ORDER BY r.created_at LIMIT 1`).bind(id)
      .first<{ id: string; source: string; seq: number | null; offer_number: string | null; accepted_at: string | null }>(),
  ]);
  return {
    contract: c, reports: reports.results.map((r) => ({ ...r, photo: fileSrc(r.photo) })),
    totals: { n: totals?.n ?? 0, open: totals?.open ?? 0, done: totals?.done ?? 0, fees: totals?.fees ?? 0, month: totals?.month ?? 0 }, order,
  };
}

/** Banks and financial firms a framework contract can be signed with. */
export async function bankChoices(db: D1Database) {
  return (await db.prepare("SELECT id, name, code FROM entities WHERE kind IN ('bank', 'ifn') ORDER BY name").all<{ id: string; name: string; code: string | null }>()).results;
}

/**
 * A classic contract with several reports: its purpose lists theirs and its price is the sum of their fees (each report
 * has its own Annex 1). Kept in step whenever a report is added to it.
 */
export async function refreshClassicContract(db: D1Database, id: string) {
  const k = await db.prepare("SELECT kind, signed_at FROM contracts WHERE id = ?").bind(id).first<{ kind: string; signed_at: string | null }>();
  if (k?.kind !== "classic" || k.signed_at) return; // a signed contract changes only by an addendum
  const { results } = await db.prepare("SELECT purpose, fee FROM reports WHERE contract_id = ? AND status <> 'cancelled' ORDER BY created_at").bind(id)
    .all<{ purpose: string | null; fee: number | null }>();
  if (results.length < 2) return;
  const purpose = [...new Set(results.map((r) => r.purpose).filter(Boolean))].join(" + ") || null;
  const fees = results.map((r) => r.fee);
  // The price is the sum only when every report has its fee (a missing one is not counted as 0).
  await db.prepare("UPDATE contracts SET purpose = COALESCE(?, purpose), fee = CASE WHEN ? THEN ? ELSE fee END, updated_at = ? WHERE id = ?")
    .bind(purpose, fees.every((f) => f != null) ? 1 : 0, fees.reduce<number>((s, f) => s + (f ?? 0), 0), now(), id).run();
}
