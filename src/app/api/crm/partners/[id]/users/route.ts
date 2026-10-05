import { NextResponse } from "next/server";
import { audit, sendInvite } from "@/lib/auth";
import { addPartnerUser, getPartner, validatePerson } from "@/lib/partners";
import { err, json, staffApi } from "@/lib/api";

/** Add a person to a partner and email them an invitation. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const { id } = await params;
  if (!(await getPartner(a.db, id))) return err("Colaboratorul nu există.", 404);
  const b = await json(req);
  const v = validatePerson(b);
  if (!v.ok) return err(v.error);
  const u = await addPartnerUser(a.db, id, v.value);
  if (!u.ok) return err(u.error, 409);
  await audit(a.db, `staff:${a.user.id}`, "partner_user.create", "partner_user", u.id, v.value.email);
  const invited = b.invite === false ? false : await sendInvite(a.db, u.id, `staff:${a.user.id}`);
  return NextResponse.json({ ok: true, id: u.id, invited });
}
