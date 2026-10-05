import { NextResponse } from "next/server";
import { audit } from "@/lib/auth";
import { findDuplicate, getClient, updateClient, validateClient } from "@/lib/clients";
import { err, json, staffApi } from "@/lib/api";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const { id } = await params;
  if (!(await getClient(a.db, id))) return err("Clientul nu există.", 404);
  const b = await json(req);
  const v = validateClient(b);
  if (!v.ok) return err(v.error);
  if (b.force !== true) {
    const dup = await findDuplicate(a.db, v.value, id);
    if (dup) return NextResponse.json({ error: `Există deja clientul „${dup.name}” cu același CUI, email sau telefon.`, duplicate: dup }, { status: 409 });
  }
  await updateClient(a.db, id, v.value);
  await audit(a.db, `user:${a.user.id}`, "client.update", "client", id);
  return NextResponse.json({ ok: true });
}
