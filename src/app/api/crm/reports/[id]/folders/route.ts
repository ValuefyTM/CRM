import { err, json, reportApi } from "@/lib/api";
import { audit } from "@/lib/auth";
import { uuid } from "@/lib/db";
import { customFolders, resolveFolder } from "@/lib/doc-folders";

const clean = (v: unknown) => String(v ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
/** the fixed folders' names: not taken by a folder made beside them */
const FIXED = ["acte", "poze inspecție", "poze inspectie", "livrabile"];

async function nameTaken(db: D1Database, report: string, parent: string, name: string, except?: string) {
  if (FIXED.includes(name.toLowerCase())) return true;
  return (await customFolders(db, report)).some((f) => f.parent === parent && f.id !== except && f.name.toLowerCase() === name.toLowerCase());
}

/** A new folder: `{ name, parent }` (parent: the folder key it is made in). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "docs", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const parent = await resolveFolder(a.db, id, String(b.parent ?? "root"));
  if (!parent) return err("Folderul nu mai există.", 404);
  const name = clean(b.name);
  if (!name) return err("Scrie numele folderului.");
  if (await nameTaken(a.db, id, parent.key, name)) return err(`Există deja un folder „${name}” aici.`, 409);
  const fid = uuid();
  await a.db.prepare("INSERT INTO report_folders (id, report_id, parent, name, created_by) VALUES (?, ?, ?, ?, ?)").bind(fid, id, parent.key, name, a.user.id).run();
  await audit(a.db, `user:${a.user.id}`, "report.folder_create", "report", id, name);
  return Response.json({ ok: true, id: fid, key: `f:${fid}` });
}

/** Renamed: `{ id, name }`. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "docs", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const f = (await customFolders(a.db, id)).find((x) => x.id === String(b.id ?? ""));
  if (!f) return err("Folderul nu există.", 404);
  const name = clean(b.name);
  if (!name) return err("Scrie numele folderului.");
  if (name !== f.name) {
    if (await nameTaken(a.db, id, f.parent, name, f.id)) return err(`Există deja un folder „${name}” aici.`, 409);
    await a.db.prepare("UPDATE report_folders SET name = ? WHERE id = ?").bind(name, f.id).run();
    await audit(a.db, `user:${a.user.id}`, "report.folder_rename", "report", id, `${f.name} → ${name}`);
  }
  return Response.json({ ok: true, name });
}

/** Deleted (`?folder=`): only an empty one — its files are moved out or deleted first. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "docs", true);
  if ("res" in a) return a.res;
  const fid = new URL(req.url).searchParams.get("folder") ?? "";
  const all = await customFolders(a.db, id);
  const f = all.find((x) => x.id === fid);
  if (!f) return err("Folderul nu există.", 404);
  const sub = all.some((x) => x.parent === `f:${f.id}`);
  const files = await a.db.prepare("SELECT 1 AS x FROM report_documents WHERE report_id = ? AND folder = ? LIMIT 1").bind(id, `f:${f.id}`).first();
  if (sub || files) return err("Folderul nu e gol: mută sau șterge întâi ce e în el.", 409);
  await a.db.prepare("DELETE FROM report_folders WHERE id = ?").bind(f.id).run();
  await audit(a.db, `user:${a.user.id}`, "report.folder_delete", "report", id, f.name);
  return Response.json({ ok: true });
}
