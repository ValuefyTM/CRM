// The documents of a report as folders: the report's folder ('root'), one folder per asset ('a:<asset>') holding
// „Acte” ('a:<asset>:acte') and „Poze inspecție” ('a:<asset>:poze'), „Livrabile” ('livrabile') — all fixed — and the
// folders the team makes ('f:<id>', in table report_folders, anywhere). A file uploaded with the name of one already in
// its folder replaces it; the replaced file is kept as an earlier version (report_document_versions).
import { now, uuid } from "./db";

/** The folder a document sits in: its own, else the default (an asset's „Acte”, the signed report in „Livrabile”, else the report's folder). */
export const FOLDER_SQL = (d = "d") =>
  `COALESCE(${d}.folder, CASE WHEN ${d}.kind = 'final' THEN 'livrabile' WHEN ${d}.asset_id IS NOT NULL THEN 'a:' || ${d}.asset_id || ':acte' ELSE 'root' END)`;

export type CustomFolder = { id: string; parent: string; name: string; created_by: string | null; created_at: string };

export async function customFolders(db: D1Database, reportId: string) {
  const { results } = await db.prepare("SELECT id, parent, name, created_by, created_at FROM report_folders WHERE report_id = ? ORDER BY name COLLATE NOCASE")
    .bind(reportId).all<CustomFolder>().catch(() => ({ results: [] as CustomFolder[] }));
  return results;
}

/**
 * A folder key of this report, checked: what it is and the asset it is under (documents put there belong to that
 * asset). Null when the key names no folder of the report.
 */
export async function resolveFolder(db: D1Database, reportId: string, key: string): Promise<{ key: string; asset: string | null } | null> {
  if (key === "root" || key === "livrabile") return { key, asset: null };
  const a = key.match(/^a:([\w-]{1,80})(?::(acte|poze))?$/);
  if (a) {
    const ok = await db.prepare("SELECT id FROM assets WHERE id = ? AND report_id = ?").bind(a[1], reportId).first();
    return ok ? { key, asset: a[1] } : null;
  }
  const f = key.match(/^f:([\w-]{1,80})$/);
  if (!f) return null;
  const all = await customFolders(db, reportId);
  let cur = all.find((x) => x.id === f[1]);
  if (!cur) return null;
  // up the parents to the asset it is under (if any)
  for (let i = 0; i < 30 && cur; i++) {
    const p: string = cur.parent;
    const m = p.match(/^a:([\w-]{1,80})/);
    if (m) return { key, asset: m[1] };
    if (!p.startsWith("f:")) return { key, asset: null };
    cur = all.find((x) => x.id === p.slice(2));
  }
  return { key, asset: null };
}

/** Whether folder `key` is `ancestor` or inside it (a folder is never moved into itself). */
export async function isInside(db: D1Database, reportId: string, key: string, ancestor: string) {
  const all = await customFolders(db, reportId);
  let k: string | undefined = key;
  for (let i = 0; i < 40 && k; i++) {
    if (k === ancestor) return true;
    if (!k.startsWith("f:")) return false;
    k = all.find((x) => x.id === k!.slice(2))?.parent;
  }
  return false;
}

type Cur = { id: string; filename: string; content_type: string | null; size_bytes: number | null; r2_key: string | null; uploaded_by: string | null; created_at: string; version: number };

/** The current document of the report with this name in this folder (an uploaded one, the signed report too), if any. */
export async function sameName(db: D1Database, reportId: string, folder: string, filename: string) {
  return db.prepare(`SELECT d.id, d.filename, d.content_type, d.size_bytes, d.r2_key, d.uploaded_by, d.created_at, d.version FROM report_documents d
      WHERE d.report_id = ? AND d.status = 'uploaded' AND lower(d.filename) = lower(?) AND ${FOLDER_SQL("d")} = ? ORDER BY d.created_at DESC LIMIT 1`)
    .bind(reportId, filename, folder).first<Cur>();
}

/**
 * Puts a new file in place of a current document: the current file becomes an earlier version (kept in storage), the
 * row holds the new one with the next version number. Returns that number.
 */
