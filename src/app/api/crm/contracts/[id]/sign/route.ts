import { err, json, staffApi } from "@/lib/api";
import { sendForSignature } from "@/lib/contract-sign";

/** Sends the contract to the client for online signing (or sends the link again). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const { id } = await params;
  const b = await json(req);
  const r = await sendForSignature(a.db, `user:${a.user.id}`, id, typeof b.to === "string" ? b.to : "");
  if (!r.ok) return err(r.error);
  return Response.json({ ok: true, link: r.link, sent: r.sent });
}
