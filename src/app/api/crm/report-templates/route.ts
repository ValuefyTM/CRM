import { audit } from "@/lib/auth";
import { err, json, staffApi } from "@/lib/api";
import { DEFAULT_TEMPLATES, resetTemplate, saveTemplate } from "@/lib/report-templates";

/** Keeps the firm's changes to a report template: `{ key, template }`. */
export async function PUT(req: Request) {
  const a = await staffApi("templates.E", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const key = String(b.key ?? "");
  const t = await saveTemplate(a.db, key, b.template, a.user.id);
  if (!t) return err("Macheta nu există.");
  await audit(a.db, `user:${a.user.id}`, "report.template", "report_template", key, `Machetă de raport modificată: ${t.name}`);
  return Response.json({ ok: true });
}

/** Back to the default template: `?key=`. */
export async function DELETE(req: Request) {
  const a = await staffApi("templates.E", true);
  if ("res" in a) return a.res;
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const def = DEFAULT_TEMPLATES.find((t) => t.key === key);
  if (!def) return err("Macheta nu există.");
  await resetTemplate(a.db, key);
  await audit(a.db, `user:${a.user.id}`, "report.template", "report_template", key, `Macheta de raport readusă la varianta inițială: ${def.name}`);
  return Response.json({ ok: true });
}
