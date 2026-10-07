// Server-only: processing an order. Every order becomes a report file ("dosar"): client, property and asset, team,
// fee and deadline. Portal / website orders open it when the client accepts the offer; bank and collaboration orders are
// registered directly under the framework contract or collaboration agreement (the order stays as the statement line).
import { withPresence } from "./presence";
import { now, uuid } from "./db";
import { audit } from "./auth";
import { esc, layout, sendEmail } from "./email";
import { appUrl } from "./site";
import { getOrder, type Order } from "./orders";
import { propertyLabel } from "./order-labels";
import { offerForOrder, type Offer } from "./offers";
import { createClassicContract, refreshClassicContract } from "./contracts";
import { fillReportAssets } from "./process-order";
import { addAsset, updateAsset } from "./assets";
import type { AssetInput } from "./asset-labels";

// ---------- stages and deadline ----------

/** Working stages shown on the report and, for the client, on the order timeline. */
export const STAGE_LABEL: Record<string, string> = {
  inspection: "Inspecție",
  drafting: "Redactare",
  review: "Verificare",
  delivered: "Livrat",
};
export const STAGE_ORDER = ["inspection", "drafting", "review", "delivered"] as const;
export type Stage = (typeof STAGE_ORDER)[number];

/**
 * Stage of a report: delivered once handed over; review when sent to the verifier; drafting when set by hand or once
 * every inspection of the report is done (or there is nothing to inspect); otherwise waiting for the inspection.
 */
/** `insp`: inspection tasks (not cancelled) and done; `none`: assets valued without an inspection. */
export function stageOf(r: { stage: string | null; delivered_at: string | null; status: string }, insp: { total: number; done: number; none?: number }): Stage {
  if (r.delivered_at || r.status === "done") return "delivered";
  if (r.stage === "review") return "review";
  if (r.stage === "drafting" || (insp.total > 0 && insp.done === insp.total) || (insp.total === 0 && (insp.none ?? 0) > 0)) return "drafting";
  return "inspection";
}

/** YYYY-MM-DD plus n working days (Monday to Friday). */
export function addWorkdays(iso: string, n: number) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

/** Deadline: set by hand, else the offer's working days counted from the inspection (unknown before it is done). */
export const dueOf = (r: { due_on: string | null; term_days: number | null }, inspectedOn: string | null) =>
  r.due_on ?? (r.term_days && inspectedOn ? addWorkdays(inspectedOn, r.term_days) : null);

// ---------- opening the file ----------

const PROPERTY: Record<string, [category: string | null, type: string]> = {
  apartment: ["REZIDENTIAL", "APARTAMENT IN BLOC"],
  house: ["REZIDENTIAL", "CASA CU TEREN"],
  land: ["TEREN", "TEREN INTRAVILAN CONSTRUCTII"],
  commercial: ["COMERCIAL", "SPATIU COMERCIAL - PARTE DINTR-O CLADIRE"],
  industrial: ["INDUSTRIAL", "SPATIU DE PRODUCTIE"],
  other: [null, "ALTA PROPRIETATE"],
};

/** One report of direct work: its purpose, type, fee, term, the order's assets it values (indexes) and properties already in the contract. */
export type ReportSpec = { purpose?: string | null; report_type?: string | null; fee?: number | null; term_days?: number | null; assets: number[]; shared?: string[] };

export type OpenOptions = {
  evaluator_id?: string | null; verifier_id?: string | null; due_on?: string | null; term_days?: number | null; fee?: number | null; notes?: string | null;
};

