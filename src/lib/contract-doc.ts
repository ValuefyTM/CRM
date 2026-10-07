// Server-only: everything the contract document needs — the parties, the assets valued, and the terms of reference with
// their defaults filled in from the contract, its reports and the accepted offer.
import { capType } from "./asset-labels";
import {
  cleanTerms, defaultDeliverable, defaultSources, defaultValueType, DEFAULT_LIMITATIONS, DEFAULT_PAYMENT_WHEN, DEFAULT_TRANCHES, type ContractTerms,
} from "./contract-terms";

export type DocAsset = { type: string; ids: string; address: string; movable: boolean };

export async function contractDoc(db: D1Database, id: string) {
  const k = await db.prepare(`SELECT k.*, e.kind AS client_kind, e.name AS client, e.cui, e.reg_no, e.billing_address, e.city, e.county, e.phone, e.email,
      (SELECT c.name || CASE WHEN c.role IS NOT NULL AND c.role <> '' THEN ' / ' || c.role ELSE '' END FROM entity_contacts c WHERE c.entity_id = e.id ORDER BY c.is_primary DESC, c.created_at LIMIT 1) AS rep
    FROM contracts k LEFT JOIN entities e ON e.id = k.client_id WHERE k.id = ?`).bind(id)
    .first<{
      id: string; kind: string; number: string | null; signed_on: string | null; fee: number | null; currency: string | null; services: string | null; valuation_types: string | null;
      report_type: string | null; purpose: string | null; terms: string | null; client_kind: string | null; client: string | null; cui: string | null; reg_no: string | null;
      billing_address: string | null; city: string | null; county: string | null; phone: string | null; email: string | null; rep: string | null;
    }>();
  if (!k) return null;
  const [reports, assets] = await Promise.all([
    db.prepare(`SELECT r.id, r.term_days, b.name AS recipient, f.value_type, f.term_days AS offer_term, f.payment_terms
        FROM reports r LEFT JOIN entities b ON b.id = r.recipient_id LEFT JOIN offers f ON f.id = r.offer_id WHERE r.contract_id = ? ORDER BY r.created_at`).bind(id)
      .all<{ id: string; term_days: number | null; recipient: string | null; value_type: string | null; offer_term: number | null; payment_terms: string | null }>(),
    db.prepare(`SELECT p.category, p.type, p.cf_number, p.cad_building, p.cad_land, p.full_address, p.city FROM assets a JOIN reports r ON r.id = a.report_id
        JOIN crm_properties p ON p.id = a.property_id WHERE r.contract_id = ? ORDER BY r.created_at, a.is_main DESC`).bind(id)
      .all<{ category: string | null; type: string | null; cf_number: string | null; cad_building: string | null; cad_land: string | null; full_address: string | null; city: string | null }>(),
  ]);
  const list: DocAsset[] = assets.results.map((a) => ({
    type: capType(a.type) || "Bun",
    ids: [a.cf_number && `CF ${a.cf_number}`, a.cad_building && `nr. cad. ${a.cad_building}`, !a.cad_building && a.cad_land && `nr. cad. teren ${a.cad_land}`].filter(Boolean).join(", ") || "—",
    address: [a.full_address, a.full_address?.toLowerCase().includes((a.city ?? "").toLowerCase()) ? null : a.city].filter(Boolean).join(", ") || "—",
    movable: a.category === "BUN MOBIL",
  }));
  const saved = cleanTerms(k.terms ? JSON.parse(k.terms) : {});
  const r0 = reports.results[0];
  const movableOnly = list.length > 0 && list.every((a) => a.movable);
  const recipients = [...new Set(reports.results.map((r) => r.recipient).filter(Boolean))] as string[];
  const city = assets.results[0]?.city;
  const defaults: Required<Omit<ContractTerms, "print">> & { print: string } = {
    // Designated users: the client, plus the bank that receives the report or the town hall for taxation.
    users: [k.client, ...recipients, /impozit/i.test(k.purpose ?? "") && city ? `Primăria ${city}` : null].filter(Boolean).join(", "),
    others: "Nu este cazul",
    value_type: r0?.value_type && /pia/i.test(r0.value_type) ? "piata" : defaultValueType(k.purpose),
    deliverable: defaultDeliverable(k.report_type),
    nop_inspection: true,
    reports: Math.max(1, reports.results.length),
    term_days: r0?.offer_term ?? r0?.term_days ?? 3,
    limitations: DEFAULT_LIMITATIONS,
    special: "Nu este cazul.",
    sources: defaultSources(k.purpose, movableOnly),
    payment_when: DEFAULT_PAYMENT_WHEN,
    tranches: r0?.payment_terms ?? DEFAULT_TRANCHES,
    print: "",
  };
  const terms = { ...defaults, ...Object.fromEntries(Object.entries(saved).filter(([, v]) => v !== undefined)) } as typeof defaults;
  return {
    contract: k, assets: list, terms, saved, defaults,
    services: { immovable: !movableOnly && (k.valuation_types ?? "EPI").includes("EPI"), movable: (k.valuation_types ?? "").includes("EBM") || list.some((a) => a.movable) },
  };
}
