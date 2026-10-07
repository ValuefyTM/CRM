// Server-only: the client signs the classic contract online. A secret link (portal.valuefy.ro/contract/<token>) is
// sent by email — by hand from the contract page, or by itself when the client accepts an offer. The client completes
// the billing details the contract needs, reads it and signs; what was signed is kept as a snapshot with its hash.
import { now } from "./db";
import { audit } from "./auth";
import { randomToken, sha256, validEmail } from "./crypto";
import { appUrl } from "./site";
import { esc, layout, sendEmail } from "./email";
import { teamInbox } from "./order-emails";
import { contractDoc, type ContractDocData } from "./contract-doc";
import { getFirmWithImages } from "./settings";

export type SignContract = {
  id: string; kind: string; number: string | null; client_id: string | null; client: string | null; client_kind: string | null; client_email: string | null;
  sign_token: string | null; sign_sent_at: string | null; sign_sent_to: string | null; sign_viewed_at: string | null; signed_at: string | null; signed_name: string | null;
  signed_ip: string | null; signed_hash: string | null;
};
const SELECT = `SELECT k.id, k.kind, k.number, k.client_id, e.name AS client, e.kind AS client_kind, e.email AS client_email, k.sign_token, k.sign_sent_at, k.sign_sent_to,
  k.sign_viewed_at, k.signed_at, k.signed_name, k.signed_ip, k.signed_hash FROM contracts k LEFT JOIN entities e ON e.id = k.client_id`;

export const signContractById = (db: D1Database, id: string) => db.prepare(`${SELECT} WHERE k.id = ?`).bind(id).first<SignContract>();
export const contractByToken = (db: D1Database, token: string) =>
  token.length >= 20 ? db.prepare(`${SELECT} WHERE k.sign_token = ?`).bind(token).first<SignContract>() : Promise.resolve(null);
export const signLink = (token: string) => appUrl("portal", `/contract/${token}`);

/** Firms recorded as persons in Glide are told apart by their legal form. */
export const isCompany = (kind: string | null, name: string | null) =>
  kind !== "person" || /\b(S\.?R\.?L|S\.?A|PFA|S\.?C\.?S|S\.?N\.?C|II|IF)\.?$|\bSRL\b/i.test((name ?? "").trim());

/** What the contract still needs from the client before it can be signed. */
export function billingMissing(d: ContractDocData) {
  const k = d.contract;
  const company = isCompany(k.client_kind, k.client);
  const miss: string[] = [];
  if (!k.billing_address?.trim()) miss.push("adresa de facturare");
  if (company && !k.cui?.trim()) miss.push("CUI");
  if (company && !k.reg_no?.trim()) miss.push("nr. de înregistrare");
  if (company && !k.rep?.trim()) miss.push("reprezentantul legal");
  return miss;
}

/** Sends (or sends again) the signing link to the client. Contracts already signed cannot be sent. */
export async function sendForSignature(db: D1Database, actor: string, id: string, to: string) {
  const k = await signContractById(db, id);
  if (!k) return { ok: false as const, error: "Contractul nu există." };
  if (k.kind !== "classic") return { ok: false as const, error: "Doar contractele clasice se semnează online." };
  if (k.signed_at) return { ok: false as const, error: "Contractul este deja semnat." };
  const email = to.trim().toLowerCase();
  if (!validEmail(email)) return { ok: false as const, error: "Emailul clientului nu pare corect." };
  const token = k.sign_token ?? randomToken();
  const t = now();
  await db.prepare("UPDATE contracts SET sign_token = ?, sign_sent_at = ?, sign_sent_to = ?, updated_at = ? WHERE id = ?").bind(token, t, email, t, id).run();
  // The client's email is kept on the client when it had none.
  if (k.client_id) await db.prepare("UPDATE entities SET email = ? WHERE id = ? AND (email IS NULL OR email = '')").bind(email, k.client_id).run();
  const link = await signLink(token);
  const sent = await sendEmail({
    to: email,
    subject: `Contractul de prestări servicii nr. ${k.number ?? ""} — VALUEFY`,
    text: `Bună ziua,\n\nVă trimitem contractul de prestări servicii nr. ${k.number ?? ""}. Îl puteți citi și semna online, în câteva minute: ${link}\n\nEchipa VALUEFY`,
    html: layout({
      eyebrow: "CONTRACT DE PRESTĂRI SERVICII",
      title: `Contractul nr. ${esc(k.number ?? "")} este gata de semnat`,
      body: `<p style="margin:0 0 10px;font-size:15px;line-height:1.65;color:#4A4A4A">Bună ziua${k.client ? `, <strong style="color:#111111">${esc(k.client)}</strong>` : ""}!</p>
<p style="margin:0 0 10px;font-size:15px;line-height:1.65;color:#4A4A4A">Contractul de prestări servicii pentru evaluare este pregătit. Completați datele de facturare (dacă lipsesc), citiți contractul și semnați-l online, cu degetul sau cu mouse-ul.</p>
<p style="margin:0;font-size:13px;line-height:1.6;color:#6B6B85">Contractul semnat are aceeași valoare ca cel pe hârtie. Primiți o copie pe email după semnare.</p>`,
      button: { label: "Citește și semnează contractul →", url: link },
      foot: "Linkul este personal: nu îl redirecționați altor persoane.",
    }),
  });
  await audit(db, actor, "contract.sign_sent", "contract", id, `către ${email}${sent ? "" : " (email neconfigurat)"}`);
  return { ok: true as const, link, sent };
}

