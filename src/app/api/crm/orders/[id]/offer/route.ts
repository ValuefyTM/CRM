import { audit } from "@/lib/auth";
import { now } from "@/lib/db";
import { err, json, staffApi } from "@/lib/api";
import { getOrder } from "@/lib/orders";
import { offerForOrder, saveOffer, validateOffer } from "@/lib/offers";
import { offerLink, sendOfferEmail } from "@/lib/offer-emails";

/** Saves the offer of an order (`action: "save"`) or saves it and emails it to the client (`action: "send"`). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const { id } = await params;
  const order = await getOrder(a.db, id);
  if (!order) return err("Comanda nu există.", 404);
  const b = await json(req);
  const v = validateOffer(b);
  if (!v.ok) return err(v.error);
  const send = b.action === "send";
  if (send && !v.value.client_email) return err("Completează emailul clientului, ca să-i trimitem oferta.");
  const r = await saveOffer(a.db, id, v.value, a.user.id);
  if (!r.ok) return err(r.error, 409);
  const actor = `user:${a.user.id}`;
  let offer = (await offerForOrder(a.db, id))!;
  if (r.created) await audit(a.db, actor, "offer.create", "order", id, offer.number);
  if (!send) return Response.json({ ok: true, number: offer.number, link: await offerLink(offer) });

  await a.db.prepare("UPDATE offers SET status = 'sent', sent_at = ?, sent_to = ?, updated_at = ? WHERE id = ?").bind(now(), v.value.client_email, now(), offer.id).run();
  offer = (await offerForOrder(a.db, id))!;
  const emailed = await sendOfferEmail(offer, order, v.value.client_email);
  await audit(a.db, actor, "offer.sent", "order", id, `${offer.number} → ${v.value.client_email}${emailed ? "" : " (email netrimis)"}`);
  return Response.json({ ok: true, number: offer.number, link: await offerLink(offer), emailed });
}
