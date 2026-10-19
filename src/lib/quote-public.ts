// Server-only: the public page of an offer from Oferte, at portal.valuefy.ro/oferta/<token> — the same page as the
// offers made on orders (OfferView), fed from the quote. The client reads it, accepts and signs it (or declines);
// the team then converts the quote into work from the CRM.
import { now } from "./db";
import { audit } from "./auth";
import { randomToken } from "./crypto";
import { getBilling } from "./billing";
import { parseAssets, propertyType } from "./process-order";
import { DOCS, type PropertyType } from "./order-labels";
import type { Order } from "./orders";
import { DEFAULT_APPROACHES, DEFAULT_PAYMENT_TERMS, defaultTerms, objectFor, offerHash, standardsFor, valueTypeFor, type Offer } from "./offers";
import { sendAcceptedEmails, sendDeclinedEmail, sendOfferEmail } from "./offer-emails";
import { getQuote, quoteAssets, quoteCode, type Quote } from "./quotes";

export const quoteByToken = (db: D1Database, token: string) =>
  token.length >= 20 ? db.prepare("SELECT id FROM quotes WHERE token = ?").bind(token).first<{ id: string }>().then((r) => (r ? getQuote(db, r.id) : null)) : Promise.resolve(null);

/** The quote's public link needs a token: made once, kept. */
export async function ensureQuoteToken(db: D1Database, q: Quote) {
  if (q.token) return q.token;
  const token = randomToken();
  await db.prepare("UPDATE quotes SET token = ? WHERE id = ? AND token IS NULL").bind(token, q.id).run();
  return (await getQuote(db, q.id))?.token ?? token;
}

const plusDays = (n: number) => new Date(Date.now() + n * 86400000).toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });

/**
 * The quote as the public page and the emails see it: an offer and an order built from its data (nothing is stored
 * as such). The terms of reference are the standard ones, from the quote's facts — the same at every render, so the
 * signed content hash is stable.
 */
export async function quoteAsOffer(db: D1Database, q: Quote): Promise<{ offer: Offer; order: Order }> {
  const [billing, author] = await Promise.all([
    getBilling(db),
    q.created_by ? db.prepare("SELECT id, COALESCE(NULLIF(name, ''), email) AS name, anevar_no, phone FROM users WHERE id = ?").bind(q.created_by).first<{ id: string; name: string; anevar_no: string | null; phone: string | null }>() : Promise.resolve(null),
  ]);
  const raw = quoteAssets(q);
  const parsed = parseAssets(raw.map((a) => ({ ...a, contact_kind: "client", contact_name: q.client_name, contact_phone: q.client_phone })));
  const main = parsed.ok ? parsed.assets[0] : null;
  const first = raw[0] ?? {};
  const num = (v: unknown) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null; };
  const t = q.created_at;
  const order: Order = {
    id: q.id, seq: null, source: "direct", lead_id: null, created_by: q.created_by, partner_id: null, status: "received", docs_missing: 0, viewed_at: null, viewed_by: null, created_at: t, updated_at: q.updated_at,
    glide_id: null, contract_id: null, collaboration_id: q.collaboration_id, client_id: q.client_id, bank_id: null, bank_branch: null, bank_ref: null, report_type: q.report_type, fee: q.fee, share: null, fee_net: null,
    referral_order_id: null, ordered_on: null, intake: null, bank_link: null, processed_at: null, assets_json: q.assets_json, reports_json: null, statement_id: null,
    property_type: main ? propertyType(main) : null, city: String(first.city ?? "") || null, address: String(first.full_address ?? "") || null,
    surface_area: num(first.usable_area), land_area: num(first.land_area), rooms: num(first.rooms) ? Math.round(num(first.rooms)!) : null,
    purpose: q.purpose, bank: null, urgent: q.urgent, client_name: q.client_name, client_phone: q.client_phone, client_email: q.client_email,
    contact_name: null, contact_phone: null, inspection_notes: q.inspection_notes, may_contact_client: 1, notes: q.notes,
    creator_name: author?.name ?? null, creator_email: null, partner_name: null, doc_count: 0, collab_firm: q.collab_firm, contract_number: null, contract_kind: null,
    bank_logo: null, report_id: q.report_id, report_number: q.report_number,
  };
  const object = objectFor(order), valueType = valueTypeFor(q.purpose);
  const type = (order.property_type && DOCS[order.property_type as PropertyType] ? order.property_type : "other") as PropertyType;
  const status: Offer["status"] = q.status === "accepted" || q.status === "converted" ? "accepted" : q.status === "declined" ? "declined" : q.status === "sent" ? "sent" : "draft";
  const offer: Offer = {
    id: q.id, order_id: q.id, number: quoteCode(q), token: q.token ?? "", status,
    client_name: q.client_name, client_email: q.client_email,
    fee: q.fee ?? 0, travel_fee: null, travel_label: null, urgent_fee: null, vat_rate: billing.vatPercent,
    term_days: q.term_days ?? 3, urgent_days: null, valid_until: q.valid_until ?? plusDays(14), payment_terms: q.payment_terms ?? DEFAULT_PAYMENT_TERMS,
    evaluator_id: author?.id ?? null, message: q.message, object_text: object, value_type: valueType, approaches: DEFAULT_APPROACHES, standards: standardsFor(q.purpose),
    documents: JSON.stringify(DOCS[type].map((d) => ({ label: d.label, received: false, optional: d.optional }))),
    terms: defaultTerms(order, { evaluator: author?.name ?? null, anevar: author?.anevar_no ?? null, object, valueType, client: q.client_name }),
    sent_at: q.sent_at, sent_to: q.sent_to, viewed_at: q.viewed_at,
    accepted_at: status === "accepted" ? q.decided_at : null, accepted_name: q.accepted_name, accepted_urgent: 0, signature: q.signature, accepted_ip: q.accepted_ip,
    content_hash: q.content_hash, declined_at: status === "declined" ? q.decided_at : null, decline_reason: q.decline_reason,
    created_by: q.created_by, created_at: q.created_at, updated_at: q.updated_at,
    evaluator_name: author?.name ?? null, evaluator_anevar: author?.anevar_no ?? null, evaluator_phone: author?.phone ?? null,
  };
  return { offer, order };
}