/** The client's billing details, completed on the signing page (only before signing). */
export async function saveBilling(db: D1Database, k: SignContract, b: Record<string, unknown>) {
  if (k.signed_at) return { ok: false as const, error: "Contractul este deja semnat." };
  if (!k.client_id) return { ok: false as const, error: "Contractul nu are client." };
  const s = (key: string, max = 200) => (typeof b[key] === "string" ? (b[key] as string).trim().replace(/\s+/g, " ").slice(0, max) : "");
  const address = s("address", 300), city = s("city", 80), county = s("county", 60);
  if (!address || !city) return { ok: false as const, error: "Completează adresa și localitatea." };
  const company = isCompany(k.client_kind, k.client);
  const cui = s("cui", 20).toUpperCase().replace(/\s/g, ""), reg = s("reg_no", 40).toUpperCase(), rep = s("rep", 120), role = s("rep_role", 60);
  if (company && (!cui || !reg || !rep)) return { ok: false as const, error: "Completează CUI-ul, nr. de înregistrare și reprezentantul legal." };
  const t = now();
  await db.prepare("UPDATE entities SET billing_address = ?, city = ?, county = COALESCE(NULLIF(?, ''), county), cui = COALESCE(NULLIF(?, ''), cui), reg_no = COALESCE(NULLIF(?, ''), reg_no), updated_at = ? WHERE id = ?")
    .bind(address, city, county, cui, reg, t, k.client_id).run();
  if (company && rep) {
    const c = await db.prepare("SELECT id FROM entity_contacts WHERE entity_id = ? ORDER BY is_primary DESC, created_at LIMIT 1").bind(k.client_id).first<{ id: string }>();
    if (c) await db.prepare("UPDATE entity_contacts SET name = ?, role = COALESCE(NULLIF(?, ''), role), is_primary = 1 WHERE id = ?").bind(rep, role, c.id).run();
    else await db.prepare("INSERT INTO entity_contacts (id, entity_id, name, role, is_primary, created_at) VALUES (?, ?, ?, ?, 1, ?)").bind(crypto.randomUUID(), k.client_id, rep, role || "Administrator", t).run();
  }
  await audit(db, "client:contract", "client.update", "client", k.client_id, `date de facturare completate la semnarea contractului ${k.number ?? ""}`);
  return { ok: true as const };
}

/**
 * Signs the contract: the document as shown (contract, client, terms, VALUEFY's details and seal) is frozen into a
 * snapshot with its hash, next to the client's name, drawn signature, IP and browser.
 */
export async function signContract(db: D1Database, k: SignContract, v: { name: string; signature: string }, ip: string | null, ua: string) {
  if (k.signed_at) return { ok: false as const, error: "Contractul este deja semnat." };
  const [doc, firm] = await Promise.all([contractDoc(db, k.id), getFirmWithImages(db)]);
  if (!doc) return { ok: false as const, error: "Contractul nu există." };
  const missing = billingMissing(doc);
  if (missing.length) return { ok: false as const, error: `Completează întâi: ${missing.join(", ")}.` };
  const snapshot = JSON.stringify({ doc, firm });
  const hash = await sha256(snapshot);
  const at = now();
  const res = await db.prepare(`UPDATE contracts SET signed_at = ?, signed_name = ?, signed_signature = ?, signed_ip = ?, signed_ua = ?, signed_hash = ?, signed_snapshot = ?, updated_at = ?
      WHERE id = ? AND signed_at IS NULL`).bind(at, v.name, v.signature, ip, ua.slice(0, 300), hash, snapshot, at, k.id).run();
  if (!res.meta.changes) return { ok: false as const, error: "Contractul a fost deja semnat." };
  await audit(db, "client:contract", "contract.signed", "contract", k.id, `semnat de ${v.name}${ip ? ` · IP ${ip}` : ""} · amprentă ${hash.slice(0, 12)}`);
  const link = await signLink(k.sign_token!);
  const to = k.sign_sent_to ?? k.client_email;
  if (to) await sendEmail({
    to, subject: `Contract semnat nr. ${k.number ?? ""} — VALUEFY`,
    text: `Mulțumim! Contractul nr. ${k.number ?? ""} a fost semnat. Îl puteți descărca oricând de aici: ${link}`,
    html: layout({
      eyebrow: "CONTRACT SEMNAT", title: `Contractul nr. ${esc(k.number ?? "")} a fost semnat`,
      body: `<p style="margin:0;font-size:15px;line-height:1.65;color:#4A4A4A">Mulțumim, ${esc(v.name)}! Contractul este semnat de ambele părți. Îl puteți vedea și descărca (PDF) oricând de la linkul de mai jos.</p>`,
      button: { label: "Vezi contractul semnat →", url: link }, foot: "Păstrați acest email pentru evidență.",
    }),
  }).catch(() => false);
  const crm = await appUrl("crm", `/contracte/${k.id}`);
  for (const inbox of teamInbox())
    await sendEmail({
      to: inbox, subject: `Contract semnat online: nr. ${k.number ?? ""} · ${k.client ?? ""}`,
      text: `${v.name} a semnat contractul nr. ${k.number ?? ""}. ${crm}`,
      html: layout({ eyebrow: "CRM VALUEFY", title: "Contract semnat online", body: `<p style="margin:0;font-size:15px;line-height:1.65;color:#4A4A4A"><strong>${esc(v.name)}</strong> a semnat contractul nr. ${esc(k.number ?? "")} (${esc(k.client ?? "")}).</p>`, button: { label: "Deschide contractul →", url: crm }, foot: "Notificare automată din CRM." }),
    }).catch(() => false);
  return { ok: true as const };
}
