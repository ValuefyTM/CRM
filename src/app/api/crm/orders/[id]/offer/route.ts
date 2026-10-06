import { audit } from "@/lib/auth";
import { now } from "@/lib/db";
import { err, json, staffApi } from "@/lib/api";
import { getOrder } from "@/lib/orders";
import { offerForOrder, saveOffer, validateOffer } from "@/lib/offers";
import { offerLink, sendOfferEmail } from "@/lib/offer-emails";

/**
 * `action: "save"` saves the offer of an order from the form (then the team looks at the preview);
 * `action: "send"` emails the saved offer to the client — only from the preview, so what is sent is what was seen.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const { id } = await params;
  const order = await getOrder(a.db, id);
  if (!order) return err("Comanda nu există.", 404);
  const b = await json(req);
  const actor = `user:${a.user.id}`;

  if (b.action === "send") {
    const offer = await offerForOrder(a.db, id);
    if (!offer || offer.status === "accepted" || offer.status === "declined") return err("Nu există o ofertă de trimis.", 409);
    if (!offer.client_email) return err("Oferta nu are emailul clientului. Modifică oferta și completează-l.");
    await a.db.prepare("UPDATE offers SET status = 'sent', sent_at = ?, sent_to = ?, updated_at = ? WHERE id = ?").bind(now(), offer.client_email, now(), offer.id).run();
    const sent = (await offerForOrder(a.db, id))!;
    const emailed = await sendOfferEmail(sent, order, offer.client_email);
    await audit(a.db, actor, "offer.sent", "order", id, `${offer.number} → ${offer.client_email}${emailed ? "" : " (email netrimis)"}`);
    return Response.json({ ok: true, number: offer.number, link: await offerLink(sent), emailed });
  }

  const v = validateOffer(b);
  if (!v.ok) return err(v.error);
  const r = await saveOffer(a.db, id, v.value, a.user.id);
  if (!r.ok) return err(r.error, 409);
  const offer = (await offerForOrder(a.db, id))!;
  if (r.created) await audit(a.db, actor, "offer.create", "order", id, offer.number);
  return Response.json({ ok: true, number: offer.number, link: await offerLink(offer) });
}
