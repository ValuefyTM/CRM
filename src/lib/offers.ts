// Server-only: valuation offers. The team prepares the offer on an order, the client opens it on a public page
// (portal.valuefy.ro/oferta/<token>), and accepts it by signing — which also accepts the terms of reference.
import { now, uuid } from "./db";
import { randomToken, sha256, validEmail } from "./crypto";
import { DOCS, propertyLabel, type PropertyType } from "./order-labels";
import type { Order, OrderDocument } from "./orders";

export type OfferDoc = { label: string; received: boolean; optional?: boolean };

export type Offer = {
  id: string; order_id: string; number: string; token: string; status: "draft" | "sent" | "accepted" | "declined";
  client_name: string | null; client_email: string | null;
  fee: number; travel_fee: number | null; travel_label: string | null; urgent_fee: number | null; vat_rate: number;
  term_days: number; urgent_days: number | null; valid_until: string; payment_terms: string | null;
  evaluator_id: string | null; message: string | null; object_text: string | null; value_type: string | null; approaches: string | null; standards: string | null;
  documents: string | null; terms: string | null;
  sent_at: string | null; sent_to: string | null; viewed_at: string | null;
  accepted_at: string | null; accepted_name: string | null; accepted_urgent: number | null; signature: string | null; accepted_ip: string | null;
  content_hash: string | null; declined_at: string | null; decline_reason: string | null;
  created_by: string | null; created_at: string; updated_at: string;
  // joined
  evaluator_name: string | null; evaluator_anevar: string | null;
};

export const OFFER_STATUS: Record<Offer["status"], [string, string]> = {
  draft: ["Ciornă", ""],
  sent: ["Trimisă clientului", "pillInfo"],
  accepted: ["Acceptată și semnată", "pillOk"],
  declined: ["Refuzată", "pillErr"],
};

const SELECT = `SELECT f.*, COALESCE(NULLIF(u.name, ''), u.email) AS evaluator_name, u.anevar_no AS evaluator_anevar
  FROM offers f LEFT JOIN users u ON u.id = f.evaluator_id`;

export const offerForOrder = (db: D1Database, orderId: string) =>
  db.prepare(`${SELECT} WHERE f.order_id = ? ORDER BY f.created_at DESC LIMIT 1`).bind(orderId).first<Offer>();
export const offerByToken = (db: D1Database, token: string) =>
  token.length >= 20 ? db.prepare(`${SELECT} WHERE f.token = ?`).bind(token).first<Offer>() : Promise.resolve(null);

export const offerDocs = (o: Pick<Offer, "documents">): OfferDoc[] => {
  try { return JSON.parse(o.documents ?? "[]") as OfferDoc[]; } catch { return []; }
};

/** Amounts in lei. `urgent` adds the express fee when it is offered. */
export function offerTotals(o: Pick<Offer, "fee" | "travel_fee" | "urgent_fee" | "vat_rate">, urgent = false) {
  const net = o.fee + (o.travel_fee ?? 0) + (urgent && o.urgent_fee ? o.urgent_fee : 0);
  const vat = Math.round(net * o.vat_rate) / 100;
  return { net, vat, total: Math.round((net + vat) * 100) / 100 };
}
export const money = (n: number) => `${n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lei`;
/** Companies are greeted by their full name; people by their first name. */
export const isCompany = (name: string | null) => /\b(S\.?R\.?L|S\.?A|PFA|I\.?I|I\.?F|SNC|SCS|SRL-D|BANCA|BANK)\b\.?/i.test(name ?? "");
export const greetName = (name: string | null) => (!name?.trim() ? "" : isCompany(name) ? name.trim() : name.trim().split(/\s+/)[0]);

export const isExpired = (o: Pick<Offer, "valid_until">) => o.valid_until < new Date().toISOString().slice(0, 10);

