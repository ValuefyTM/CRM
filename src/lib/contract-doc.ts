// Server-only: everything the contract document needs — the parties, and per report of the contract its Annex 1 (the
// assets valued and the terms of reference, with their defaults filled in from the report and the accepted offer),
// plus the prices and payment terms of Annex 2.
import { capType } from "./asset-labels";
import { parseJson } from "./db";
import {
  cleanTerms, defaultDeliverable, defaultSources, defaultValueType, DEFAULT_LIMITATIONS, DEFAULT_PAYMENT_WHEN, DEFAULT_TRANCHES, PAYMENT_FIELDS, REPORT_FIELDS,
  type ContractTerms,
} from "./contract-terms";

export type DocAsset = { type: string; ids: string; address: string; movable: boolean; shared: string | null };
export type ReportTerms = Required<Pick<ContractTerms, (typeof REPORT_FIELDS)[number]>>;
export type PaymentTerms = { payment_when: string; tranches: string; print: string };

const pick = <T extends object>(o: ContractTerms, keys: readonly string[]) =>
  Object.fromEntries(Object.entries(o).filter(([k, v]) => keys.includes(k) && v !== undefined)) as Partial<T>;

export async function contractDoc(db: D1Database, id: string) {
  const k = await db.prepare(`SELECT k.id, k.kind, k.number, k.signed_on, k.fee, k.currency, k.services, k.valuation_types, k.report_type, k.purpose, k.terms, k.client_id, e.kind AS client_kind, e.name AS client, e.cui, e.reg_no, e.billing_address, e.city, e.county, e.phone, e.email,
      (SELECT c.name || CASE WHEN c.role IS NOT NULL AND c.role <> '' THEN ' / ' || c.role ELSE '' END FROM entity_contacts c WHERE c.entity_id = e.id ORDER BY c.is_primary DESC, c.created_at LIMIT 1) AS rep
    FROM contracts k LEFT JOIN entities e ON e.id = k.client_id WHERE k.id = ?`).bind(id)
    .first<{
      id: string; kind: string; number: string | null; signed_on: string | null; fee: number | null; currency: string | null; services: string | null; valuation_types: string | null;
      report_type: string | null; purpose: string | null; terms: string | null; client_kind: string | null; client: string | null; cui: string | null; reg_no: string | null;
      billing_address: string | null; city: string | null; county: string | null; phone: string | null; email: string | null; rep: string | null;
    }>();
  if (!k) return null;
  const [reports, assets] = await Promise.all([
    db.prepare(`SELECT r.id, r.number, r.label, r.purpose, r.report_type, r.fee, r.term_days, r.terms, b.name AS recipient, f.value_type, f.term_days AS offer_term, f.payment_terms
        FROM reports r LEFT JOIN entities b ON b.id = r.recipient_id LEFT JOIN offers f ON f.id = r.offer_id WHERE r.contract_id = ? AND r.status <> 'cancelled' ORDER BY r.created_at, r.rowid`).bind(id)
      .all<{ id: string; number: string | null; label: string | null; purpose: string | null; report_type: string | null; fee: number | null; term_days: number | null; terms: string | null;
        recipient: string | null; value_type: string | null; offer_term: number | null; payment_terms: string | null }>(),
    db.prepare(`SELECT a.report_id, a.no_inspection, p.category, p.type, p.cf_number, p.cad_building, p.cad_land, p.full_address, p.city FROM assets a JOIN reports r ON r.id = a.report_id
        JOIN crm_properties p ON p.id = a.property_id WHERE r.contract_id = ? ORDER BY r.created_at, r.rowid, a.is_main DESC`).bind(id)
      .all<{ report_id: string; no_inspection: string | null; category: string | null; type: string | null; cf_number: string | null; cad_building: string | null; cad_land: string | null;
        full_address: string | null; city: string | null }>(),
  ]);
  const contractTerms = cleanTerms(parseJson(k.terms, {}));
  const one = reports.results.length <= 1;
  // Without reports yet (the offer is not accepted), one annex from the contract itself.
  const list = reports.results.length ? reports.results
    : [{ id: "", number: null, label: null, purpose: k.purpose, report_type: k.report_type, fee: k.fee, term_days: null, terms: null, recipient: null, value_type: null, offer_term: null, payment_terms: null }];

  const annexes = list.map((r, n) => {
    const own = assets.results.filter((a) => a.report_id === r.id);
    const docAssets: DocAsset[] = own.map((a) => ({
      type: capType(a.type) || "Bun",
      ids: [a.cf_number && `CF ${a.cf_number}`, a.cad_building && `nr. cad. ${a.cad_building}`, !a.cad_building && a.cad_land && `nr. cad. teren ${a.cad_land}`].filter(Boolean).join(", ") || "—",
      address: [a.full_address, a.full_address?.toLowerCase().includes((a.city ?? "").toLowerCase()) ? null : a.city].filter(Boolean).join(", ") || "—",
      movable: a.category === "BUN MOBIL",
      shared: a.no_inspection?.startsWith("Inspecție comună") ? a.no_inspection : null,
    }));
    const movableOnly = docAssets.length > 0 && docAssets.every((a) => a.movable);
    const purpose = r.purpose ?? k.purpose;
    const city = own[0]?.city;
    const defaults: ReportTerms = {
      // Designated users: the client, plus the bank that receives the report or the town hall for taxation.
      users: [k.client, r.recipient, /impozit/i.test(purpose ?? "") && city ? `Primăria ${city}` : null].filter(Boolean).join(", "),
      others: "Nu este cazul",
      value_type: r.value_type && /pia/i.test(r.value_type) && !/impozit|raportare/i.test(purpose ?? "") ? "piata" : defaultValueType(purpose),
      deliverable: defaultDeliverable(r.report_type ?? k.report_type),
      nop_inspection: true,
      reports: 1,
      // The report's own term (the urgent one when the client chose it), else the offer's.
      term_days: r.term_days ?? r.offer_term ?? 3,
      limitations: DEFAULT_LIMITATIONS,
      special: "Nu este cazul.",
      sources: defaultSources(purpose, movableOnly),
    };
    // A single-report contract may still carry its terms on the contract (saved before reports had their own).
    const saved = { ...(one ? pick<ReportTerms>(contractTerms, REPORT_FIELDS) : {}), ...pick<ReportTerms>(cleanTerms(parseJson(r.terms, {})), REPORT_FIELDS) };
    return {
      n: n + 1, reportId: r.id || null, number: r.number, label: r.label, purpose, reportType: r.report_type ?? k.report_type, fee: r.fee,
      assets: docAssets, terms: { ...defaults, ...saved } as ReportTerms, defaults, saved,
      // Each annex ticks the services of its own assets (movable and real estate are valued in separate reports).
      services: docAssets.length
        ? { immovable: docAssets.some((a) => !a.movable), movable: docAssets.some((a) => a.movable) }
        : { immovable: (k.valuation_types ?? "EPI").includes("EPI"), movable: (k.valuation_types ?? "").includes("EBM") },
    };
  });

  const paymentDefaults: PaymentTerms = { payment_when: DEFAULT_PAYMENT_WHEN, tranches: list[0]?.payment_terms ?? DEFAULT_TRANCHES, print: "" };
  const paymentSaved = pick<PaymentTerms>(contractTerms, PAYMENT_FIELDS);
  // Prices: one line per report when the reports have their own fees, else the contract's fee.
  const priced = annexes.length > 1 && annexes.some((a) => a.fee != null);
  const total = priced ? annexes.reduce((s, a) => s + (a.fee ?? 0), 0) : k.fee;
  return {
    contract: k, annexes, total, priced,
    payment: { ...paymentDefaults, ...paymentSaved } as PaymentTerms, paymentDefaults, paymentSaved,
  };
}

export type ContractDocData = NonNullable<Awaited<ReturnType<typeof contractDoc>>>;
export type SignedSnapshot = { doc: ContractDocData; firm: import("./settings").FirmWithImages; sig: { name: string; signature: string; at: string } };

/** What the client signed, exactly as it was (the document is rendered from it afterwards, not from current data). */
export async function signedSnapshot(db: D1Database, id: string): Promise<SignedSnapshot | null> {
  const r = await db.prepare("SELECT signed_snapshot, signed_name, signed_signature, signed_at FROM contracts WHERE id = ? AND signed_at IS NOT NULL").bind(id)
    .first<{ signed_snapshot: string | null; signed_name: string; signed_signature: string; signed_at: string }>();
  if (!r?.signed_snapshot) return null;
  try {
    const s = JSON.parse(r.signed_snapshot) as Omit<SignedSnapshot, "sig">;
    return { ...s, sig: { name: r.signed_name, signature: r.signed_signature, at: r.signed_at } };
  } catch { return null; }
}
