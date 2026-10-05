import { NextResponse } from "next/server";
import { audit, sendInvite } from "@/lib/auth";
import { clientContacts, enablePortal, getClient } from "@/lib/clients";
import { err, json, staffApi } from "@/lib/api";

/** Portal access for a client (or one of a company's contact people): creates the account and emails the invitation. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const { id } = await params;
  const client = await getClient(a.db, id);
  if (!client) return err("Clientul nu există.", 404);
  const b = await json(req);
  const contact = typeof b.contact === "string" ? (await clientContacts(a.db, id)).find((c) => c.id === b.contact) ?? null : null;
  const r = await enablePortal(a.db, client, contact, a.user.id);
  if (!r.ok) return err(r.error);
  const actor = `user:${a.user.id}`;
  await audit(a.db, actor, "client.portal", "client", id, contact?.email ?? client.email ?? "");
  return NextResponse.json({ ok: true, userId: r.userId, invited: await sendInvite(a.db, r.userId, actor) });
}
