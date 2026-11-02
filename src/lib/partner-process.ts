// Server-only: a collaborator's portal order processed without an offer. The team sets the fee and the delivery term,
// then where the work is done: on VALUEFY (the report opens under a classic contract, made automatically) or on a
// collaborating firm (a collaboration order is made from it and processed at once). Either way the report gets its
// type of valuation and designated user, the asset is filled in from the order and the order's documents are put on
// it; the collaborator hears the fee and the term by email and in the portal.
import { now, uuid } from "./db";
import { audit } from "./auth";
import { bucket, getOrder, orderRef } from "./orders";
import { orderCode } from "./order-labels";
import { openDossier } from "./dossier";
import { createContractOrder } from "./contract-orders";
import { fillReportAssets, parseAssets, processBankOrder } from "./process-order";
import { guessDocKind } from "./doc-kinds";
import { appUrl } from "./site";
import { esc, layout, sendEmail } from "./email";
import type { User } from "./users";

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const id_ = (v: unknown) => (typeof v === "string" && /^[\w-]{1,80}$/.test(v) ? v : null);
const amount = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 && n < 1e7 ? Math.round(n * 100) / 100 : null;
};
export const VALUATION_KINDS = ["EPI", "EBM", "EI", "EIF"];

export async function processPartnerOrder(db: D1Database, user: User, orderId: string, b: Record<string, unknown>) {
  const o = await getOrder(db, orderId);
  if (!o) return { ok: false as const, error: "Comanda nu există." };
  if (o.source !== "partner") return { ok: false as const, error: "Doar comenzile colaboratorilor din portal se procesează așa." };
  if (o.linked_order_id || (await db.prepare("SELECT 1 AS x FROM reports WHERE order_id = ?").bind(orderId).first())) return { ok: false as const, error: "Comanda e deja procesată." };

  // 1. fee and term
  const fee = amount(b.fee);
  if (fee == null) return { ok: false as const, error: "Completează tariful (fără TVA)." };
  const term = Math.round(Number(b.term_days));
  if (!Number.isFinite(term) || term < 1 || term > 180) return { ok: false as const, error: "Completează termenul de predare (zile lucrătoare)." };
  const urgent = b.urgent === true;
  // 2. where
  const where = b.where === "collab" ? "collab" : "intern";
  const collabId = id_(b.collaboration_id);
  if (where === "collab" && !collabId) return { ok: false as const, error: "Alege firma colaboratoare." };
  // 3. report and client
  const c = (b.client ?? {}) as Record<string, unknown>;
  const name = str(c.name, 160);
  if (!name) return { ok: false as const, error: "Completează numele clientului." };
  const kinds = (Array.isArray(b.valuation_types) ? b.valuation_types : []).filter((x): x is string => typeof x === "string" && VALUATION_KINDS.includes(x));
  if (!kinds.length) return { ok: false as const, error: "Alege tipul evaluării (EPI, EBM…)." };
  const clientOnly = b.client_only === true;
  const recipient = clientOnly ? null : id_(b.recipient_id);
  if (!clientOnly && !recipient) return { ok: false as const, error: "Alege utilizatorul desemnat (banca) sau bifează „Doar clientul”." };
  const rec = recipient ? await db.prepare("SELECT id, name, code FROM entities WHERE id = ? AND kind <> 'valuation_firm'").bind(recipient).first<{ id: string; name: string; code: string | null }>() : null;
  if (recipient && !rec) return { ok: false as const, error: "Utilizatorul desemnat nu există." };
  const evaluator = id_(b.evaluator_id);
  if (!evaluator) return { ok: false as const, error: "Alege evaluatorul principal." };
  const parsed = parseAssets(b.assets);
  if (!parsed.ok) return parsed;
  const purpose = str(b.purpose, 120) || o.purpose || "", reportType = str(b.report_type, 120) || o.report_type || "Raport de evaluare";
  const valueType = str(b.value_type, 120) || null;

  let reportId: string, workOrder = orderId;
  if (where === "intern") {
    // VALUEFY: the order itself opens the report (a classic contract is made with it), as a bank order is processed
    await db.prepare("UPDATE orders SET bank_id = ?, bank = ?, urgent = ?, updated_at = ? WHERE id = ?").bind(rec?.id ?? null, rec ? rec.code || rec.name : null, urgent ? 1 : 0, now(), orderId).run();
    const r = await processBankOrder(db, user, orderId, {
      client: c, bank: { purpose, report_type: reportType },
      dossier: { fee, evaluator_id: evaluator, verifier_id: id_(b.verifier_id), urgent },
      assets: b.assets,
    });
    if (!r.ok) return r;
    reportId = r.report;
  } else {
    // a collaborating firm: a collaboration order made from this one (the collaborator stays the one who brought it)
    const made = await createContractOrder(db, user.id, {
      kind: "collab", collaboration_id: collabId, client_name: name, client_phone: str(c.phone, 40) || o.client_phone || "", client_email: str(c.email, 160) || o.client_email || "",
      client_kind: c.kind === "company" ? "company" : "person", client_cui: str(c.cui, 20), recipient_id: rec?.id ?? "", client_only: clientOnly,
      purpose, report_type: reportType, fee, urgent, report_number: str(b.report_number, 30), referral_id: o.created_by ?? "",
      notes: `Din comanda portal ${orderCode(o)}${o.partner_name ? ` · ${o.partner_name}` : ""}`,
    }, parsed.assets);
    if (!made.ok) return made;
    workOrder = made.id;
    const r = await openDossier(db, made.id, { id: user.id, name: user.name }, { evaluator_id: evaluator, verifier_id: id_(b.verifier_id) });
    if (!r.ok) return r;
    reportId = r.id;
    if (r.created && r.assetId) {
      const f = await fillReportAssets(db, user.id, r.id, r.assetId, parsed.assets, { name, phone: str(c.phone, 40) });
      if (!f.ok) return f;
    }
    await db.prepare("UPDATE orders SET linked_order_id = ?, status = 'in_progress', fee = ?, urgent = ?, client_name = ?, processed_at = ?, updated_at = ? WHERE id = ?")
      .bind(made.id, fee, urgent ? 1 : 0, name, now(), now(), orderId).run();
  }
  // the report's term, type of valuation, value type and designated user
  await db.prepare("UPDATE reports SET term_days = ?, valuation_types = ?, value_type = COALESCE(?, value_type), recipient_id = ?, updated_at = ? WHERE id = ?")
    .bind(term, kinds.join(","), valueType, rec?.id ?? null, now(), reportId).run();
  await db.prepare("UPDATE orders SET processed_at = COALESCE(processed_at, ?) WHERE id = ?").bind(now(), orderId).run();

  // the order's documents on the main asset of the report (a copy each: the order keeps its own)
  const copied = await copyDocs(db, orderId, reportId, user.id);
  await audit(db, `user:${user.id}`, "order.processed", "order", orderId,
    `${where === "collab" ? "pe colaborare" : "VALUEFY"} · ${fee.toLocaleString("ro-RO")} lei + TVA · ${term} zile${copied ? ` · ${copied} acte la bun` : ""}`);
  if (workOrder !== orderId) await audit(db, `user:${user.id}`, "order.create", "order", workOrder, `din comanda portal ${orderCode(o)}`);
  await notifyPartner(db, orderId, fee, term, urgent).catch((e) => console.error("partner notice", e));
  return { ok: true as const, report: reportId };
}

