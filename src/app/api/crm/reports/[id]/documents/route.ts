import { getDb } from "@/lib/db";
import { audit } from "@/lib/auth";
import { now, uuid } from "@/lib/db";
import { err, json, reportApi } from "@/lib/api";
import { bucket } from "@/lib/orders";
import { fileType } from "@/lib/file-response";
import { MAX_FILE_MB } from "@/lib/order-labels";
import { DOC_KIND_KEYS, docKindLabel, guessDocKind } from "@/lib/doc-kinds";
import { resyncUvalo } from "@/lib/uvalo";
import { isZip, unzipDocs } from "@/lib/unzip-docs";
import { FOLDER_SQL, isInside, replaceDoc, resolveFolder, restoreVersion, sameName, versionKeys } from "@/lib/doc-folders";

const OK = /\.(pdf|jpe?g|png|heic|heif|webp|docx?|xlsx?|zip)$/i;

/**
 * Report documents. Multipart `file` (+ `kind` = source | final, `doc` = id of a requested document it fulfils, `doc_type` = cf | rlv
 * and `asset` = the asset it belongs to, for the documents the inspector takes along) uploads a file;
 * JSON `{ missing: "Extras CF …" }` records a document that was asked for and has not come yet.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "docs", true);
  if ("res" in a) return a.res;
  const r = await a.db.prepare("SELECT id FROM reports WHERE id = ?").bind(id).first();
  if (!r) return err("Raportul nu există.", 404);
  const actor = `user:${a.user.id}`;

  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    const b = await json(req);
    const name = typeof b.missing === "string" ? b.missing.trim().slice(0, 160) : "";
    if (!name) return err("Scrie ce document lipsește.");
    await a.db.prepare("INSERT INTO report_documents (id, report_id, kind, filename, status, requested_at, uploaded_by) VALUES (?, ?, 'source', ?, 'missing', ?, ?)")
      .bind(uuid(), id, name, now(), a.user.id).run();
    await audit(a.db, actor, "report.document_missing", "report", id, name);
    return Response.json({ ok: true });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !file.size) return err("Alege un fișier.");
  if (file.size > MAX_FILE_MB * 1024 * 1024) return err(`Fișierul depășește ${MAX_FILE_MB} MB.`);
  if (!OK.test(file.name)) return err("Acceptăm PDF, imagini, Word, Excel și ZIP.");
  const kind = form?.get("kind") === "final" ? "final" : "source";
  if (kind === "final" && !/\.pdf$/i.test(file.name)) return err("Raportul final se încarcă în format PDF.");
  const r2 = await bucket();
  if (!r2) return err("Stocarea fișierelor nu este disponibilă momentan.", 503);
  // `folder`: the folder it is dropped in (the asset follows from it); a file with the name of one there replaces it
  const place = kind === "source" && typeof form?.get("folder") === "string" ? await resolveFolder(a.db, id, String(form.get("folder"))) : null;
  if (form?.get("folder") && kind === "source" && !place) return err("Folderul nu mai există.", 404);

  // A ZIP of documents: opened, each file kept as its own document (on the same asset / type, when given)
  if (kind === "source" && isZip(file.name)) {
    const z = unzipDocs(new Uint8Array(await file.arrayBuffer()));
    if (!z.ok) return err(z.error);
    // each file its own kind, by its name (CF extract, survey…): the archive's own name says nothing about them
    const kindOf = (name: string) => { const g = guessDocKind(name); return DOC_KIND_KEYS.includes(g) ? g : null; };
    const assetId = place ? place.asset : form?.get("asset")
      ? (await a.db.prepare("SELECT id FROM assets WHERE id = ? AND report_id = ?").bind(String(form.get("asset")), id).first<{ id: string }>())?.id ?? null
      : null;
    const folderOf = place?.key ?? (assetId ? `a:${assetId}:acte` : "root");
    const replaced: string[] = [];
    const requested = typeof form?.get("doc") === "string" ? (form.get("doc") as string) : "";
    const missing = requested
      ? await a.db.prepare("SELECT id, filename FROM report_documents WHERE id = ? AND report_id = ? AND status = 'missing'").bind(requested, id).first<{ id: string; filename: string }>()
      : null;
    const ids: string[] = [];
    for (const [i, f] of z.files.entries()) {
      const did = i === 0 && missing ? missing.id : uuid();
      const safe = f.name.replace(/[^\w.\-() ăâîșțĂÂÎȘȚ]/g, "_").slice(-120) || "document";
      const key = `reports/${id}/${did}-${safe}`;
      const type = fileType(safe);
      await r2.put(key, f.data, { httpMetadata: { contentType: type }, customMetadata: { report: id, kind, zip: file.name.slice(0, 120) } });
      if (i === 0 && missing) {
        // the document asked for is fulfilled by the archive (its first file keeps the name it was asked for when it is the only one)
        const named = z.files.length === 1 ? `${missing.filename.replace(/[^\w.\-() ăâîșțĂÂÎȘȚ]/g, "_")}${safe.match(/\.\w{2,4}$/)?.[0] ?? ""}` : safe;
        await a.db.prepare("UPDATE report_documents SET filename = ?, content_type = ?, size_bytes = ?, r2_key = ?, status = 'uploaded', uploaded_by = ?, created_at = ?, doc_type = COALESCE(?, doc_type), asset_id = COALESCE(?, asset_id) WHERE id = ?")
          .bind(named, type, f.data.byteLength, key, a.user.id, now(), kindOf(f.name), assetId, did).run();
      } else {
        const cur = await sameName(a.db, id, folderOf, safe);
        if (cur) { await replaceDoc(a.db, id, cur, { filename: safe, content_type: type, size_bytes: f.data.byteLength, r2_key: key }, a.user.id); replaced.push(safe); ids.push(cur.id); continue; }
        await a.db.prepare("INSERT INTO report_documents (id, report_id, kind, filename, content_type, size_bytes, r2_key, uploaded_by, doc_type, asset_id, folder) VALUES (?, ?, 'source', ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(did, id, safe, type, f.data.byteLength, key, a.user.id, kindOf(f.name), assetId, place?.key ?? null).run();
      }
      ids.push(did);
    }
    await a.db.prepare("UPDATE reports SET updated_at = ? WHERE id = ?").bind(now(), id).run();
    await audit(a.db, actor, "report.document", "report", id, `${file.name}: ${z.files.length} ${z.files.length === 1 ? "fișier dezarhivat" : "fișiere dezarhivate"}${z.skipped.length ? ` · sărite: ${z.skipped.slice(0, 10).join(", ")}` : ""}`);
    await resyncUvalo(a.db, { reportId: id });
    return Response.json({ ok: true, id: ids[0], ids, unzipped: z.files.length, skipped: z.skipped, replaced });
  }

  const docId = uuid();
  const safe = file.name.replace(/[^\w.\-() ăâîșțĂÂÎȘȚ]/g, "_").slice(-120) || "document";
  const key = `reports/${id}/${docId}-${safe}`;
  // The whole file (at most MAX_FILE_MB): a stream without a known length is refused by R2 outside the worker.
  await r2.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: fileType(safe) }, customMetadata: { report: id, kind } });

  const requested = typeof form?.get("doc") === "string" ? (form.get("doc") as string) : "";
  const docType = kind === "source" && DOC_KIND_KEYS.includes(String(form?.get("doc_type") ?? "")) ? String(form?.get("doc_type")) : null;
  const assetId = place ? place.asset : kind === "source" && form?.get("asset")
    ? (await a.db.prepare("SELECT id FROM assets WHERE id = ? AND report_id = ?").bind(String(form.get("asset")), id).first<{ id: string }>())?.id ?? null
    : null;
  // One final file per report: the new one replaces the previous, which is kept as an earlier version.
  const oldFinal = kind === "final"
    ? await a.db.prepare("SELECT id, filename, content_type, size_bytes, r2_key, uploaded_by, created_at, version FROM report_documents WHERE report_id = ? AND kind = 'final' AND status = 'uploaded' ORDER BY created_at DESC LIMIT 1")
      .bind(id).first<{ id: string; filename: string; content_type: string | null; size_bytes: number | null; r2_key: string | null; uploaded_by: string | null; created_at: string; version: number }>()
    : null;
  // A file with the name of one in the same folder replaces it (the earlier one kept as a version).
  const same = kind === "source" && !requested ? await sameName(a.db, id, place?.key ?? (assetId ? `a:${assetId}:acte` : "root"), safe) : null;
  const prev = oldFinal ?? same;
  const missing = requested
    ? await a.db.prepare("SELECT id, filename FROM report_documents WHERE id = ? AND report_id = ? AND status = 'missing'").bind(requested, id).first<{ id: string; filename: string }>()
    : null;
  let version: number | null = null;
  if (prev) {
    version = await replaceDoc(a.db, id, prev, { filename: safe, content_type: file.type || null, size_bytes: file.size, r2_key: key }, a.user.id);
  } else if (missing) {
    // Keeps the name the document was asked for ("Extras CF garaj.pdf").
    const named = `${missing.filename.replace(/[^\w.\-() ăâîșțĂÂÎȘȚ]/g, "_")}${safe.match(/\.\w{2,4}$/)?.[0] ?? ""}`;
    await a.db.prepare("UPDATE report_documents SET filename = ?, content_type = ?, size_bytes = ?, r2_key = ?, status = 'uploaded', uploaded_by = ?, created_at = ?, doc_type = COALESCE(?, doc_type), asset_id = COALESCE(?, asset_id) WHERE id = ?")
      .bind(named, file.type || null, file.size, key, a.user.id, now(), docType, assetId, missing.id).run();
  } else {
    await a.db.prepare("INSERT INTO report_documents (id, report_id, kind, filename, content_type, size_bytes, r2_key, uploaded_by, doc_type, asset_id, folder) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(docId, id, kind, safe, file.type || null, file.size, key, a.user.id, docType, assetId, place?.key ?? null).run();
  }
  const savedId = prev?.id ?? missing?.id ?? docId;
  await a.db.prepare("UPDATE reports SET updated_at = ?, uploaded_on = CASE WHEN ? = 'final' THEN ? ELSE uploaded_on END WHERE id = ?").bind(now(), kind, now().slice(0, 10), id).run();
  await audit(a.db, actor, kind === "final" ? "report.final" : "report.document", "report", id, version ? `${safe} · versiunea ${version}` : safe);
  // A document uploaded after the inspection was sent: it reaches the inspector in UVALO too (when it is to be seen).
  if (kind === "source") await resyncUvalo(a.db, { reportId: id });
  return Response.json({ ok: true, id: savedId, version, replaced: !!prev });
}

/**
 * Marks a source document as the CF extract / floor survey (or neither): `{ doc, doc_type: cf | rlv | other, asset }`;
 * or whether the inspector sees it: `{ doc, origin?: "order", insp_visible: true | false }`.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "docs", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const actor = `user:${a.user.id}`;
  // Moved to a folder (dragged, „Mută în…”): `{ to: <folder key>, docs: [<id>], folders: [<id>] }`. The documents take the
  // asset of the folder (an asset's „Acte” is what its inspector may get); the signed report stays in „Livrabile”.
  if (typeof b.to === "string") {
    const to = await resolveFolder(a.db, id, b.to);
    if (!to) return err("Folderul nu mai există.", 404);
    const docs = (Array.isArray(b.docs) ? b.docs : []).map(String).slice(0, 500);
    const folders = (Array.isArray(b.folders) ? b.folders : []).map(String).slice(0, 100);
    let moved = 0;
    for (const f of folders) {
      if (await isInside(a.db, id, to.key, `f:${f}`)) return err("Un folder nu se poate muta în el însuși.");
      const r = await a.db.prepare("UPDATE report_folders SET parent = ? WHERE id = ? AND report_id = ?").bind(to.key, f, id).run();
      moved += r.meta.changes ?? 0;
      // what is inside follows the asset of the new place
      await a.db.prepare(`UPDATE report_documents SET asset_id = ? WHERE report_id = ? AND kind = 'source' AND folder IN (
          WITH RECURSIVE t(k) AS (SELECT 'f:' || ? UNION SELECT 'f:' || x.id FROM report_folders x JOIN t ON x.parent = t.k WHERE x.report_id = ?) SELECT k FROM t)`)
        .bind(to.asset, id, f, id).run();
    }
    for (const d of docs) {
      const r = await a.db.prepare("UPDATE report_documents SET folder = ?, asset_id = ? WHERE id = ? AND report_id = ? AND kind = 'source'").bind(to.key, to.asset, d, id).run();
      moved += r.meta.changes ?? 0;
    }
    if (!moved) return err("Nimic de mutat (raportul semnat și actele din comandă rămân la locul lor).");
    await audit(a.db, actor, "report.document_move", "report", id, `${moved} ${moved === 1 ? "element mutat" : "elemente mutate"} în ${to.key}`);
    if (docs.length) await resyncUvalo(a.db, { reportId: id });
    return Response.json({ ok: true, moved });
  }
  // Renamed (F2): `{ rename: <doc id>, name }` — the extension stays; not to a name taken in the same folder.
  if (typeof b.rename === "string") {
    const d = await a.db.prepare(`SELECT d.id, d.filename, ${FOLDER_SQL("d")} AS folder, d.kind FROM report_documents d WHERE d.id = ? AND d.report_id = ? AND d.status = 'uploaded'`)
      .bind(b.rename, id).first<{ id: string; filename: string; folder: string; kind: string }>();
    if (!d) return err("Documentul nu există.", 404);
    const ext = d.filename.match(/\.\w{2,5}$/)?.[0] ?? "";
    let name = String(b.name ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").trim().slice(0, 140);
    if (ext && !name.toLowerCase().endsWith(ext.toLowerCase())) name += ext;
    if (!name || name === ext) return err("Scrie un nume.");
    if (name !== d.filename) {
      const taken = await sameName(a.db, id, d.folder, name);
      if (taken && taken.id !== d.id) return err(`În folder există deja „${name}”.`, 409);
      await a.db.prepare("UPDATE report_documents SET filename = ? WHERE id = ?").bind(name, d.id).run();
      await audit(a.db, actor, "report.document_rename", "report", id, `${d.filename} → ${name}`);
    }
    return Response.json({ ok: true, name });
  }
  // Marked in „Dosar de lucru”: `{ mark: <doc id>, role: "final" | "grid" | "word" | null }`. „final” = the signed PDF
  // delivered (the row becomes kind 'final'; the one marked before goes back to an ordinary file, in its folder); the
  // working grid and the report in Word: one of each per report.
  if (typeof b.mark === "string") {
    const d = await a.db.prepare(`SELECT d.id, d.filename, d.kind, d.role, ${FOLDER_SQL("d")} AS folder FROM report_documents d WHERE d.id = ? AND d.report_id = ? AND d.status = 'uploaded'`)
      .bind(b.mark, id).first<{ id: string; filename: string; kind: string; role: string | null; folder: string }>();
    if (!d) return err("Documentul nu există.", 404);
    const role = b.role === "final" || b.role === "grid" || b.role === "word" ? b.role : null;
    if (role === "final" && !/\.pdf$/i.test(d.filename)) return err("Raportul final livrat se marchează pe fișierul PDF semnat.");
    if (role === "grid" && !/\.(xlsx?|xlsm|ods|csv)$/i.test(d.filename)) return err("Grila de lucru se marchează pe un fișier Excel (.xlsx, .xls).");
    if (role === "word" && !/\.(docx?|odt|rtf)$/i.test(d.filename)) return err("Raportul în format Word se marchează pe un fișier .docx / .doc.");
    const keep = (x: string) => a.db.prepare(`UPDATE report_documents SET folder = ${FOLDER_SQL("report_documents").replace(/report_documents\./g, "")} WHERE ${x}`);
    const steps: D1PreparedStatement[] = [];
    if (role === "final") {
      // the one marked before: an ordinary file again, where it is
      steps.push(keep("report_id = ? AND kind = 'final' AND id <> ?").bind(id, d.id), a.db.prepare("UPDATE report_documents SET kind = 'source' WHERE report_id = ? AND kind = 'final' AND id <> ?").bind(id, d.id));
      steps.push(keep("id = ?").bind(d.id), a.db.prepare("UPDATE report_documents SET kind = 'final', role = NULL WHERE id = ?").bind(d.id));
      steps.push(a.db.prepare("UPDATE reports SET uploaded_on = ?, updated_at = ? WHERE id = ?").bind(now().slice(0, 10), now(), id));
    } else {
      if (d.kind === "final") steps.push(keep("id = ?").bind(d.id), a.db.prepare("UPDATE report_documents SET kind = 'source' WHERE id = ?").bind(d.id));
      if (role) steps.push(a.db.prepare("UPDATE report_documents SET role = NULL WHERE report_id = ? AND role = ? AND id <> ?").bind(id, role, d.id));
      steps.push(a.db.prepare("UPDATE report_documents SET role = ? WHERE id = ?").bind(role, d.id));
    }
    await a.db.batch(steps);
    const label = role === "final" ? "raport PDF final (livrat)" : role === "grid" ? "grilă de lucru" : role === "word" ? "raport Word" : "nemarcat";
    await audit(a.db, actor, role === "final" ? "report.final" : "report.document_role", "report", id, `${d.filename}: ${label}`);
    return Response.json({ ok: true });
  }
  // An earlier version made current: `{ restore: <doc id>, version: <version id> }`.
  if (typeof b.restore === "string") {
    const v = await restoreVersion(a.db, id, b.restore, String(b.version ?? ""), a.user.id);
    if (!v) return err("Versiunea nu mai există.", 404);
    await audit(a.db, actor, "report.document_restore", "report", id, `versiunea restaurată devine ${v}`);
    return Response.json({ ok: true, version: v });
  }
  // The ticks for the inspector, all at once ("Actualizează la inspector"): `{ insp: [{ doc, origin, on }] }`.
  if (Array.isArray(b.insp)) {
    const open = await a.db.prepare(`SELECT 1 AS x FROM inspections WHERE report_id = ? AND status IN ('to_schedule', 'scheduled') AND glide_id IS NULL AND inspector_id IS NOT NULL LIMIT 1`).bind(id).first();
    if (!open) return err("Raportul nu are o inspecție alocată și nefinalizată: actele se aleg la alocare.", 409);
    const list = (b.insp as { doc?: unknown; origin?: unknown; on?: unknown }[]).slice(0, 200);
    if (!list.length) return err("Nu s-a schimbat nimic în selecție.");
    const names: string[] = [];
    for (const x of list) {
      const order = x.origin === "order";
      const d = order
        ? await a.db.prepare("SELECT d.id, d.filename FROM order_documents d JOIN reports r ON r.order_id = d.order_id WHERE d.id = ? AND r.id = ?").bind(String(x.doc ?? ""), id).first<{ id: string; filename: string }>()
        : await a.db.prepare("SELECT id, filename FROM report_documents WHERE id = ? AND report_id = ? AND kind = 'source'").bind(String(x.doc ?? ""), id).first<{ id: string; filename: string }>();
      if (!d) continue;
      await a.db.prepare(`UPDATE ${order ? "order_documents" : "report_documents"} SET insp_visible = ? WHERE id = ?`).bind(x.on === true ? 1 : 0, d.id).run();
      names.push(`${d.filename} ${x.on === true ? "✓" : "✗"}`);
    }
    await audit(a.db, `user:${a.user.id}`, "report.document_insp", "report", id, names.join(", ").slice(0, 500) || "actualizat");
    // the documents go to UVALO, then the valuer gets a notification on the phone
    const sent = await resyncUvalo(a.db, { reportId: id }, "docs");
    return Response.json({ ok: true, sent });
  }
  if (typeof b.insp_visible === "boolean") {
    const order = b.origin === "order";
    const d = order
      ? await a.db.prepare("SELECT d.id, d.filename FROM order_documents d JOIN reports r ON r.order_id = d.order_id WHERE d.id = ? AND r.id = ?").bind(String(b.doc ?? ""), id).first<{ id: string; filename: string }>()
      : await a.db.prepare("SELECT id, filename FROM report_documents WHERE id = ? AND report_id = ? AND kind = 'source'").bind(String(b.doc ?? ""), id).first<{ id: string; filename: string }>();
    if (!d) return err("Documentul nu există.", 404);
    await a.db.prepare(`UPDATE ${order ? "order_documents" : "report_documents"} SET insp_visible = ? WHERE id = ?`).bind(b.insp_visible ? 1 : 0, d.id).run();
    await audit(a.db, `user:${a.user.id}`, "report.document_insp", "report", id, `${d.filename}: ${b.insp_visible ? "vizibil inspectorului" : "ascuns inspectorului"}`);
    const sent = await resyncUvalo(a.db, { reportId: id });
    return Response.json({ ok: true, sent });
  }
  const d = await a.db.prepare("SELECT id, filename FROM report_documents WHERE id = ? AND report_id = ? AND kind = 'source'").bind(String(b.doc ?? ""), id).first<{ id: string; filename: string }>();
  if (!d) return err("Documentul nu există.", 404);
  const type = DOC_KIND_KEYS.includes(String(b.doc_type)) ? String(b.doc_type) : null;
  const asset = b.asset ? (await a.db.prepare("SELECT id FROM assets WHERE id = ? AND report_id = ?").bind(String(b.asset), id).first<{ id: string }>())?.id ?? null : null;
  await a.db.prepare("UPDATE report_documents SET doc_type = ?, asset_id = CASE WHEN ? THEN ? ELSE asset_id END WHERE id = ?").bind(type, "asset" in b ? 1 : 0, asset, d.id).run();
  await audit(a.db, `user:${a.user.id}`, "report.document_type", "report", id, `${d.filename}: ${docKindLabel(type)}`);
  await resyncUvalo(a.db, { reportId: id });
  return Response.json({ ok: true });
}

/** The documents of one asset (`?asset=`), for the drop zone of the asset form. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "view");
  if ("res" in a) return a.res;
  const asset = new URL(req.url).searchParams.get("asset") ?? "";
  const { results } = await a.db.prepare(`SELECT id, filename, size_bytes, doc_type FROM report_documents WHERE report_id = ? AND kind = 'source' AND status = 'uploaded' AND asset_id = ? ORDER BY created_at`)
    .bind(id, asset).all<{ id: string; filename: string; size_bytes: number | null; doc_type: string | null }>();
  return Response.json({ docs: results });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const docId = new URL(req.url).searchParams.get("doc") ?? "";
  // a document only asked for (marked missing, nothing uploaded): cancelled by whoever handles the documents
  const asked = await getDb().then((db) => db?.prepare("SELECT status FROM report_documents WHERE id = ? AND report_id = ?").bind(docId, id).first<{ status: string }>()).catch(() => null);
  const a = await reportApi(id, asked?.status === "missing" ? "docs" : "docsDelete", true);
  if ("res" in a) return a.res;
  const d = await a.db.prepare("SELECT id, filename, r2_key, status FROM report_documents WHERE id = ? AND report_id = ?").bind(docId, id).first<{ id: string; filename: string; r2_key: string | null; status: string }>();
  if (!d) return err("Documentul nu există.", 404);
  const store = await bucket();
  for (const k of new Set([d.r2_key, ...(await versionKeys(a.db, d.id))])) if (k) await store?.delete(k);
  await a.db.batch([a.db.prepare("DELETE FROM report_document_versions WHERE doc_id = ?").bind(d.id), a.db.prepare("DELETE FROM report_documents WHERE id = ?").bind(d.id)]);
  await audit(a.db, `user:${a.user.id}`, d.status === "missing" ? "report.document_unrequest" : "report.document_remove", "report", id, d.status === "missing" ? `${d.filename}: nu mai e cerut` : d.filename);
  return Response.json({ ok: true });
}