/** Emails the quote to the client (its public page) and marks it sent. `message`: a personal line on top of the page and in the email. */
export async function sendQuote(db: D1Database, actor: string, id: string, to: string, message: string | null) {
  const q = await getQuote(db, id);
  if (!q) return { ok: false as const, error: "Oferta nu există." };
  if (q.status === "converted" || q.status === "accepted") return { ok: false as const, error: "Oferta e deja acceptată." };
  if (!q.fee) return { ok: false as const, error: "Completează onorariul înainte de a trimite oferta." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false as const, error: "Emailul clientului nu pare corect." };
  const t = now();
  const token = await ensureQuoteToken(db, q);
  await db.prepare(`UPDATE quotes SET status = 'sent', sent_at = ?, sent_via = 'email', sent_to = ?, client_email = COALESCE(client_email, ?), message = ?, valid_until = COALESCE(valid_until, ?),
      decided_at = NULL, decline_reason = NULL, updated_at = ? WHERE id = ?`).bind(t, to, to, message, plusDays(14), t, id).run();
  const fresh = (await getQuote(db, id))!;
  const { offer, order } = await quoteAsOffer(db, fresh);
  const emailed = await sendOfferEmail({ ...offer, token }, order, to);
  await audit(db, `user:${actor}`, "quote.sent", "quote", id, `email → ${to}${emailed ? "" : " (email netrimis)"}`);
  return { ok: true as const, token, emailed };
}

/** The client's answer from the public page (the token is the authorisation). */
export async function answerQuote(db: D1Database, q: Quote, b: Record<string, unknown>, req: Request) {
  if (q.status === "accepted" || q.status === "converted") return { ok: false as const, error: "Oferta a fost deja acceptată.", status: 409 };
  if (q.status === "declined") return { ok: false as const, error: "Oferta a fost refuzată. Contactează-ne pentru o ofertă nouă.", status: 409 };
  const { offer, order } = await quoteAsOffer(db, q);
  if (offer.valid_until < new Date().toISOString().slice(0, 10)) return { ok: false as const, error: "Oferta a expirat. Contactează-ne pentru o ofertă actualizată.", status: 410 };
  const at = now();
  const crm = `/oferte/${q.id}`;
  if (b.action === "decline") {
    const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 1000) : "";
    await db.prepare("UPDATE quotes SET status = 'declined', decided_at = ?, decline_reason = ?, updated_at = ? WHERE id = ? AND status <> 'converted'").bind(at, reason || null, at, q.id).run();
    await audit(db, "client:offer", "quote.declined", "quote", q.id, `de client${reason ? ` · ${reason}` : ""}`);
    await sendDeclinedEmail({ ...offer, status: "declined", declined_at: at, decline_reason: reason || null }, order, crm);
    return { ok: true as const };
  }
  if (b.action !== "accept") return { ok: false as const, error: "Acțiune necunoscută.", status: 400 };
  const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ").slice(0, 120) : "";
  if (name.length < 3 || !name.includes(" ")) return { ok: false as const, error: "Scrie numele și prenumele complet.", status: 400 };
  const sig = typeof b.signature === "string" ? b.signature : "";
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length < 1500) return { ok: false as const, error: "Semnează în chenar înainte de a accepta.", status: 400 };
  if (sig.length > 400_000) return { ok: false as const, error: "Semnătura este prea mare. Șterge-o și semnează din nou.", status: 400 };
  if (b.agree !== true) return { ok: false as const, error: "Bifează acordul cu oferta și termenii de referință.", status: 400 };
  const hash = await offerHash(offer, false);
  const res = await db.prepare(`UPDATE quotes SET status = 'accepted', decided_at = ?, decline_reason = NULL, accepted_name = ?, signature = ?, accepted_ip = ?, content_hash = ?, updated_at = ?
      WHERE id = ? AND status IN ('draft', 'sent')`)
    .bind(at, name, sig, req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? null, hash, at, q.id).run();
  if (!res.meta.changes) return { ok: false as const, error: "Oferta a fost deja actualizată. Reîncarcă pagina.", status: 409 };
  await audit(db, "client:offer", "quote.accepted", "quote", q.id, `semnată de ${name}`);
  await sendAcceptedEmails({ ...offer, status: "accepted", accepted_at: at, accepted_name: name, accepted_urgent: 0 }, order, crm);
  return { ok: true as const };
}