/** Terms of reference split into sections ("## Title" lines start a section). */
export function termSections(text: string | null) {
  const out: { title: string; body: string }[] = [];
  for (const line of (text ?? "").split("\n")) {
    const h = line.match(/^##\s+(.+)/);
    if (h) out.push({ title: h[1].trim(), body: "" });
    else if (out.length) out[out.length - 1].body += (out[out.length - 1].body ? "\n" : "") + line;
    else if (line.trim()) out.push({ title: "", body: line });
  }
  return out.map((s) => ({ ...s, body: s.body.trim() })).filter((s) => s.title || s.body);
}

// ---------- defaults for a new offer ----------

const COMPANY = { name: "VALUEFY S.R.L.", cui: "38250411" };

function valueTypeFor(purpose: string | null) {
  const p = (purpose ?? "").toLowerCase();
  if (p.includes("credit") || p.includes("garan")) return "Valoarea de piață, în scopul garantării împrumutului.";
  if (p.includes("impoz")) return "Valoarea impozabilă a clădirii, determinată conform Codului fiscal și standardelor ANEVAR.";
  if (p.includes("raportare")) return "Valoarea justă, în scopul raportării financiare.";
  if (p.includes("anaf")) return "Valoarea de piață, în scopul constituirii garanției pentru eșalonarea la plată (ANAF).";
  return "Valoarea de piață.";
}

function standardsFor(purpose: string | null) {
  const p = (purpose ?? "").toLowerCase();
  const base = "Standardele de evaluare a bunurilor ANEVAR, ediția în vigoare";
  return p.includes("credit") || p.includes("garan") ? `${base}, inclusiv ghidul pentru evaluarea în scopul garantării împrumutului (GEV 520).` : `${base}.`;
}

function objectFor(o: Order) {
  const what = o.property_type ? propertyLabel(o.property_type) : "Proprietatea";
  const size = [o.rooms ? `${o.rooms} camere` : "", o.surface_area ? `${o.surface_area.toLocaleString("ro-RO")} m² utili` : "", o.land_area ? `teren ${o.land_area.toLocaleString("ro-RO")} m²` : ""].filter(Boolean).join(", ");
  const where = [o.address, o.city].filter(Boolean).join(", ");
  return `${what}${size ? ` (${size})` : ""}${where ? `, situat(ă) în ${where}` : ""} — dreptul de proprietate deplin.`;
}

export function defaultTerms(o: Order, f: { evaluator: string | null; anevar: string | null; object: string; valueType: string; client: string }) {
  const user = o.bank ? `${o.bank}, în calitate de finanțator, și clientul` : "clientul";
  return `## Evaluatorul
${COMPANY.name} (CUI ${COMPANY.cui}), firmă autorizată ANEVAR. Evaluator desemnat: ${f.evaluator ?? "se comunică la acceptare"}${f.anevar ? `, legitimație ANEVAR nr. ${f.anevar}` : ""}. Evaluatorul acționează independent și obiectiv și nu are niciun interes legat de bunul evaluat sau de părțile implicate.

## Clientul și utilizatorii desemnați
Client: ${f.client}. Utilizatori desemnați: ${user}. Raportul nu poate fi folosit de alte persoane sau în alt scop fără acordul scris al evaluatorului.

## Scopul evaluării
${o.purpose ?? "Conform solicitării clientului"}.

## Activul evaluat
${f.object}

## Tipul valorii
${f.valueType}

## Data evaluării și moneda
Data evaluării este data inspecției, dacă nu se convine altfel în scris. Valoarea se exprimă în lei; unde este cazul, se prezintă și echivalentul în euro la cursul BNR din data evaluării.

## Natura și amploarea investigațiilor
Inspecția vizuală a proprietății la fața locului și analiza documentelor puse la dispoziție de client. Nu se efectuează verificări juridice ale titlului de proprietate, expertize tehnice ale construcției, măsurători topografice sau investigații de mediu.

## Natura și sursa informațiilor
Documentele și informațiile furnizate de client sunt considerate corecte și complete. Informațiile de piață provin din tranzacții și oferte comparabile, baze de date de specialitate și analiza proprie a evaluatorului.

## Ipoteze și ipoteze speciale
Dreptul de proprietate este considerat valabil și transferabil, liber de sarcini, cu excepția celor menționate în extrasul de carte funciară. Nu se utilizează ipoteze speciale, cu excepția celor convenite în scris înainte de emiterea raportului.

## Restricții de utilizare, difuzare și publicare
Raportul este confidențial și destinat exclusiv clientului și utilizatorilor desemnați, în scopul precizat. Nicio parte a raportului nu poate fi publicată sau transmisă terților fără acordul scris al evaluatorului.

## Conformitatea cu standardele
Evaluarea se realizează în conformitate cu Standardele de evaluare a bunurilor ANEVAR în vigoare.

## Tipul raportului
Raport de evaluare scris, transmis în format PDF semnat electronic, împreună cu anexele relevante (fotografii, comparabile, documente).

## Onorariu
Onorariul nu depinde de valoarea rezultată din evaluare. Dacă evaluarea nu poate fi finalizată din motive care țin de client (documente indisponibile, acces refuzat la proprietate), se datorează contravaloarea lucrărilor efectuate până la acel moment.

## Confidențialitate și protecția datelor
Datele personale sunt prelucrate conform Politicii de confidențialitate VALUEFY, exclusiv pentru realizarea evaluării și îndeplinirea obligațiilor legale.`;
}

export type OfferInput = {
  client_name: string; client_email: string; fee: number; travel_fee: number | null; travel_label: string | null; urgent_fee: number | null;
  vat_rate: number; term_days: number; urgent_days: number | null; valid_until: string; payment_terms: string | null; evaluator_id: string | null;
  message: string | null; object_text: string; value_type: string; approaches: string; standards: string; documents: OfferDoc[]; terms: string;
};

/** Pre-filled values for a new offer on an order. */
export function offerDraft(o: Order, docs: Pick<OrderDocument, "kind">[], evaluator: { id: string; name: string; anevar_no: string | null } | null): OfferInput {
  const have = new Set(docs.map((d) => d.kind));
  const type = (o.property_type && DOCS[o.property_type as PropertyType] ? o.property_type : "other") as PropertyType;
  const object = objectFor(o);
  const valueType = valueTypeFor(o.purpose);
  const client = o.client_name ?? o.creator_name ?? "clientul";
  const valid = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  return {
    client_name: o.client_name ?? o.creator_name ?? "",
    client_email: o.client_email ?? o.creator_email ?? "",
    fee: 0, travel_fee: null, travel_label: o.city ? `Deplasare ${o.city}` : "Deplasare", urgent_fee: null, vat_rate: 21,
    term_days: 5, urgent_days: 2, valid_until: valid,
    payment_terms: "50% avans la acceptare, 50% la livrarea raportului. Prin card sau transfer bancar, pe baza facturii emise.",
    evaluator_id: evaluator?.id ?? null, message: null, object_text: object, value_type: valueType,
    approaches: "Abordarea prin piață (comparații directe); alte abordări, după caz, conform datelor disponibile.",
    standards: standardsFor(o.purpose),
    documents: DOCS[type].map((d) => ({ label: d.label, received: have.has(d.key), optional: d.optional })),
    terms: defaultTerms(o, { evaluator: evaluator?.name ?? null, anevar: evaluator?.anevar_no ?? null, object, valueType, client }),
  };
}

// ---------- validation and saving ----------

const str = (v: unknown, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const amount = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n < 1e7 ? Math.round(n * 100) / 100 : null;
};
const int = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 && n < 366 ? n : null; };

