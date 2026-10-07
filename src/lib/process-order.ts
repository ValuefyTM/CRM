// Server-only: processing a bank (or collaboration) order that came with only a request id and a client name.
// The team fills in — from a screenshot of the bank's app or by hand — the client, the assets and the team, and the
// report file opens with every asset in place (and, if chosen, the inspections given).
import { now, uuid } from "./db";
import { audit } from "./auth";
import { getOrder } from "./orders";
import { openDossier } from "./dossier";
import { addAsset, updateAsset, validateAsset } from "./assets";
import { assignInspection } from "./insp-assign";
import type { AssetInput } from "./asset-labels";
import type { User } from "./users";

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const id_ = (v: unknown) => (typeof v === "string" && /^[\w-]{1,80}$/.test(v) ? v : null);
const amount = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 && n < 1e7 ? Math.round(n * 100) / 100 : null;
};

/** Order property type (portal vocabulary) from the asset's category / type. */
function propertyType(a: AssetInput) {
  const t = a.type.toUpperCase();
  if (a.category === "TEREN" || a.category === "PROPRIETATE AGRICOLA" || t.startsWith("TEREN")) return "land";
  if (a.category === "COMERCIAL" || a.category === "MIXT") return "commercial";
  if (a.category === "INDUSTRIAL") return "industrial";
  if (t.includes("CASA") && !t.includes("APARTAMENT")) return "house";
  if (t.includes("APARTAMENT")) return "apartment";
  return "other";
}

export async function processBankOrder(db: D1Database, user: User, orderId: string, body: Record<string, unknown>) {
  const o = await getOrder(db, orderId);
  if (!o) return { ok: false as const, error: "Comanda nu există." };
  if (await db.prepare("SELECT 1 AS x FROM reports WHERE order_id = ?").bind(orderId).first()) return { ok: false as const, error: "Comanda are deja dosar deschis." };
  const c = (body.client ?? {}) as Record<string, unknown>;
  const bk = (body.bank ?? {}) as Record<string, unknown>;
  const d = (body.dossier ?? {}) as Record<string, unknown>;
  const name = str(c.name, 160);
  if (!name) return { ok: false as const, error: "Completează numele clientului." };
  const company = c.kind === "company";
  const raw = Array.isArray(body.assets) ? (body.assets as unknown[]).slice(0, 20) : [];
  if (!raw.length) return { ok: false as const, error: "Adaugă cel puțin un bun de evaluat." };
  const assets: AssetInput[] = [];
  for (const [i, x] of raw.entries()) {
    const v = validateAsset(x);
    if (!v.ok) return { ok: false as const, error: `Bunul ${i + 1}: ${v.error}` };
    assets.push({ ...v.value, property_id: null, is_main: i === 0 });
  }
  const evaluator = id_(d.evaluator_id);
  if (!evaluator) return { ok: false as const, error: "Alege evaluatorul principal." };
  const t = now();

  // A company client: matched by CUI (or created), so its reports gather under one client.
  let clientId: string | null = o.client_id;
  if (company && !clientId) {
    const cui = str(c.cui, 20).replace(/^RO/i, "").replace(/\D/g, "");
    const found = cui ? await db.prepare("SELECT id FROM entities WHERE kind = 'company' AND replace(upper(cui), 'RO', '') = ? LIMIT 1").bind(cui).first<{ id: string }>() : null;
    clientId = found?.id ?? uuid();
    if (!found) await db.prepare("INSERT INTO entities (id, kind, name, cui, phone, email, city, created_by) VALUES (?, 'company', ?, ?, ?, ?, ?, ?)")
      .bind(clientId, name, cui || null, str(c.phone, 40) || null, str(c.email, 160).toLowerCase() || null, assets[0].city, user.id).run();
  }

  const main = assets[0];
  const contract = o.source === "bank" ? id_(d.contract_id) ?? o.contract_id : o.contract_id;
  const extra = [str(bk.consultant, 300) && `Consultant bancă: ${str(bk.consultant, 300)}`, str(bk.notes, 2000)].filter(Boolean).join("\n");
  await db.prepare(`UPDATE orders SET client_name = ?, client_phone = ?, client_email = ?, client_id = ?, contact_name = ?, contact_phone = ?, bank_branch = ?,
      purpose = COALESCE(NULLIF(?, ''), purpose), report_type = COALESCE(NULLIF(?, ''), report_type), fee = COALESCE(?, fee), urgent = ?, contract_id = ?,
      property_type = ?, city = ?, address = ?, surface_area = ?, notes = TRIM(COALESCE(notes, '') || CASE WHEN ? <> '' THEN char(10) || ? ELSE '' END),
      processed_at = ?, updated_at = ? WHERE id = ?`)
    .bind(name, str(c.phone, 40) || null, str(c.email, 160).toLowerCase() || null, clientId,
      main.contact_kind && main.contact_kind !== "client" ? main.contact_name : null, main.contact_kind && main.contact_kind !== "client" ? main.contact_phone : null,
      str(bk.branch, 120) || o.bank_branch, str(bk.purpose, 120), str(bk.report_type, 120), amount(d.fee), d.urgent === true ? 1 : 0, contract,
      propertyType(main), main.city, main.full_address, main.usable_area, extra, extra, t, t, orderId)
    .run();

  const due = /^\d{4}-\d{2}-\d{2}$/.test(str(d.due_on, 10)) ? str(d.due_on, 10) : null;
  const r = await openDossier(db, orderId, { id: user.id, name: user.name }, { evaluator_id: evaluator, verifier_id: id_(d.verifier_id), due_on: due });
  if (!r.ok) return r;
  if (!r.created || !r.assetId) return { ok: true as const, report: r.id };

  // The file opened with the order's main asset: complete it with everything filled in, then add the others.
  // Who shows each asset: its own contact, else the client.
  const contactOf = (a: AssetInput) => a.contact_kind && a.contact_kind !== "client" && a.contact_name
    ? { kind: a.contact_kind, name: a.contact_name, phone: a.contact_phone ?? "" }
    : { kind: "client", name, phone: str(c.phone, 40) };
  for (const a of assets) { const k = contactOf(a); Object.assign(a, { contact_kind: k.kind, contact_name: k.name, contact_phone: k.phone || null }); }
  const assetIds = [{ id: r.assetId, contact: contactOf(main) }];
  const up = await updateAsset(db, user.id, r.id, r.assetId, main);
  if (!up.ok) return { ok: false as const, error: up.error };
  for (const a of assets.slice(1)) {
    const add = await addAsset(db, user.id, r.id, a);
    if (add.ok) assetIds.push({ id: add.id, contact: contactOf(a) });
  }

  // Inspections: one per asset, all to the chosen inspector (they can be reallocated one by one on the report).
  const inspector = id_(d.inspector_id);
  const problems: string[] = [];
  if (inspector) {
    for (const asset of assetIds) {
      const i = await assignInspection(db, user, r.id, {
        asset: asset.id, inspector, due_on: str(d.inspection_due, 10), contact_kind: asset.contact.kind,
        contact_name: asset.contact.name, contact_phone: asset.contact.phone, instructions: str(d.instructions, 2000),
      });
      if (!i.ok) problems.push(i.error);
    }
  }
  await audit(db, `user:${user.id}`, "order.processed", "order", orderId, `${assets.length} ${assets.length === 1 ? "bun" : "bunuri"}`);
  return { ok: true as const, report: r.id, inspectionError: problems[0] ?? null };
}