/** Client of the order as a CRM client: the one already linked, the portal client's own record, a match by email / phone, or a new one. */
async function clientFor(db: D1Database, o: Order, actor: string) {
  if (o.client_id) return o.client_id;
  if (o.source === "client" && o.created_by) {
    const u = await db.prepare("SELECT entity_id FROM users WHERE id = ?").bind(o.created_by).first<{ entity_id: string | null }>();
    if (u?.entity_id) return u.entity_id;
  }
  const email = (o.client_email ?? (o.source === "client" ? o.creator_email : null))?.trim().toLowerCase() || null;
  const phone = (o.client_phone ?? "").replace(/\D/g, "").slice(-9);
  const found = await db
    // Same email or phone AND the same name: a shared phone (family, agent) must not merge two different clients.
    .prepare(`SELECT id FROM entities WHERE kind IN ('person', 'company') AND lower(trim(name)) = lower(trim(?))
        AND ((? IS NOT NULL AND lower(email) = ?) OR (length(?) = 9 AND substr(replace(replace(replace(phone, ' ', ''), '.', ''), '-', ''), -9) = ?))
      ORDER BY updated_at DESC LIMIT 1`)
    .bind(o.client_name || o.creator_name || "", email, email, phone, phone)
    .first<{ id: string }>();
  if (found) return found.id;
  const id = uuid();
  await db.prepare("INSERT INTO entities (id, kind, name, phone, email, city, created_by) VALUES (?, 'person', ?, ?, ?, ?, ?)")
    .bind(id, o.client_name || o.creator_name || "Client", o.client_phone, email, o.city, actor).run();
  return id;
}

/** The bank that receives the report: the one on the order, else the entity matching the bank chosen in the portal. */
async function recipientFor(db: D1Database, o: Order) {
  if (o.bank_id) return o.bank_id;
  if (!o.bank) return null;
  const b = await db.prepare("SELECT id FROM entities WHERE kind IN ('bank', 'ifn') AND (upper(code) = upper(?) OR upper(name) = upper(?) OR upper(name) LIKE upper(?) || '%') ORDER BY approved DESC LIMIT 1")
    .bind(o.bank, o.bank, o.bank).first<{ id: string }>();
  return b?.id ?? null;
}

/** Fee without VAT of an accepted offer (express delivery included when chosen). */
const offerFee = (f: Offer) => f.fee + (f.travel_fee ?? 0) + (f.accepted_urgent && f.urgent_fee ? f.urgent_fee : 0);

/**
 * Opens the report file of an order (once: returns the existing one). `actor` is the team member, or null when it
 * opens by itself (the client accepted the offer). The evaluator of the offer gets the file and an email.
 */
