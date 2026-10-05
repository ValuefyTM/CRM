import { NextResponse } from "next/server";
import { audit } from "@/lib/auth";
import { getLead, leadStatus, updateLead } from "@/lib/leads";
import { err, json, staffApi } from "@/lib/api";

/** Status and internal notes of a website request (shared with the website's admin panel). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const { id } = await params;
  if (!(await getLead(a.db, id))) return err("Cererea nu există.", 404);
  const b = await json(req);
  if (!(await updateLead(a.db, id, b))) return err("Nimic de salvat.");
  await audit(a.db, `user:${a.user.id}`, b.status ? "lead.status" : "lead.notes", "lead", id, typeof b.status === "string" ? leadStatus(b.status)[0] : undefined);
  return NextResponse.json({ ok: true });
}