export function validateOffer(body: unknown): { ok: true; value: OfferInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const fee = amount(b.fee);
  if (!fee) return { ok: false, error: "Completează onorariul (fără TVA)." };
  const term = int(b.term_days);
  if (!term) return { ok: false, error: "Completează termenul de livrare (zile lucrătoare)." };
  const valid = str(b.valid_until, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valid)) return { ok: false, error: "Alege data până la care e valabilă oferta." };
  const email = str(b.client_email, 160);
  if (email && !validEmail(email)) return { ok: false, error: "Emailul clientului nu pare valid." };
  const docs = Array.isArray(b.documents)
    ? (b.documents as Record<string, unknown>[]).slice(0, 30).map((d) => ({ label: str(d?.label, 160), received: d?.received === true, optional: d?.optional === true })).filter((d) => d.label)
    : [];
  const vat = amount(b.vat_rate);
  return {
    ok: true,
    value: {
      client_name: str(b.client_name, 160), client_email: email.toLowerCase(), fee, travel_fee: amount(b.travel_fee) || null, travel_label: str(b.travel_label, 120) || null,
      urgent_fee: amount(b.urgent_fee) || null, vat_rate: vat == null ? 21 : Math.min(vat, 100), term_days: term, urgent_days: int(b.urgent_days),
      valid_until: valid, payment_terms: str(b.payment_terms, 600) || null, evaluator_id: str(b.evaluator_id, 60) || null, message: str(b.message, 2000) || null,
      object_text: str(b.object_text, 1000), value_type: str(b.value_type, 400), approaches: str(b.approaches, 600), standards: str(b.standards, 600),
      documents: docs, terms: str(b.terms, 20000),
    },
  };
}