export async function openDossier(db: D1Database, orderId: string, actor: { id: string; name: string } | null, opts: OpenOptions = {}) {
  const o = await getOrder(db, orderId);
  if (!o) return { ok: false as const, error: "Comanda nu există." };
  const existing = await db.prepare("SELECT id FROM reports WHERE order_id = ? ORDER BY created_at LIMIT 1").bind(orderId).first<{ id: string }>();
  if (existing) return { ok: true as const, id: existing.id, created: false };
  if (o.status === "cancelled") return { ok: false as const, error: "Comanda este anulată." };

  const offer = o.source === "bank" || o.source === "collab" ? null : await offerForOrder(db, orderId);
  const accepted = offer?.status === "accepted" ? offer : null;
  const who = actor ? `user:${actor.id}` : "client:offer";
  const t = now();
  const day = t.slice(0, 10);

  const [clientId, recipientId, issuer] = await Promise.all([
    clientFor(db, o, actor?.id ?? "system"),
    recipientFor(db, o),
    db.prepare("SELECT id FROM entities WHERE kind = 'valuation_firm' AND upper(name) LIKE 'VALUEFY%' LIMIT 1").first<{ id: string }>(),
  ]);

  // Direct work can hold several reports under one contract (e.g. taxation and financial reporting of the same
  // building): per report its purpose, type, fee, term and assets. Without it, one report as the order says.
  let specs: ReportSpec[] = [];
  try { specs = o.reports_json ? (JSON.parse(o.reports_json) as ReportSpec[]).filter((x) => x && Array.isArray(x.assets)) : []; } catch { specs = []; }
  const s0 = specs[0];

  // Property and the asset valued (the main one); more assets can be added on the report.
  const [category, type] = PROPERTY[o.property_type ?? ""] ?? [null, (o.report_type ?? "BUN").toUpperCase()];
  const propertyId = uuid(), assetId = uuid(), reportId = uuid();
  const where = [o.address, o.city].filter(Boolean).join(", ") || null;
  const label = [o.client_name || o.creator_name, [o.property_type ? propertyLabel(o.property_type) : o.report_type, o.city].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const evaluator = opts.evaluator_id ?? accepted?.evaluator_id ?? null;
  const term = opts.term_days ?? (accepted ? (accepted.accepted_urgent && accepted.urgent_days ? accepted.urgent_days : accepted.term_days) : null);
  const fee = opts.fee ?? (accepted ? offerFee(accepted) : o.fee);
  const several = specs.length > 1;
  // With several reports each has its own fee; the contract's price is their sum (else the offer / order fee).
  const specFees = specs.map((x) => x.fee ?? null);
  const total = several && specFees.some((x) => x != null) ? specFees.reduce<number>((n, x) => n + (x ?? 0), 0) : fee;
  const insertReport = (id: string, sp: ReportSpec | undefined, reportLabel: string) =>
    db.prepare(`INSERT INTO reports (id, label, issuer_id, contract_id, order_id, client_id, recipient_id, bank_branch, report_type, valuation_types, purpose, value_type,
        received_on, fee, status, reporting_year, referral_user_id, notes, term_days, due_on, offer_id, opened_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'EPI', ?, ?, ?, ?, 'in_progress', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, reportLabel || null, issuer?.id ?? null, o.contract_id, o.id, clientId, recipientId, o.bank_branch, sp?.report_type || o.report_type, sp?.purpose || o.purpose,
        accepted?.value_type ?? null, day, (several ? sp?.fee : null) ?? (several ? null : sp?.fee ?? fee) ?? null, Number(day.slice(0, 4)), o.source === "partner" ? o.created_by : null,
        opts.notes ?? null, sp?.term_days ?? term ?? null, opts.due_on ?? null, accepted?.id ?? null, actor?.id ?? null, t, t);
  const members = (id: string) => [
    ...(evaluator ? [db.prepare("INSERT OR IGNORE INTO report_members (report_id, user_id, role) VALUES (?, ?, 'evaluator')").bind(id, evaluator)] : []),
    ...(opts.verifier_id ? [db.prepare("INSERT OR IGNORE INTO report_members (report_id, user_id, role) VALUES (?, ?, 'verifier')").bind(id, opts.verifier_id)] : []),
  ];
  // Several reports (or one more on an existing contract) tell themselves apart by purpose.
  const mainLabel = (several || (o.contract_id && o.source === "direct")) && s0?.purpose ? `${label} · ${s0.purpose}` : label;

  await db.batch([
    db.prepare(`INSERT INTO crm_properties (id, category, type, city, full_address, usable_area, description) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(propertyId, category, type, o.city, where, o.surface_area ?? null,
        [o.rooms ? `${o.rooms} camere` : null, o.land_area ? `teren ${o.land_area} mp` : null].filter(Boolean).join(" · ") || null),
    insertReport(reportId, s0, mainLabel),
    // The asset after its report (foreign key).
    // Who shows the property: the contact given with the order, else the client.
    db.prepare("INSERT INTO assets (id, report_id, property_id, is_main, contact_kind, contact_name, contact_phone) VALUES (?, ?, ?, 1, ?, ?, ?)")
      .bind(assetId, reportId, propertyId, o.contact_name ? "other" : "client", o.contact_name ?? o.client_name ?? o.creator_name, o.contact_phone ?? o.client_phone),
    ...members(reportId),
    db.prepare("UPDATE orders SET status = 'in_progress', client_id = ?, updated_at = ? WHERE id = ?").bind(clientId, t, o.id),
  ]);
  // The classic contract of the work (portal, website, direct work), unless the order is under a contract already
  // (framework contract of a bank, collaboration, or another report of the same classic contract).
  let contract: { id: string; number: string } | null = null;
  if (!o.contract_id && o.source !== "bank" && o.source !== "collab") {
    const purposes = [...new Set((several ? specs.map((x) => x.purpose || o.purpose) : [o.purpose]).filter(Boolean))].join(" + ") || null;
    contract = await createClassicContract(db, who, {
      client_id: clientId, fee: total ?? null, purpose: purposes, report_type: s0?.report_type || o.report_type || "Raport de evaluare",
      valuation_types: category === null && /mobil/i.test(o.report_type ?? "") ? "EBM" : "EPI", signed_on: accepted?.accepted_at?.slice(0, 10) ?? (o.source === "direct" ? o.ordered_on : null) ?? day,
      notes: accepted ? `Generat la acceptarea ofertei ${accepted.number}.` : "Generat la procesarea comenzii.",
    });
    await db.prepare("UPDATE reports SET contract_id = ? WHERE id = ?").bind(contract.id, reportId).run();
  }
  // Direct work keeps its assets on the order until the report opens: the main one completes the asset made above.
  let list: AssetInput[] = [];
  try { list = o.assets_json ? (JSON.parse(o.assets_json) as AssetInput[]) : []; } catch { /* malformed: the main asset stays as made from the order */ }
  const by = actor?.id ?? "system";
  const client = { name: o.client_name ?? "", phone: o.client_phone ?? "" };
  if (!specs.length) {
    if (list.length) {
      const f = await fillReportAssets(db, by, reportId, assetId, list, client);
      if (!f.ok) console.error("fillReportAssets", f.error);
    }
  } else {
    await placeAssets(db, by, { reportId, assetId, propertyId, label: mainLabel, specs, list, client, contractId: contract?.id ?? o.contract_id, insertReport, members, baseLabel: label });
    if (contract?.id ?? o.contract_id) await refreshClassicContract(db, (contract?.id ?? o.contract_id)!);
  }
  await audit(db, who, "report.opened", "report", reportId, accepted ? `din oferta ${accepted.number}` : o.source === "bank" ? "comandă bancă" : o.source === "collab" ? "colaborare" : "din comandă");
  await audit(db, who, "order.dossier", "order", o.id, reportId);

  if (evaluator && evaluator !== actor?.id) await notifyEvaluator(db, reportId, evaluator, label || "raport nou", actor?.name ?? null, !!accepted);
  return { ok: true as const, id: reportId, created: true, assetId, contract };
}

