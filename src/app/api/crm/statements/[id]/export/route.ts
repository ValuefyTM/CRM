import { err, json, staffApi } from "@/lib/api";
import { can } from "@/lib/perms";
import { exportFields, exportStatement, getStatement, linesOf, linesWith, memberChoices, memberReports, saveExportFields } from "@/lib/statements";

/** The columns the user exports with (their last choice). */
export async function GET() {
  const a = await staffApi("statements");
  if ("res" in a) return a.res;
  return Response.json({ fields: await exportFields(a.db, a.user.id) });
}

/**
 * The statement as .xlsx with `{ fields, evaluator? }`; the choice is kept for the next export. Who sees only their
 * reports ("Profitabilitatea lui") or a filtered view gets only those lines, as on the page.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("statements");
  if ("res" in a) return a.res;
  const { id } = await params;
  const s = await getStatement(a.db, id);
  if (!s) return err("Borderoul nu există.", 404);
  const all = can(a.user, "statements.all"), mine = s.user_id === a.user.id;
  const self = !all && !mine && can(a.user, "statements.lead");
  if (!all && !mine && !self) return err("Nu ai acces la acest borderou.", 403);
  const b = await json(req);
  const keys = Array.isArray(b.fields) ? b.fields.filter((k): k is string => typeof k === "string") : [];
  if (!keys.length) return err("Alege cel puțin o coloană.");
  const fields = a.user.impersonator ? keys : await saveExportFields(a.db, a.user.id, keys);
  const filter = self ? a.user.id : all && typeof b.evaluator === "string" && (await memberChoices(a.db)).some((m) => m.id === b.evaluator) ? b.evaluator : null;
  const allLines = await linesOf(a.db, s);
  const lines = filter ? linesWith(allLines, await memberReports(a.db, filter)) : allLines;
  if (self && !lines.length) return err("Nu ai acces la acest borderou.", 403);
  const file = await exportStatement(a.db, s, lines, fields);
  const name = `Borderou ${s.number ?? s.period} ${s.name}`.replace(/[^\p{L}\p{N} ._-]/gu, "").trim();
  return new Response(file, { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="borderou.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}.xlsx`,
    "Cache-Control": "no-store",
  } });
}
