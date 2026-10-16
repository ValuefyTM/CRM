import { NextResponse } from "next/server";
import { audit } from "@/lib/auth";
import { err, json, staffApi } from "@/lib/api";
import { SHEET_TYPES, sheetTypeLabel, type SheetType } from "@/lib/insp-forms";
import { cleanTemplate } from "@/lib/insp-templates";
import { saveTemplate, templateOf } from "@/lib/insp-templates-db";

type P = { params: Promise<{ type: string }> };
const typeOf = async (p: P) => { const { type } = await p.params; return SHEET_TYPES.some(([t]) => t === type) ? (type as SheetType) : null; };

/** Saves the firm's template of one sheet type (owner / admins). Applies to the sheets started from now on. */
export async function PUT(req: Request, p: P) {
  const a = await staffApi("admin", true);
  if ("res" in a) return a.res;
  const t = await typeOf(p);
  if (!t) return err("Fișă necunoscută.", 404);
  const r = cleanTemplate(t, (await json(req)).groups);
  if (!r.ok) return err(r.error);
  await saveTemplate(a.db, t, r.tpl, a.user.id);
  await audit(a.db, `user:${a.user.id}`, "insp.template", "insp_template", t, `Fișa ${sheetTypeLabel(t)} modificată`);
  return NextResponse.json({ ok: true, ...(await templateOf(a.db, t)) });
}

/** Back to the built-in form ("Modelul VALUEFY"). */
export async function DELETE(_req: Request, p: P) {
  const a = await staffApi("admin", true);
  if ("res" in a) return a.res;
  const t = await typeOf(p);
  if (!t) return err("Fișă necunoscută.", 404);
  await saveTemplate(a.db, t, null, a.user.id);
  await audit(a.db, `user:${a.user.id}`, "insp.template", "insp_template", t, `Fișa ${sheetTypeLabel(t)} readusă la modelul VALUEFY`);
  return NextResponse.json({ ok: true, ...(await templateOf(a.db, t)) });
}
