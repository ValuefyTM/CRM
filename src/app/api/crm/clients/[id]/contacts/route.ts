import { NextResponse } from "next/server";
import { audit } from "@/lib/auth";
import { addContact, getClient } from "@/lib/clients";
import { normEmail, validEmail } from "@/lib/crypto";
import { err, json, staffApi } from "@/lib/api";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Add a contact person; PATCH ?contact= makes it the main one; DELETE ?contact= removes it. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const { id } = await params;
  if (!(await getClient(a.db, id))) return err("Clientul nu există.", 404);
  const b = await json(req);
  const name = str(b.name, 120);
  const email = str(b.email, 160);
  if (!name) return err("Completează numele persoanei de contact.");
  if (email && !validEmail(email)) return err("Adresa de email nu pare validă.");
  const cid = await addContact(a.db, id, { name, role: str(b.role, 80) || null, phone: str(b.phone, 40) || null, email: email ? normEmail(email) : null }, b.primary === true);
  await audit(a.db, `user:${a.user.id}`, "client.contact", "client", id, name);
  return NextResponse.json({ ok: true, id: cid });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const { id } = await params;
  const contact = new URL(req.url).searchParams.get("contact") ?? "";
  await a.db.batch([
    a.db.prepare("UPDATE entity_contacts SET is_primary = 0 WHERE entity_id = ?").bind(id),
    a.db.prepare("UPDATE entity_contacts SET is_primary = 1 WHERE entity_id = ? AND id = ?").bind(id, contact),
  ]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const { id } = await params;
  const contact = new URL(req.url).searchParams.get("contact") ?? "";
  await a.db.prepare("DELETE FROM entity_contacts WHERE entity_id = ? AND id = ?").bind(id, contact).run();
  await audit(a.db, `user:${a.user.id}`, "client.contact_remove", "client", id);
  return NextResponse.json({ ok: true });
}
