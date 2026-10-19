import { err, json, staffApi } from "@/lib/api";
import { sendQuote } from "@/lib/quote-public";
import { offerLink } from "@/lib/offer-emails";

/** Emails the offer's public page to the client: `{ to, message? }`. Returns the link. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await staffApi("orders.E", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const r = await sendQuote(a.db, a.user.id, id, typeof b.to === "string" ? b.to.trim().toLowerCase() : "", typeof b.message === "string" && b.message.trim() ? b.message.trim().slice(0, 600) : null);
  if (!r.ok) return err(r.error);
  return Response.json({ ok: true, link: await offerLink({ token: r.token }), emailed: r.emailed });
}
