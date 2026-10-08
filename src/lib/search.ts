import { niceName } from "./labels";

// Server-only: the search box in the CRM's top bar — one query over reports, orders, clients, contracts and
// properties (number, name, CUI, phone, email, CF / cadastral number, address), a few hits of each.
export type SearchHit = { kind: "report" | "order" | "client" | "contract" | "property"; id: string; title: string; sub: string; href: string };

const PER = 6;

export async function globalSearch(db: D1Database, raw: string): Promise<SearchHit[]> {
  const q = raw.trim().slice(0, 80);
  if (q.length < 2) return [];
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const digits = q.replace(/\D/g, "");
  const phone = digits.length >= 6 ? `%${digits.slice(-9)}%` : null;
  const seq = /^(?:co-?)?(\d{3,7})$/i.exec(q)?.[1] ?? null;
  const cleanPhone = (col: string) => `replace(replace(replace(replace(${col}, ' ', ''), '.', ''), '-', ''), '+40', '0')`;

  const [reports, orders, clients, contracts, props] = await Promise.all([
    db.prepare(`SELECT r.id, r.number, r.label, r.status, COALESCE(r.report_date, substr(r.created_at, 1, 10)) AS d, c.name AS client, b.name AS bank
      FROM reports r LEFT JOIN entities c ON c.id = r.client_id LEFT JOIN entities b ON b.id = r.recipient_id
      WHERE r.number = ?1 OR r.number LIKE ?2 OR r.label LIKE ?2 OR c.name LIKE ?2
        OR EXISTS (SELECT 1 FROM assets a JOIN crm_properties p ON p.id = a.property_id WHERE a.report_id = r.id AND (p.cf_number LIKE ?2 OR p.cad_building LIKE ?2 OR p.full_address LIKE ?2))
      ORDER BY r.number = ?1 DESC, r.created_at DESC LIMIT ${PER}`).bind(q, like)
      .all<{ id: string; number: string | null; label: string | null; status: string; d: string | null; client: string | null; bank: string | null }>(),
    db.prepare(`SELECT o.id, o.seq, o.source, o.bank, o.bank_ref, o.client_name, o.city, o.address, substr(o.created_at, 1, 10) AS d FROM orders o
      WHERE (?3 IS NOT NULL AND o.seq = CAST(?3 AS INTEGER)) OR o.bank_ref LIKE ?2 OR o.client_name LIKE ?2 OR o.address LIKE ?2 OR o.client_email LIKE ?2
        OR (?4 IS NOT NULL AND ${cleanPhone("o.client_phone")} LIKE ?4)
      ORDER BY (?3 IS NOT NULL AND o.seq = CAST(?3 AS INTEGER)) DESC, o.bank_ref = ?1 DESC, o.created_at DESC LIMIT ${PER}`).bind(q, like, seq, phone)
      .all<{ id: string; seq: number | null; source: string; bank: string | null; bank_ref: string | null; client_name: string | null; city: string | null; address: string | null; d: string }>(),
    db.prepare(`SELECT e.id, e.kind, e.name, e.cui, e.phone, e.email, e.city FROM entities e
      WHERE e.kind <> 'valuation_firm' AND (e.name LIKE ?1 OR e.cui LIKE ?1 OR e.email LIKE ?1 OR (?2 IS NOT NULL AND ${cleanPhone("e.phone")} LIKE ?2))
      ORDER BY e.name LIKE ?3 DESC, (SELECT COUNT(*) FROM reports r WHERE r.client_id = e.id) DESC LIMIT ${PER}`).bind(like, phone, `${q.replace(/[%_]/g, "")}%`)
      .all<{ id: string; kind: string; name: string; cui: string | null; phone: string | null; email: string | null; city: string | null }>(),
    db.prepare(`SELECT k.id, k.kind, k.number, k.signed_on, e.name AS client FROM contracts k LEFT JOIN entities e ON e.id = k.client_id
      WHERE k.number = ?1 OR e.name LIKE ?2 ORDER BY k.number = ?1 DESC, k.signed_on DESC LIMIT ${PER}`).bind(q, like)
      .all<{ id: string; kind: string; number: string | null; signed_on: string | null; client: string | null }>(),
    db.prepare(`SELECT p.id, p.type, p.full_address, p.city, p.cf_number, p.cad_building FROM crm_properties p
      WHERE p.cf_number LIKE ?1 OR p.cad_building LIKE ?1 OR p.cad_land LIKE ?1 OR p.full_address LIKE ?1
      ORDER BY p.cf_number = ?2 DESC, p.updated_at DESC LIMIT ${PER}`).bind(like, q)
      .all<{ id: string; type: string | null; full_address: string | null; city: string | null; cf_number: string | null; cad_building: string | null }>(),
  ]);
  const day = (d: string | null | undefined) => (d ? d.slice(0, 10).split("-").reverse().join(".") : "");
  const cap = (s: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : "");
  return [
    ...reports.results.map((r): SearchHit => ({ kind: "report", id: r.id, title: r.number ? `Raport ${r.number}` : r.label ?? "Raport", sub: [niceName(r.client), niceName(r.bank), day(r.d)].filter(Boolean).join(" · "), href: `/rapoarte/${r.id}` })),
    ...orders.results.map((o): SearchHit => ({ kind: "order", id: o.id, title: o.seq ? `CO-${o.seq}` : o.bank_ref ? `${o.bank ?? "Bancă"} ${o.bank_ref}` : "Comandă",
      sub: [niceName(o.client_name), [o.address, o.city].filter(Boolean).join(", "), day(o.d)].filter(Boolean).join(" · "), href: `/comenzi/${o.id}` })),
    ...clients.results.map((c): SearchHit => ({ kind: "client", id: c.id, title: niceName(c.name), sub: [c.cui && `CUI ${c.cui}`, c.phone, c.email, c.city].filter(Boolean).join(" · "), href: `/clienti/${c.id}` })),
    ...contracts.results.map((k): SearchHit => ({ kind: "contract", id: k.id, title: `Contract ${k.kind === "framework" ? "cadru" : "clasic"} nr. ${k.number ?? "—"}`, sub: [niceName(k.client), day(k.signed_on)].filter(Boolean).join(" · "), href: `/contracte/${k.id}` })),
    ...props.results.map((p): SearchHit => ({ kind: "property", id: p.id, title: cap(p.type) || "Proprietate", sub: [p.full_address ?? p.city, p.cf_number && `CF ${p.cf_number}`, p.cad_building && `cad. ${p.cad_building}`].filter(Boolean).join(" · "), href: `/proprietati/${p.id}` })),
  ];
}