async function nextNumber(db: D1Database) {
  const year = new Date().getFullYear();
  const row = await db.prepare("SELECT COUNT(*) AS n FROM offers WHERE number LIKE ?").bind(`OF-${year}-%`).first<{ n: number }>();
  return `OF-${year}-${String((row?.n ?? 0) + 1).padStart(4, "0")}`;
}

const COLS = ["client_name", "client_email", "fee", "travel_fee", "travel_label", "urgent_fee", "vat_rate", "term_days", "urgent_days", "valid_until", "payment_terms",
  "evaluator_id", "message", "object_text", "value_type", "approaches", "standards", "documents", "terms"] as const;
const values = (v: OfferInput) => COLS.map((c) => (c === "documents" ? JSON.stringify(v.documents) : v[c]));

/** Creates the offer for an order, or updates it while it has not been accepted. */
export async function saveOffer(db: D1Database, orderId: string, v: OfferInput, userId: string) {
  const cur = await offerForOrder(db, orderId);
  if (cur && cur.status === "accepted") return { ok: false as const, error: "Oferta a fost deja acceptată și nu mai poate fi modificată." };
  if (cur && cur.status !== "declined") {
    await db.prepare(`UPDATE offers SET ${COLS.map((c) => `${c} = ?`).join(", ")}, updated_at = ? WHERE id = ?`).bind(...values(v), now(), cur.id).run();
    return { ok: true as const, id: cur.id, created: false };
  }
  // First offer, or a new one after a refusal.
  const id = uuid();
  await db
    .prepare(`INSERT INTO offers (id, order_id, number, token, ${COLS.join(", ")}, created_by) VALUES (?, ?, ?, ?, ${COLS.map(() => "?").join(", ")}, ?)`)
    .bind(id, orderId, await nextNumber(db), randomToken(), ...values(v), userId)
    .run();
  return { ok: true as const, id, created: true };
}

/** What the client agrees to, fingerprinted at acceptance. */
export const offerHash = (o: Offer, urgent: boolean) =>
  sha256(JSON.stringify([o.number, o.fee, o.travel_fee, urgent ? o.urgent_fee : null, o.vat_rate, o.term_days, o.valid_until, o.payment_terms, o.object_text, o.value_type, o.approaches, o.standards, o.documents, o.terms]));
