import { err, json, reportApi } from "@/lib/api";
import { canFrame } from "@/lib/perms-db";
import { avData, avReport, avSave, avWorkbook } from "@/lib/av-form";

/** The Appraisal & Valuation form of the report, as it would be filled now, with what is missing. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "view");
  if ("res" in a) return a.res;
  if (!(await avReport(a.db, id))) return err("Raportul nu e pe colaborarea cu Appraisal & Valuation.", 404);
  const d = await avData(a.db, id);
  return d ? Response.json({ ...d, canEdit: canFrame(a.user, a.access) }) : err("Raportul nu există.", 404);
}

/** Saves what was typed (client, assets, the order's settings of the form). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "view", true);
  if ("res" in a) return a.res;
  if (!canFrame(a.user, a.access)) return err("Nu poți modifica datele acestui raport.", 403);
  if (!(await avReport(a.db, id))) return err("Raportul nu e pe colaborarea cu Appraisal & Valuation.", 404);
  const r = await avSave(a.db, a.user.id, id, await json(req));
  if (!r.ok) return err(r.error);
  const d = await avData(a.db, id);
  return Response.json({ ok: true, ...d });
}

/** The filled-in .xlsx (their template); refused while a required field is missing. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "view");
  if ("res" in a) return a.res;
  if (!(await avReport(a.db, id))) return err("Raportul nu e pe colaborarea cu Appraisal & Valuation.", 404);
  const d = await avData(a.db, id);
  if (!d) return err("Raportul nu există.", 404);
  if (d.missing.length) return err(`Lipsesc: ${d.missing.join(", ")}.`, 409);
  const name = `Formular facturare ${d.form.name}`.replace(/[^\p{L}\p{N} ._-]/gu, "").trim();
  return new Response(avWorkbook(d.form, d.assets), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="formular.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}.xlsx`,
    "Cache-Control": "no-store",
  } });
}