export async function replaceDoc(db: D1Database, reportId: string, cur: Cur, file: { filename: string; content_type: string | null; size_bytes: number; r2_key: string }, actor: string) {
  const t = now();
  const version = (cur.version || 1) + 1;
  await db.batch([
    db.prepare(`INSERT INTO report_document_versions (id, doc_id, report_id, version, filename, content_type, size_bytes, r2_key, uploaded_by, uploaded_at, replaced_at, replaced_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(uuid(), cur.id, reportId, cur.version || 1, cur.filename, cur.content_type, cur.size_bytes, cur.r2_key ?? "", cur.uploaded_by, cur.created_at, t, actor),
    db.prepare("UPDATE report_documents SET filename = ?, content_type = ?, size_bytes = ?, r2_key = ?, uploaded_by = ?, created_at = ?, version = ? WHERE id = ?")
      .bind(file.filename, file.content_type, file.size_bytes, file.r2_key, actor, t, version, cur.id),
  ]);
  return version;
}

export type DocVersion = { id: string; version: number; filename: string; size_bytes: number | null; uploaded_at: string | null; by: string | null; replaced_at: string };

export async function docVersions(db: D1Database, reportId: string, docId: string) {
  const { results } = await db.prepare(`SELECT v.id, v.version, v.filename, v.size_bytes, v.uploaded_at, v.replaced_at, COALESCE(NULLIF(u.name, ''), u.email) AS by
      FROM report_document_versions v LEFT JOIN users u ON u.id = v.uploaded_by WHERE v.doc_id = ? AND v.report_id = ? ORDER BY v.version DESC`).bind(docId, reportId).all<DocVersion>();
  return results;
}

/** An earlier version made current again: the current file becomes a version too, so nothing is lost. */
export async function restoreVersion(db: D1Database, reportId: string, docId: string, versionId: string, actor: string) {
  const cur = await db.prepare("SELECT id, filename, content_type, size_bytes, r2_key, uploaded_by, created_at, version FROM report_documents WHERE id = ? AND report_id = ? AND status = 'uploaded'")
    .bind(docId, reportId).first<Cur>();
  const v = await db.prepare("SELECT filename, content_type, size_bytes, r2_key FROM report_document_versions WHERE id = ? AND doc_id = ?").bind(versionId, docId)
    .first<{ filename: string; content_type: string | null; size_bytes: number | null; r2_key: string }>();
  if (!cur || !v) return null;
  // the restored file keeps its storage key: the version row stays too (the same file, listed once more is harmless)
  return replaceDoc(db, reportId, cur, { filename: v.filename, content_type: v.content_type, size_bytes: v.size_bytes ?? 0, r2_key: v.r2_key }, actor);
}

/** The storage keys of a document's earlier versions (deleted with it), not shared with the current file. */
export async function versionKeys(db: D1Database, docId: string) {
  const { results } = await db.prepare("SELECT DISTINCT r2_key FROM report_document_versions WHERE doc_id = ?").bind(docId).all<{ r2_key: string }>();
  return results.map((r) => r.r2_key).filter(Boolean);
}

/**
 * Whether the report's working grid and its report in Word must be marked in „Dosar de lucru” before it is delivered:
 * yes, except for BCR and BRD, whose reports are made in the bank's own application.
 */
export const needsWorkFiles = (bankCode: string | null | undefined, bankName: string | null | undefined) =>
  !/\b(BCR|BRD)\b|Banca Comercial[aă] Rom[aâ]n[aă]|Groupe Soci[eé]t[eé] G[eé]n[eé]rale/i.test(`${bankCode ?? ""} ${bankName ?? ""}`);

/** What is still to mark before delivery (empty: ready). */
export async function workFilesMissing(db: D1Database, reportId: string) {
  const r = await db.prepare(`SELECT b.code, b.name, (SELECT COUNT(*) FROM report_documents d WHERE d.report_id = r.id AND d.status = 'uploaded' AND d.role = 'grid') AS grid,
      (SELECT COUNT(*) FROM report_documents d WHERE d.report_id = r.id AND d.status = 'uploaded' AND d.role = 'word') AS word
      FROM reports r LEFT JOIN entities b ON b.id = r.recipient_id WHERE r.id = ?`).bind(reportId).first<{ code: string | null; name: string | null; grid: number; word: number }>();
  if (!r || !needsWorkFiles(r.code, r.name)) return [];
  return [!r.grid && "grila de lucru", !r.word && "raportul în format Word"].filter((x): x is string => !!x);
}
