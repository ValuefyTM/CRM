// Server-only: the documents an inspector needs at the visit — at least the land book extract (CF) and the floor
// survey (releveu, RLV). They come from the report's documents (marked CF / RLV, or recognised by their name), from
// the order (uploaded by the client in the portal) and, for older files, from Glide.
export type DocType = "cf" | "rlv";
export const DOC_TYPE_LABEL: Record<DocType, string> = { cf: "Extras CF", rlv: "Releveu" };

export type InspDoc = {
  ref: string;              // r-<report document id> | o-<order document id> | g-<asset id>-cf / -rlv
  // "alte": another document the evaluator chose to give (act de proprietate, certificat…).
  type: DocType | "alte"; name: string; asset_id: string | null; content_type: string | null;
  key: string | null;       // R2 key
  url: string | null;       // external file (Glide)
};

/** CF or RLV from a file name ("Extras CF 284120.pdf", "releveu ap 12.pdf", "RLV.jpg"). */
export function guessDocType(name: string): DocType | null {
  const n = name.toLowerCase();
  if (/(^|[^a-z])cf([^a-z]|$)|extras|carte.?funciar/.test(n)) return "cf";
  if (/(^|[^a-z])rlv([^a-z]|$)|relev[eé]|schi[tț]|plan.?(apartament|etaj|parter|cadastral|amplasament)|cadastr/.test(n)) return "rlv";
  return null;
}

const ORDER_KIND: Record<string, DocType> = { cf: "cf", plan: "rlv", cadastre: "rlv", site_plan: "rlv" };
const typeOfExt = (u: string) => /\.pdf(\?|$)/i.test(u) ? "application/pdf" : /\.(jpe?g|png|webp|gif|heic)(\?|$)/i.test(u) ? `image/${u.match(/\.(jpe?g|png|webp|gif|heic)(\?|$)/i)![1].toLowerCase().replace("jpg", "jpeg")}` : null;

/** CF / RLV documents of some assets of a report (documents of the whole report and of its order count for each asset). */
export async function assetDocs(db: D1Database, reportId: string, assetIds: string[]): Promise<InspDoc[]> {
  if (!assetIds.length) return [];
  const marks = assetIds.map(() => "?").join(", ");
  const [rep, ord, glide] = await Promise.all([
    db.prepare(`SELECT id, filename, content_type, r2_key, doc_type, asset_id FROM report_documents
        WHERE report_id = ? AND kind = 'source' AND status = 'uploaded' AND r2_key IS NOT NULL AND (asset_id IS NULL OR asset_id IN (${marks})) ORDER BY created_at`)
      .bind(reportId, ...assetIds).all<{ id: string; filename: string; content_type: string | null; r2_key: string; doc_type: string | null; asset_id: string | null }>(),
    db.prepare(`SELECT d.id, d.kind, d.filename, d.content_type, d.r2_key FROM order_documents d JOIN reports r ON r.order_id = d.order_id WHERE r.id = ? ORDER BY d.created_at`)
      .bind(reportId).all<{ id: string; kind: string; filename: string; content_type: string | null; r2_key: string }>(),
    db.prepare(`SELECT a.id, p.cf_file, p.plan_file, p.cf_number FROM assets a JOIN crm_properties p ON p.id = a.property_id WHERE a.id IN (${marks})`)
      .bind(...assetIds).all<{ id: string; cf_file: string | null; plan_file: string | null; cf_number: string | null }>(),
  ]);
  const out: InspDoc[] = [];
  for (const d of rep.results) {
    const type = d.doc_type === "cf" || d.doc_type === "rlv" ? d.doc_type : d.doc_type ? null : guessDocType(d.filename);
    if (type) out.push({ ref: `r-${d.id}`, type, name: d.filename, asset_id: d.asset_id, content_type: d.content_type, key: d.r2_key, url: null });
  }
  for (const d of ord.results) {
    const type = ORDER_KIND[d.kind] ?? (d.kind === "other" ? guessDocType(d.filename) : null);
    if (type) out.push({ ref: `o-${d.id}`, type, name: d.filename, asset_id: null, content_type: d.content_type, key: d.r2_key, url: null });
  }
  for (const g of glide.results) {
    for (const [type, v] of [["cf", g.cf_file], ["rlv", g.plan_file]] as const) {
      if (!v || v.startsWith("lost:")) continue;
      const r2 = v.startsWith("r2:") ? v.slice(3) : null;
      out.push({ ref: `g-${g.id}-${type}`, type, name: type === "cf" ? `Extras CF${g.cf_number ? ` ${g.cf_number}` : ""}` : "Releveu", asset_id: g.id,
        content_type: typeOfExt(r2 ?? v), key: r2, url: r2 ? null : v });
    }
  }
  return out;
}

