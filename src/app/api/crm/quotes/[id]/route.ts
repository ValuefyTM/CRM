import { err, json, staffApi } from "@/lib/api";
import { deleteQuote, setQuoteStatus, updateQuote } from "@/lib/quotes";

/** Edits an offer, or (with `status`) marks it sent / accepted / declined / back to draft. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await staffApi("orders.E", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const r = typeof b.status === "string" ? await setQuoteStatus(a.db, a.user.id, id, b.status, { sent_via: b.sent_via, reason: b.reason }) : await updateQuote(a.db, a.user.id, id, b);
  return r.ok ? Response.json({ ok: true }) : err(r.error);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await staffApi("orders.D", true);
  if ("res" in a) return a.res;
  const r = await deleteQuote(a.db, a.user.id, id);
  return r.ok ? Response.json({ ok: true }) : err(r.error);
}
