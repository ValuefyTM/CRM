import { audit } from "@/lib/auth";
import { now, uuid } from "@/lib/db";
import { err, json, reportApi } from "@/lib/api";
import { bucket } from "@/lib/orders";
import { fileType } from "@/lib/file-response";
import { MAX_FILE_MB } from "@/lib/order-labels";
import { DOC_KIND_KEYS, docKindLabel } from "@/lib/doc-kinds";
import { resyncUvalo } from "@/lib/uvalo";

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

  const docId = uuid();
  const safe = file.name.replace(/[^\w.\-() ăâîșțĂÂÎȘȚ]/g, "_").slice(-120) || "document";
  const key = `reports/${id}/${docId}-${safe}`;
  // The whole file (at most MAX_FILE_MB): a stream without a known length is refused by R2 outside the worker.
  await r2.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: fileType(safe) }, customMetadata: { report: id, kind } });

  const requested = typeof form?.get("doc") === "string" ? (form.get("doc") as string) : "";
  const docType = kind === "source" && DOC_KIND_KEYS.includes(String(form?.get("doc_type") ?? "")) ? String(form?.get("doc_type")) : null;
  const assetId = kind === "source" && form?.get("asset")
    ? (await a.db.prepare("SELECT id FROM assets WHERE id = ? AND report_id = ?").bind(String(form.get("asset")), id).first<{ id: string }>())?.id ?? null
    : null;
  if (kind === "final") {
    // One final file per report: the new one replaces the previous.
    const old = await a.db.prepare("SELECT id, r2_key FROM report_documents WHERE report_id = ? AND kind = 'final'").bind(id).all<{ id: string; r2_key: string | null }>();
    for (const o of old.results) {
      if (o.r2_key) await r2.delete(o.r2_key);
      await a.db.prepare("DELETE FROM report_documents WHERE id = ?").bind(o.id).run();
    }
  }
  const missing = requested
    ? await a.db.prepare("SELECT id, filename FROM report_documents WHERE id = ? AND report_id = ? AND status = 'missing'").bind(requested, id).first<{ id: string; filename: string }>()
    : null;
  if (missing) {
    // Keeps the name the document was asked for ("Extras CF garaj.pdf").
    const named = `${missing.filename.replace(/[^\w.\-() ăâîșțĂÂÎȘȚ]/g, "_")}${safe.match(/\.\w{2,4}$/)?.[0] ?? ""}`;
    await a.db.prepare("UPDATE report_documents SET filename = ?, content_type = ?, size_bytes = ?, r2_key = ?, status = 'uploaded', uploaded_by = ?, created_at = ?, doc_type = COALESCE(?, doc_type), asset_id = COALESCE(?, asset_id) WHERE id = ?")
      .bind(named, file.type || null, file.size, key, a.user.id, now(), docType, assetId, missing.id).run();
  } else {
    await a.db.prepare("INSERT INTO report_documents (id, report_id, kind, filename, content_type, size_bytes, r2_key, uploaded_by, doc_type, asset_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(docId, id, kind, safe, file.type || null, file.size, key, a.user.id, docType, assetId).run();
  }
  const savedId = missing?.id ?? docId;
  await a.db.prepare("UPDATE reports SET updated_at = ?, uploaded_on = CASE WHEN ? = 'final' THEN ? ELSE uploaded_on END WHERE id = ?").bind(now(), kind, now().slice(0, 10), id).run();
  await audit(a.db, actor, kind === "final" ? "report.final" : "report.document", "report", id, safe);
  // A document uploaded after the inspection was sent: it reaches the inspector in UVALO too (when it is to be seen).
  if (kind === "source") await resyncUvalo(a.db, { reportId: id });
  return Response.json({ ok: true, id: savedId });
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
  const a = await reportApi(id, "docsDelete", true);
  if ("res" in a) return a.res;
  const docId = new URL(req.url).searchParams.get("doc") ?? "";
  const d = await a.db.prepare("SELECT id, filename, r2_key FROM report_documents WHERE id = ? AND report_id = ?").bind(docId, id).first<{ id: string; filename: string; r2_key: string | null }>();
  if (!d) return err("Documentul nu există.", 404);
  if (d.r2_key) await (await bucket())?.delete(d.r2_key);
  await a.db.prepare("DELETE FROM report_documents WHERE id = ?").bind(d.id).run();
  await audit(a.db, `user:${a.user.id}`, "report.document_remove", "report", id, d.filename);
  return Response.json({ ok: true });
}