/** An asset that only links a property already in the CRM (the same building valued in another report). */
const linkInput = (property_id: string): AssetInput => ({
  property_id, category: null, type: "", construction: "existing", county: null, city: null, full_address: null, cf_number: null, cad_building: null, cad_land: null,
  usable_area: null, year_built: null, description: null, is_main: false, value: null, approach: null, notes: null, contact_kind: null, contact_name: null, contact_phone: null,
});

/**
 * Puts each report's assets in place (direct work with several reports). A property is inspected once: in the first
 * report that values it; in the others its asset is marked "no inspection — shared inspection".
 */
async function placeAssets(db: D1Database, actor: string, p: {
  reportId: string; assetId: string; propertyId: string; label: string; baseLabel: string; specs: ReportSpec[]; list: AssetInput[]; client: { name: string; phone: string };
  contractId: string | null; insertReport: (id: string, sp: ReportSpec, label: string) => D1PreparedStatement; members: (id: string) => D1PreparedStatement[];
}) {
  const withContact = (a: AssetInput): AssetInput => a.contact_kind && a.contact_kind !== "client" && a.contact_name
    ? a : { ...a, contact_kind: "client", contact_name: p.client.name, contact_phone: p.client.phone || null };
  const propOf = new Map<number, string>();
  const firstIn = new Map<string, string>(); // property → label of the report that inspects it
  const t = now();
  const shared = async (reportId: string, assetId: string, where: string) =>
    db.prepare("UPDATE assets SET no_inspection = ?, no_inspection_at = ? WHERE id = ? AND report_id = ?").bind(`Inspecție comună cu ${where}`, t, assetId, reportId).run();
  const propertyOfAsset = async (id: string) => (await db.prepare("SELECT property_id FROM assets WHERE id = ?").bind(id).first<{ property_id: string }>())?.property_id ?? null;

  for (const [j, sp] of p.specs.entries()) {
    let rid = p.reportId;
    const rlabel = j === 0 ? p.label : [p.baseLabel, sp.purpose].filter(Boolean).join(" · ");
    if (j > 0) {
      rid = uuid();
      await db.batch([p.insertReport(rid, sp, rlabel), ...p.members(rid), ...(p.contractId ? [db.prepare("UPDATE reports SET contract_id = ? WHERE id = ?").bind(p.contractId, rid)] : [])]);
    }
    let placeholder = j === 0; // the main report starts with the asset made from the order
    const idx = sp.assets.filter((i) => p.list[i]);
    for (const i of idx) {
      const known = propOf.get(i);
      if (known) {
        const r = await addAsset(db, actor, rid, { ...linkInput(known), contact_kind: "client" });
        if (r.ok) await shared(rid, r.id, firstIn.get(known) ?? "alt raport din contract");
        continue;
      }
      if (placeholder) {
        await updateAsset(db, actor, rid, p.assetId, withContact({ ...p.list[i], is_main: true }));
        propOf.set(i, p.propertyId); firstIn.set(p.propertyId, `raportul „${rlabel}”`);
        placeholder = false;
        continue;
      }
      const r = await addAsset(db, actor, rid, withContact(p.list[i]));
      const prop = r.ok ? await propertyOfAsset(r.id) : null;
      if (prop) { propOf.set(i, prop); firstIn.set(prop, `raportul „${rlabel}”`); }
    }
    // Properties already valued in the contract (another report): linked, inspected there.
    for (const prop of sp.shared ?? []) {
      if (placeholder) {
        await db.batch([
          db.prepare("UPDATE assets SET property_id = ? WHERE id = ?").bind(prop, p.assetId),
          db.prepare("DELETE FROM crm_properties WHERE id = ?").bind(p.propertyId),
        ]);
        await shared(rid, p.assetId, "alt raport din contract");
        placeholder = false;
        continue;
      }
      const r = await addAsset(db, actor, rid, { ...linkInput(prop), contact_kind: "client" });
      if (r.ok) await shared(rid, r.id, "alt raport din contract");
    }
  }
}

