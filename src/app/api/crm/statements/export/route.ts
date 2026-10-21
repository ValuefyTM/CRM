import { err, json, staffApi } from "@/lib/api";
import { can } from "@/lib/perms";
import { exportFields, exportMonth, memberChoices, periodLabel, saveExportFields, validPeriod } from "@/lib/statements";

/** The columns the user exports with (their last choice). */
export async function GET() {
  const a = await staffApi("statements");
  if ("res" in a) return a.res;
  return Response.json({ fields: await exportFields(a.db, a.user.id) });
}

/**
 * The whole month as .xlsx: `{ fields, period, evaluator? }` — a summary sheet and one sheet per statement, the direct
 * work and the fixed costs. "Profitabilitatea lui" gets it filtered on the user, as on the page.
 */
export async function POST(req: Request) {
  const a = await staffApi("statements");
  if ("res" in a) return a.res;
  const all = can(a.user, "statements.all"), self = !all && can(a.user, "statements.lead");
  if (!all && !self) return err("Nu ai acces la borderourile lunii.", 403);
  const b = await json(req);
  if (!validPeriod(b.period)) return err("Alege luna.");
  const keys = Array.isArray(b.fields) ? b.fields.filter((k): k is string => typeof k === "string") : [];
  if (!keys.length) return err("Alege cel puțin o coloană.");
  const fields = a.user.impersonator ? keys : await saveExportFields(a.db, a.user.id, keys);
  const member = self ? { id: a.user.id, name: a.user.name || a.user.email }
    : typeof b.evaluator === "string" ? (await memberChoices(a.db)).find((m) => m.id === b.evaluator) ?? null : null;
  const file = await exportMonth(a.db, b.period, fields, member, a.user.role === "owner");
  const name = `Borderouri ${periodLabel(b.period)}${member ? ` ${member.name}` : ""}`.replace(/[^\p{L}\p{N} ._-]/gu, "").trim();
  return new Response(file, { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="borderouri.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}.xlsx`,
    "Cache-Control": "no-store",
  } });
}
