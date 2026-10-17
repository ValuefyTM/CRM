import { err, json, reportApi } from "@/lib/api";
import { audit } from "@/lib/auth";

/**
 * The photos of an inspection of the report, arranged on the asset page:
 * `{ inspection, moves: [{ id, album, sort }] }` puts photos in a group (album) and order; `{ inspection, cover: <photo id> }`
 * makes one the cover of the asset (the profile photo of the sheet, shown first and in the lists).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "assets", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const ins = typeof b.inspection === "string" ? b.inspection : "";
  const ok = await a.db.prepare("SELECT id FROM inspections WHERE id = ? AND report_id = ?").bind(ins, id).first();
  if (!ok) return err("Inspecția nu este a acestui raport.", 404);

  if (typeof b.cover === "string") {
    const p = await a.db.prepare("SELECT r2_key FROM inspection_photos WHERE id = ? AND inspection_id = ? AND deleted_at IS NULL").bind(b.cover, ins).first<{ r2_key: string }>();
    if (!p) return err("Fotografia nu mai există.", 404);
    const r = await a.db.prepare("UPDATE inspection_sheets SET photo_url = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE inspection_id = ?").bind(`r2:${p.r2_key}`, ins).run();
    if (!r.meta.changes) return err("Inspecția nu are fișă: coperta se alege după completarea fișei.");
    await audit(a.db, `user:${a.user.id}`, "report.photo_cover", "report", id);
    return Response.json({ ok: true });
  }

  const moves = Array.isArray(b.moves) ? (b.moves as unknown[]).slice(0, 500) : [];
  const rows = moves.flatMap((m) => {
    const x = m as { id?: unknown; album?: unknown; sort?: unknown };
    if (typeof x.id !== "string") return [];
    const album = typeof x.album === "string" ? x.album.trim().slice(0, 60) || null : null;
    return [{ id: x.id, album, sort: typeof x.sort === "number" && Number.isFinite(x.sort) ? Math.round(x.sort) : 0 }];
  });
  if (!rows.length) return err("Nimic de mutat.");
  await a.db.batch(rows.map((x) => a.db.prepare("UPDATE inspection_photos SET album = ?, sort = ? WHERE id = ? AND inspection_id = ?").bind(x.album, x.sort, x.id, ins)));
  return Response.json({ ok: true });
}