async function notifyEvaluator(db: D1Database, reportId: string, userId: string, label: string, by: string | null, fromOffer: boolean) {
  const u = await db.prepare("SELECT email, COALESCE(NULLIF(name, ''), email) AS name FROM users WHERE id = ? AND status NOT IN ('disabled', 'deleted')").bind(userId).first<{ email: string; name: string }>();
  if (!u) return;
  const link = await appUrl("crm", `/rapoarte/${reportId}?tab=inspectii&alocare=1`);
  const why = fromOffer ? "Clientul a acceptat oferta, iar raportul s-a creat pe numele tău" : `${by ?? "Un coleg"} ți-a dat raportul`;
  await sendEmail({
    to: u.email,
    subject: `Raport nou: ${label}`,
    text: `${why}: ${label}.\nAlocă inspecțiile și urmărește raportul din CRM: ${link}`,
    html: layout({
      eyebrow: "CRM VALUEFY",
      title: "Ai un raport nou",
      body: `<p style="margin:0 0 10px;font-size:15px;line-height:1.65;color:#4A4A4A">${esc(why)}: <strong style="color:#111111">${esc(label)}</strong>.</p>
<p style="margin:0;font-size:15px;line-height:1.65;color:#4A4A4A">Pasul următor: alocă inspecțiile pentru fiecare bun (ție sau unui coleg) sau marchează bunurile evaluate fără inspecție.</p>`,
      button: { label: "Deschide raportul →", url: link },
      foot: "Primești acest email pentru că ești evaluatorul principal al raportului.",
    }),
  });
}

/** Team members who can lead a report: evaluators (by role or duty), owners and administrators. */
export async function evaluatorChoices(db: D1Database) {
  return withPresence((await db.prepare(`SELECT id, COALESCE(NULLIF(name, ''), email) AS name, role, anevar_no, last_seen_at, avatar_at FROM users WHERE kind = 'internal' AND status NOT IN ('disabled', 'deleted')
      AND (role IN ('evaluator', 'owner', 'admin') OR ',' || COALESCE(duties, '') || ',' LIKE '%,evaluator,%') ORDER BY name`)
    .all<{ id: string; name: string; role: string; anevar_no: string | null; last_seen_at: string | null; avatar_at: string | null }>()).results)
    .map((u) => ({ ...u, sub: u.anevar_no ? `Evaluator ANEVAR ${u.anevar_no}` : u.role === "owner" ? "Proprietar" : u.role === "admin" ? "Administrator" : "Evaluator" }));
}
