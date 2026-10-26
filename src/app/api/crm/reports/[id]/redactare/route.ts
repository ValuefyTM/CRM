import { err, json, reportApi } from "@/lib/api";
import { chooseTemplate, cleanMarket, draftContext, markCopied, proposeMarket, saveMarket, saveText, writeField, type Mode } from "@/lib/drafting";
import { addExample } from "@/lib/report-templates";

const MODES: Mode[] = ["new", "shorter", "longer", "rewrite"];

/** Writes a field with AI: `{ asset, field, mode, wish }`; or proposes the market parameters: `{ asset, market: true }`. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "edit", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const c = await draftContext(a.db, a.user, id, typeof b.asset === "string" ? b.asset : null);
  if (!c) return err("Raportul nu are bunuri.", 404);
  if (b.market === true) {
    const r = await proposeMarket(c);
    return r.ok ? Response.json(r) : err(r.error);
  }
  const mode = MODES.includes(b.mode as Mode) ? (b.mode as Mode) : "new";
  const r = await writeField(a.db, c, String(b.field ?? ""), mode, typeof b.wish === "string" ? b.wish.slice(0, 500) : "", a.user.id);
  return r.ok ? Response.json(r) : err(r.error);
}

/**
 * The evaluator's changes: `{ asset, field, text }` (edited text), `{ asset, field, copied: true, value? }` (copied into the
 * bank's application), `{ asset, market: {…} }` (market parameters confirmed), `{ asset, template }` (another template),
 * `{ asset, field, example: true }` (keep the text as a style example of the template).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "edit", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const c = await draftContext(a.db, a.user, id, typeof b.asset === "string" ? b.asset : null);
  if (!c) return err("Raportul nu are bunuri.", 404);
  const field = String(b.field ?? "");
  if (typeof b.template === "string") return (await chooseTemplate(a.db, c, b.template, a.user.id)) ? Response.json({ ok: true }) : err("Macheta nu există.");
  if (b.market && typeof b.market === "object") { await saveMarket(a.db, c, cleanMarket(b.market), a.user.id); return Response.json({ ok: true }); }
  if (b.example === true) {
    const text = c.drafts[field]?.text;
    if (!text) return err("Câmpul nu are text.");
    return (await addExample(a.db, c.template.key, field, text, a.user.id)) ? Response.json({ ok: true }) : err("Câmpul nu există în machetă.");
  }
  if (b.copied === true) return (await markCopied(a.db, c, field, typeof b.value === "string" ? b.value : null, a.user.id)) ? Response.json({ ok: true }) : err("Câmpul nu are text.");
  if (typeof b.text === "string") return (await saveText(a.db, c, field, b.text, a.user.id)) ? Response.json({ ok: true }) : err("Câmpul nu există în machetă.");
  return err("Cerere necunoscută.");
}
