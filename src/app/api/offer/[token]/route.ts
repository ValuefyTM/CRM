import { audit } from "@/lib/auth";
import { getDb, now } from "@/lib/db";
import { err, json } from "@/lib/api";
import { getOrder } from "@/lib/orders";
import { isExpired, offerByToken, offerHash } from "@/lib/offers";
import { sendAcceptedEmails, sendDeclinedEmail } from "@/lib/offer-emails";
import { openDossier } from "@/lib/dossier";
import { sendForSignature } from "@/lib/contract-sign";

/**
 * Public: the client answers an offer from its page. The secret token in the link is the authorisation.
 * `{ action: "accept", name, signature, agree, urgent }` or `{ action: "decline", reason }`.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const db = await getDb();
  if (!db) return err("Serviciul nu este disponibil momentan.", 503);
  const offer = await offerByToken(db, (await params).token);
  if (!offer || offer.status === "draft") return err("Oferta nu există.", 404);
  if (offer.status === "accepted") return err("Oferta a fost deja acceptată.", 409);
  if (offer.status === "declined") return err("Oferta a fost refuzată. Contactează-ne pentru o ofertă nouă.", 409);
  if (isExpired(offer)) return err("Oferta a expirat. Contactează-ne pentru o ofertă actualizată.", 410);
  const order = await getOrder(db, offer.order_id);
  if (!order) return err("Oferta nu există.", 404);
  const b = await json(req);

  if (b.action === "decline") {
    const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 1000) : "";
    await db.prepare("UPDATE offers SET status = 'declined', declined_at = ?, decline_reason = ?, updated_at = ? WHERE id = ? AND status = 'sent'")
      .bind(now(), reason || null, now(), offer.id).run();
    await audit(db, "client:offer", "offer.declined", "order", order.id, `${offer.number}${reason ? ` · ${reason}` : ""}`);
    await sendDeclinedEmail({ ...offer, decline_reason: reason || null }, order);
    return Response.json({ ok: true });
  }

  if (b.action !== "accept") return err("Acțiune necunoscută.");
  const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ").slice(0, 120) : "";
  if (name.length < 3 || !name.includes(" ")) return err("Scrie numele și prenumele complet.");
  const sig = typeof b.signature === "string" ? b.signature : "";
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length < 1500) return err("Semnează în chenar înainte de a accepta.");
  if (sig.length > 400_000) return err("Semnătura este prea mare. Șterge-o și semnează din nou.");
  if (b.agree !== true) return err("Bifează acordul cu oferta și termenii de referință.");
  const urgent = b.urgent === true && !!offer.urgent_fee;
  const at = now();
  const hash = await offerHash(offer, urgent);
  const res = await db
    .prepare(`UPDATE offers SET status = 'accepted', accepted_at = ?, accepted_name = ?, accepted_urgent = ?, signature = ?, accepted_ip = ?, accepted_ua = ?,
      content_hash = ?, updated_at = ? WHERE id = ? AND status = 'sent'`)
    .bind(at, name, urgent ? 1 : 0, sig, req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? null,
      (req.headers.get("user-agent") ?? "").slice(0, 300), hash, at, offer.id)
    .run();
  if (!res.meta.changes) return err("Oferta a fost deja actualizată. Reîncarcă pagina.", 409);
  if (urgent && !order.urgent) await db.prepare("UPDATE orders SET urgent = 1, updated_at = ? WHERE id = ?").bind(at, order.id).run();
  await audit(db, "client:offer", "offer.accepted", "order", order.id, `${offer.number} · semnată de ${name}${urgent ? " · urgent" : ""}`);
  await sendAcceptedEmails({ ...offer, status: "accepted", accepted_at: at, accepted_name: name, accepted_urgent: urgent ? 1 : 0 }, order);
  // The signed offer opens the report file on the offer's evaluator, who then gives the inspection.
  // A failure here must not undo the signature: the team can still open it from the order page.
  let contract: string | null = null;
  try {
    const r = await openDossier(db, order.id, null);
    // The signed offer becomes the classic contract: it goes to the client to complete the billing details and sign.
    const email = offer.client_email ?? order.client_email ?? order.creator_email;
    if (r.ok && r.created && r.contract && email) {
      const s = await sendForSignature(db, "client:offer", r.contract.id, email);
      if (s.ok) contract = s.link;
    }
  } catch (e) { console.error("openDossier", e); }
  return Response.json({ ok: true, contract });
}
