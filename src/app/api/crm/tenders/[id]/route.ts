import { err, json, staffApi } from "@/lib/api";
import { now } from "@/lib/db";
import { TENDER_STATUS } from "@/lib/tenders";

/** Status of a notice (`new` | `analyze` | `bid` | `skip`) and / or notes. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const { id } = await params;
  const b = await json(req);
  const status = typeof b.status === "string" && TENDER_STATUS[b.status] ? b.status : null;
  const notes = typeof b.notes === "string" ? b.notes.trim().slice(0, 4000) : null;
  if (!status && notes === null) return err("Nimic de salvat.");
  const r = await a.db.prepare("UPDATE tenders SET status = COALESCE(?, status), notes = COALESCE(?, notes), updated_at = ? WHERE id = ?").bind(status, notes, now(), id).run();
  if (!r.meta.changes) return err("Anunțul nu există.", 404);
  return Response.json({ ok: true });
}
