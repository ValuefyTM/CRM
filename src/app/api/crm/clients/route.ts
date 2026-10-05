import { NextResponse } from "next/server";
import { audit, sendInvite } from "@/lib/auth";
import { clientContacts, createClient, enablePortal, findDuplicate, getClient, validateClient } from "@/lib/clients";
import { err, json, staffApi } from "@/lib/api";

/**
 * New client (person or company, with contact people). Optionally gives portal access right away:
 * `portal: true` and `portalContact` = index of the contact person (companies) whose email gets the invitation.
 */
export async function POST(req: Request) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const b = await json(req);
  const v = validateClient(b);
  if (!v.ok) return err(v.error);
  if (b.force !== true) {
    const dup = await findDuplicate(a.db, v.value);
    if (dup) return NextResponse.json({ error: `Există deja clientul „${dup.name}” cu același CUI, email sau telefon.`, duplicate: dup }, { status: 409 });
  }
  const actor = `user:${a.user.id}`;
  const id = await createClient(a.db, v.value, v.contacts, a.user.id);
  await audit(a.db, actor, "client.create", "client", id, v.value.name);
  let portal: { invited: boolean; error?: string } | null = null;
  if (b.portal === true) {
    const client = (await getClient(a.db, id))!;
    const contacts = await clientContacts(a.db, id);
    const idx = typeof b.portalContact === "number" ? b.portalContact : -1;
    const contact = client.kind !== "person" && idx >= 0 ? contacts[idx] ?? null : null;
    const r = await enablePortal(a.db, client, contact, a.user.id);
    if (r.ok) {
      await audit(a.db, actor, "client.portal", "client", id, contact?.email ?? client.email ?? "");
      portal = { invited: await sendInvite(a.db, r.userId, actor) };
    } else portal = { invited: false, error: r.error };
  }
  return NextResponse.json({ ok: true, id, portal });
}
