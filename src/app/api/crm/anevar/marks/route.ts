import { err, json, staffApi } from "@/lib/api";
import { markReport } from "@/lib/anevar";

/** Leaves a report out of the ANEVAR report (or puts it back), or counts it on another line / specialisation. */
export async function PATCH(req: Request) {
  const a = await staffApi("anevar", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const id = typeof b.report === "string" ? b.report : "";
  if (!id || !(await a.db.prepare("SELECT 1 AS ok FROM reports WHERE id = ?").bind(id).first())) return err("Raportul nu există.", 404);
  const num = (v: unknown) => (v === null ? null : typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const r = await markReport(a.db, a.user.id, id, {
    excluded: typeof b.excluded === "boolean" ? b.excluded : undefined,
    line: num(b.line), spec: num(b.spec),
    note: typeof b.note === "string" ? b.note : b.note === null ? null : undefined,
  });
  return Response.json({ ok: true, ...r });
}