async function copyDocs(db: D1Database, orderId: string, reportId: string, actor: string) {
  const main = await db.prepare("SELECT id FROM assets WHERE report_id = ? ORDER BY is_main DESC, rowid LIMIT 1").bind(reportId).first<{ id: string }>();
  const { results } = await db.prepare("SELECT filename, content_type, size_bytes, r2_key FROM order_documents WHERE order_id = ? ORDER BY created_at").bind(orderId)
    .all<{ filename: string; content_type: string | null; size_bytes: number; r2_key: string }>();
  const r2 = await bucket();
  if (!r2 || !main) return 0;
  let n = 0;
  for (const d of results) {
    const obj = await r2.get(d.r2_key).catch(() => null);
    if (!obj) continue;
    const id = uuid(), safe = d.filename.replace(/[^\w.\-() ăâîșțĂÂÎȘȚ]/g, "_").slice(-120) || "document";
    const key = `reports/${reportId}/${id}-${safe}`;
    await r2.put(key, await obj.arrayBuffer(), { httpMetadata: { contentType: d.content_type ?? obj.httpMetadata?.contentType ?? "application/octet-stream" }, customMetadata: { report: reportId, kind: "source", order: orderId } });
    await db.prepare("INSERT INTO report_documents (id, report_id, kind, filename, content_type, size_bytes, r2_key, uploaded_by, doc_type, asset_id) VALUES (?, ?, 'source', ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, reportId, safe, d.content_type, d.size_bytes, key, actor, guessDocKind(safe), main.id).run();
    n++;
  }
  return n;
}

/** The collaborator hears the fee and the term (the same shows in the portal). */
async function notifyPartner(db: D1Database, orderId: string, fee: number, term: number, urgent: boolean) {
  const o = await getOrder(db, orderId);
  if (!o?.creator_email) return;
  const ref = o.seq ? orderRef(o.seq) : orderCode(o);
  const link = await appUrl("portal", `/comenzi/${o.id}`);
  const lei = `${fee.toLocaleString("ro-RO", { maximumFractionDigits: 2 })} lei + TVA`;
  const days = `${term} zile lucrătoare de la inspecție${urgent ? " (urgent)" : ""}`;
  const hello = o.creator_name ? `Bună, ${o.creator_name.split(" ")[0]}!` : "Bună!";
  const rows = [["Onorariu", lei], ["Termen de predare", days], ["Client", o.client_name ?? "—"]];
  const table = `<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0">${rows
    .map(([k, v]) => `<tr><td style="padding:6px 0;color:#6B6B85;width:140px;vertical-align:top">${k}</td><td style="padding:6px 0;font-weight:bold">${esc(v)}</td></tr>`).join("")}</table>`;
  await sendEmail({
    to: o.creator_email,
    subject: `Comanda ${ref} e confirmată: ${lei}, ${term} zile`,
    text: `${hello}\nComanda ${ref} a fost confirmată și e în lucru.\nOnorariu: ${lei}\nTermen: ${days}\nUrmărește comanda: ${link}`,
    html: layout({
      eyebrow: `Comanda ${ref}`, title: `${hello} Comanda e confirmată.`,
      body: `<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#4A4A4A">Am preluat comanda și o lucrăm. Te sunăm pentru programarea inspecției.</p>${table}`,
      button: { label: "Vezi comanda →", url: link }, foot: "Stadiul evaluării (inspecție, redactare, livrare) se vede oricând în portal.",
    }),
  });
}
