// What an annex is made of (Anexă foto / Anexă documente): the photos of the assets' inspections and the maps of the site
// analysis, or the documents (PDFs and images) of the assets and of the whole report or order. For one asset (its page)
// or for several (the report's „Acte & livrare”, the annex of the report).
import { fmtDate } from "./guard";
import { cap, reportAssets, reportDocuments, reportOrderDocuments } from "./reports";
import { fileSrc } from "./files";
import { photoGroup } from "./insp-sheet-doc";
import { PHOTO_CATEGORIES } from "./insp-forms";
import { siteOf } from "./site-analysis";

export type AnnexMode = "foto" | "acte";
export type AnnexPhoto = { id: string; src: string; name: string; group: string; desc: string; taken: string | null; inspection: string };
export type AnnexDoc = { id: string; name: string; url: string; pdf: boolean };
export type AnnexSources = { photos: AnnexPhoto[]; inspections: { id: string; label: string }[]; docs: AnnexDoc[]; fileBase: string };

const catLabel = (k: string) => PHOTO_CATEGORIES.find((c) => c.k === k)?.label ?? "Fotografie";

export async function annexSources(db: D1Database, r: { id: string; number: string | null; order_id: string | null }, assetIds: string[], mode: AnnexMode): Promise<AnnexSources> {
  const all = await reportAssets(db, r.id);
  const chosen = all.filter((a) => assetIds.includes(a.id));
  const many = chosen.length > 1;
  const short = (a: (typeof all)[number]) => cap(a.type) || "Bun";
  const photos: AnnexPhoto[] = [];
  const inspections: { id: string; label: string }[] = [];
  if (mode === "foto") {
    for (const a of chosen) {
      // the photos of the asset's inspections, newest inspection first, in the order of the sheet
      const { results: insp } = await db.prepare(`SELECT i.id, i.done_at, i.scheduled_at, i.created_at, i.uvalo_id, COALESCE(NULLIF(u.name, ''), u.email) AS inspector
          FROM inspections i LEFT JOIN users u ON u.id = i.inspector_id WHERE i.asset_id = ? ORDER BY COALESCE(i.done_at, i.scheduled_at, i.created_at) DESC`)
        .bind(a.id).all<{ id: string; done_at: string | null; scheduled_at: string | null; created_at: string; uvalo_id: string | null; inspector: string | null }>();
      const ids = insp.map((i) => i.id);
      const { results: raw } = ids.length ? await db.prepare(`SELECT id, inspection_id, category, caption, album, r2_key, taken_at FROM inspection_photos
          WHERE deleted_at IS NULL AND inspection_id IN (${ids.map(() => "?").join(", ")}) ORDER BY sort, created_at`).bind(...ids)
        .all<{ id: string; inspection_id: string; category: string; caption: string | null; album: string | null; r2_key: string; taken_at: string | null }>() : { results: [] };
      // the maps of the site analysis (tab „Amplasament”), when they were added to the annex
      const site = await siteOf(db, a.id);
      if (site?.in_annex && site.figures.length) {
        const caps = ["Amplasamentul în zonă, dotări în 1,5 km", "Plan de situație"];
        const g = `site-${a.id}`;
        photos.push(...site.figures.map((k) => { const i = k.includes("/fig2-") ? 1 : 0; return { id: `site-${a.id}-${i + 1}`, src: `/api/crm/reports/${r.id}/site?fig=${encodeURIComponent(k)}`, name: `Fig. ${i + 1} ${caps[i]}.png`,
          group: "Amplasament", desc: caps[i], taken: site.made_at, inspection: g }; }));
        inspections.push({ id: g, label: `${many ? `${short(a)} · ` : ""}Analiza amplasamentului` });
      }
      for (const p of raw) {
        const i = insp.find((x) => x.id === p.inspection_id);
        photos.push({ id: p.id, src: fileSrc(`r2:${p.r2_key}`)!, name: `${p.caption || catLabel(p.category)}.jpg`, group: photoGroup(p, !!i?.uvalo_id), desc: p.caption || catLabel(p.category),
          taken: p.taken_at, inspection: p.inspection_id });
      }
      inspections.push(...insp.filter((i) => raw.some((p) => p.inspection_id === i.id))
        .map((i) => ({ id: i.id, label: `${many ? `${short(a)} · ` : ""}Inspecția din ${fmtDate(i.done_at ?? i.scheduled_at ?? i.created_at)}${i.inspector ? ` · ${i.inspector}` : ""}` })));
    }
  }

  // the documents of the assets (and of the whole report or order): the PDFs and the images
  const docs: AnnexDoc[] = [];
  if (mode === "acte") {
    const [rd, od] = await Promise.all([reportDocuments(db, r.id), reportOrderDocuments(db, r.order_id)]);
    const isDoc = (name: string, type: string | null) => /\.(pdf|jpe?g|png|webp)$/i.test(name) || /pdf|image\/(jpeg|png|webp)/.test(type ?? "");
    // not the annexes themselves, nor the deliverables of the working folder
    docs.push(...rd.filter((x) => x.kind === "source" && x.status !== "missing" && !x.role && (!x.asset_id || assetIds.includes(x.asset_id)) && isDoc(x.filename, x.content_type))
      .map((x) => ({ id: x.id, name: x.filename, url: `/api/crm/reports/${r.id}/documents/${x.id}`, pdf: /\.pdf$/i.test(x.filename) || x.content_type === "application/pdf" })));
    docs.push(...od.filter((x) => isDoc(x.filename, x.content_type ?? null))
      .map((x) => ({ id: x.id, name: x.filename, url: `/api/crm/orders/${r.order_id}/documents/${x.id}`, pdf: /\.pdf$/i.test(x.filename) || x.content_type === "application/pdf" })));
    for (const a of chosen) {
      docs.push(...[a.cf_file ? { k: "cf", name: `Extras CF ${a.cf_number ?? ""}`.trim(), path: a.cf_file } : null, a.plan_file ? { k: "rlv", name: `Releveu ${cap(a.type)}`.trim(), path: a.plan_file } : null]
        .filter((x): x is { k: string; name: string; path: string } => !!x && !!fileSrc(x.path))
        .map((x) => ({ id: `${x.k}-${a.id}`, name: /\.pdf$/i.test(x.path) ? `${x.name}.pdf` : x.name, url: fileSrc(x.path)!, pdf: /\.pdf$/i.test(x.path) })));
    }
  }

  const fileBase = `Anexa ${mode === "foto" ? "foto" : "documente"} ${r.number ? `raport ${r.number}` : ""} ${chosen.length === 1 ? cap(chosen[0].type) || "" : ""}`.replace(/\s+/g, " ").trim();
  return { photos, inspections, docs, fileBase };
}

/** The report's own annex (generated from „Acte & livrare”): the name of its PDF in the report's folder. */
export const annexName = (mode: AnnexMode, number: string | null) => `Anexa ${mode === "foto" ? "foto" : "documente"}${number ? ` raport ${number}` : ""}`;
