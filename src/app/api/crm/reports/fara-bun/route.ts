import { audit } from "@/lib/auth";
import { now } from "@/lib/db";
import { err, json, staffApi } from "@/lib/api";

/** Cancels, in one go, every report that has no asset and is not finished or already cancelled: `{ confirm: true }`. */
export async function POST(req: Request) {
  const a = await staffApi("reports:status", true);
  if ("res" in a) return a.res;
  if (!a.user.perms?.includes("reports.all") && a.user.role !== "owner") return err("Doar cine vede toate rapoartele poate face asta.", 403);
  if ((await json(req)).confirm !== true) return err("Confirmă anularea.");
  const { results } = await a.db.prepare(`SELECT r.id, r.number FROM reports r WHERE r.status NOT IN ('done', 'cancelled')
      AND NOT EXISTS (SELECT 1 FROM assets x WHERE x.report_id = r.id)`).all<{ id: string; number: string | null }>();
  if (!results.length) return Response.json({ ok: true, cancelled: 0 });
  const t = now();
  for (let i = 0; i < results.length; i += 50) {
    const part = results.slice(i, i + 50);
    await a.db.batch([
      a.db.prepare(`UPDATE reports SET status = 'cancelled', suspend_reason = NULL, updated_at = ? WHERE id IN (${part.map(() => "?").join(",")})`).bind(t, ...part.map((r) => r.id)),
      ...part.map((r) => a.db.prepare("INSERT INTO audit_log (actor, action, entity, entity_id, details) VALUES (?, 'report.status', 'report', ?, ?)")
        .bind(`user:${a.user.id}`, r.id, "În lucru → Anulat (fără bun, în bloc)")),
    ]);
  }
  await audit(a.db, `user:${a.user.id}`, "reports.cancel_no_asset", "reports", undefined, `${results.length} rapoarte fără bun anulate`);
  return Response.json({ ok: true, cancelled: results.length });
}