/** The type of an order document (portal upload) for the inspector. */
export const typeOfOrderDoc = (kind: string, name: string): DocType | "alte" => ORDER_KIND[kind] ?? (kind === "other" ? guessDocType(name) : null) ?? "alte";

/** Whether the inspector sees a document: ticked in the report, else by default the CF extract and the floor survey. */
export const inspVisible = (flag: number | null | undefined, type: DocType | "alte" | null) => (flag == null ? type === "cf" || type === "rlv" : flag === 1);

/** The type of a report document for the inspector: CF / RLV (marked, else recognised by its name) or another document. */
export const typeOfReportDoc = (docType: string | null, name: string): DocType | "alte" => {
  const t = docType === "cf" || docType === "rlv" ? docType : docType ? null : guessDocType(name);
  return t ?? "alte";
};

/**
 * The documents an inspector may open for an inspection, as ticked in the report's documents (by default the CF
 * extract and the floor survey): the report's own (of the whole report or of its assets), the order's, and the old
 * CRM's CF / RLV. Read each time, so a document uploaded or ticked later reaches the inspector too.
 */
export async function docsForInspection(db: D1Database, _inspectionId: string, reportId: string, assetIds: string[]): Promise<InspDoc[]> {
  const marks = assetIds.map(() => "?").join(", ") || "''";
  const [rep, ord, glide] = await Promise.all([
    db.prepare(`SELECT id, filename, content_type, r2_key, doc_type, asset_id, insp_visible FROM report_documents
        WHERE report_id = ? AND kind = 'source' AND status = 'uploaded' AND r2_key IS NOT NULL AND (asset_id IS NULL OR asset_id IN (${marks})) ORDER BY created_at`)
      .bind(reportId, ...assetIds).all<{ id: string; filename: string; content_type: string | null; r2_key: string; doc_type: string | null; asset_id: string | null; insp_visible: number | null }>(),
    db.prepare(`SELECT d.id, d.kind, d.filename, d.content_type, d.r2_key, d.insp_visible FROM order_documents d JOIN reports r ON r.order_id = d.order_id WHERE r.id = ? ORDER BY d.created_at`)
      .bind(reportId).all<{ id: string; kind: string; filename: string; content_type: string | null; r2_key: string; insp_visible: number | null }>(),
    assetIds.length ? assetDocs(db, reportId, assetIds) : Promise.resolve([] as InspDoc[]),
  ]);
  const out: InspDoc[] = [];
  for (const d of rep.results) {
    const type = typeOfReportDoc(d.doc_type, d.filename);
    if (inspVisible(d.insp_visible, type)) out.push({ ref: `r-${d.id}`, type, name: d.filename, asset_id: d.asset_id, content_type: d.content_type, key: d.r2_key, url: null });
  }
  for (const d of ord.results) {
    const type = typeOfOrderDoc(d.kind, d.filename);
    if (inspVisible(d.insp_visible, type)) out.push({ ref: `o-${d.id}`, type, name: d.filename, asset_id: null, content_type: d.content_type, key: d.r2_key, url: null });
  }
  // The old CRM's CF / RLV files of the assets (no tick: always given).
  out.push(...glide.filter((d) => d.ref.startsWith("g-")));
  return out;
}

/** Which of CF / RLV are missing for an asset. */
export async function missingDocs(db: D1Database, reportId: string, assetId: string): Promise<DocType[]> {
  const docs = await assetDocs(db, reportId, [assetId]);
  return (["cf", "rlv"] as const).filter((t) => !docs.some((d) => d.type === t));
}

/** The CF / RLV state of every asset of a report, for the report page. */
export async function docsByAsset(db: D1Database, reportId: string, assetIds: string[]) {
  const docs = await assetDocs(db, reportId, assetIds);
  return Object.fromEntries(assetIds.map((id) => {
    const mine = docs.filter((d) => !d.asset_id || d.asset_id === id);
    return [id, { cf: mine.filter((d) => d.type === "cf"), rlv: mine.filter((d) => d.type === "rlv") }];
  })) as Record<string, { cf: InspDoc[]; rlv: InspDoc[] }>;
}

/** "extrasul CF și releveul" / "extrasul CF" / "releveul". */
export const missingText = (m: DocType[]) => m.map((t) => (t === "cf" ? "extrasul CF" : "releveul")).join(" și ");

/**
 * The documents chosen for the inspector in a list (the allocation window, a new work): ticked, every other uploaded
 * document of the report unticked. Ids that are not the report's own documents are ignored.
 */
export async function setInspectorDocs(db: D1Database, reportId: string, ids: string[]) {
  const list = ids.filter((x) => typeof x === "string").slice(0, 200);
  await db.prepare(`UPDATE report_documents SET insp_visible = CASE WHEN id IN (${list.map(() => "?").join(", ") || "''"}) THEN 1 ELSE 0 END
      WHERE report_id = ? AND kind = 'source' AND status = 'uploaded'`).bind(...list, reportId).run();
}
