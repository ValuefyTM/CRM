import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { fmtDate, staffPage } from "@/lib/guard";
import { cap, getReport, reportAssets, reportDocuments, reportOrderDocuments } from "@/lib/reports";
import { fileSrc } from "@/lib/files";
import { reportAccess } from "@/lib/perms-db";
import { photoGroup } from "@/lib/insp-sheet-doc";
import { PHOTO_CATEGORIES } from "@/lib/insp-forms";
import { CrmShell } from "@/components/CrmShell";
import { siteOf } from "@/lib/site-analysis";
import { AnexaBuilder, type SrcDoc, type SrcPhoto } from "./AnexaBuilder";

export const metadata: Metadata = { title: "Anexă | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/**
 * The annex of an asset, as UVALO's Word add-in makes it: its photos (Anexă foto) or its documents (Anexă documente)
 * arranged in pages — which ones, in what order, how many per page, captions, titles — and exported as PDF or Word.
 */
export default async function AnexaPage({ params, searchParams }: { params: Promise<{ id: string; asset: string }>; searchParams: Promise<{ mod?: string }> }) {
  const { db, user, base } = await staffPage();
  const { id, asset } = await params;
  const mode = (await searchParams).mod === "acte" ? "acte" : "foto";
  const r = await getReport(db, id);
  if (!r) notFound();
  const acc = await reportAccess(db, user, r);
  if (!acc.view) redirect(`${base}/rapoarte?fara-acces=1`);
  const a = (await reportAssets(db, id)).find((x) => x.id === asset);
  if (!a) notFound();

  // the photos of the asset's inspections, newest inspection first, in the order of the sheet
  const { results: insp } = await db.prepare(`SELECT i.id, i.done_at, i.scheduled_at, i.created_at, i.uvalo_id, COALESCE(NULLIF(u.name, ''), u.email) AS inspector
      FROM inspections i LEFT JOIN users u ON u.id = i.inspector_id WHERE i.asset_id = ? ORDER BY COALESCE(i.done_at, i.scheduled_at, i.created_at) DESC`)
    .bind(a.id).all<{ id: string; done_at: string | null; scheduled_at: string | null; created_at: string; uvalo_id: string | null; inspector: string | null }>();
  const ids = insp.map((i) => i.id);
  const { results: raw } = ids.length ? await db.prepare(`SELECT id, inspection_id, category, caption, album, r2_key, taken_at FROM inspection_photos
      WHERE deleted_at IS NULL AND inspection_id IN (${ids.map(() => "?").join(", ")}) ORDER BY sort, created_at`).bind(...ids)
    .all<{ id: string; inspection_id: string; category: string; caption: string | null; album: string | null; r2_key: string; taken_at: string | null }>() : { results: [] };
  const catLabel = (k: string) => PHOTO_CATEGORIES.find((c) => c.k === k)?.label ?? "Fotografie";
  const photos: SrcPhoto[] = raw.map((p) => {
    const i = insp.find((x) => x.id === p.inspection_id);
    return { id: p.id, src: fileSrc(`r2:${p.r2_key}`)!, name: `${p.caption || catLabel(p.category)}.jpg`, group: photoGroup(p, !!i?.uvalo_id), desc: p.caption || catLabel(p.category),
      taken: p.taken_at, inspection: p.inspection_id };
  });
  const inspections = insp.filter((i) => photos.some((p) => p.inspection === i.id))
    .map((i) => ({ id: i.id, label: `Inspecția din ${fmtDate(i.done_at ?? i.scheduled_at ?? i.created_at)}${i.inspector ? ` · ${i.inspector}` : ""}` }));
  // the maps of the site analysis (tab „Amplasament”), when they were added to the annex
  const site = await siteOf(db, a.id);
  if (site?.in_annex && site.figures.length) {
    const caps = ["Amplasamentul în zonă, dotări în 1,5 km", "Plan de situație"];
    photos.unshift(...site.figures.map((k) => { const i = k.includes("/fig2-") ? 1 : 0; return { id: `site-${i + 1}`, src: `/api/crm/reports/${id}/site?fig=${encodeURIComponent(k)}`, name: `Fig. ${i + 1} ${caps[i]}.png`,
      group: "Amplasament", desc: caps[i], taken: site.made_at, inspection: "site" }; }));
    inspections.unshift({ id: "site", label: "Analiza amplasamentului" });
  }

  // the documents of the asset (and of the whole report or order): the PDFs and the images
  const [docs, orderDocs] = await Promise.all([reportDocuments(db, id), reportOrderDocuments(db, r.order_id)]);
  const isDoc = (name: string, type: string | null) => /\.(pdf|jpe?g|png|webp)$/i.test(name) || /pdf|image\/(jpeg|png|webp)/.test(type ?? "");
  const srcDocs: SrcDoc[] = [
    ...docs.filter((x) => x.kind === "source" && x.status !== "missing" && (!x.asset_id || x.asset_id === a.id) && isDoc(x.filename, x.content_type))
      .map((x) => ({ id: x.id, name: x.filename, url: `/api/crm/reports/${r.id}/documents/${x.id}`, pdf: /\.pdf$/i.test(x.filename) || x.content_type === "application/pdf" })),
    ...orderDocs.filter((x) => isDoc(x.filename, x.content_type ?? null))
      .map((x) => ({ id: x.id, name: x.filename, url: `/api/crm/orders/${r.order_id}/documents/${x.id}`, pdf: /\.pdf$/i.test(x.filename) || x.content_type === "application/pdf" })),
    ...[a.cf_file ? { k: "cf", name: `Extras CF ${a.cf_number ?? ""}`.trim(), path: a.cf_file } : null, a.plan_file ? { k: "rlv", name: `Releveu ${cap(a.type)}`.trim(), path: a.plan_file } : null]
      .filter((x): x is { k: string; name: string; path: string } => !!x && !!fileSrc(x.path))
      .map((x) => ({ id: `${x.k}-${a.id}`, name: /\.pdf$/i.test(x.path) ? `${x.name}.pdf` : x.name, url: fileSrc(x.path)!, pdf: /\.pdf$/i.test(x.path) })),
  ];

  const label = `${cap(a.type) || "Bun"}${a.full_address ? ` · ${a.full_address}` : a.city ? ` · ${a.city}` : ""}`;
  const fileBase = `Anexa ${mode === "foto" ? "foto" : "documente"} ${r.number ? `raport ${r.number}` : ""} ${cap(a.type) || ""}`.replace(/\s+/g, " ").trim();
  const back = `${base}/rapoarte/${id}/bun/${a.id}?tab=${mode === "foto" ? "fotografii" : "acte"}`;
  return (
    <CrmShell back={{ href: back, label: mode === "foto" ? "Fotografii" : "Acte" }} user={user} base={base} active="reports"
      title={mode === "foto" ? "Anexă foto" : "Anexă documente"} subtitle={`${r.number ? `Raport nr. ${r.number} · ` : ""}${label}`}>
      <AnexaBuilder key={mode} mode={mode} scope={`${a.id}:${mode}`} photos={photos} inspections={inspections} docs={srcDocs} fileBase={fileBase}
        report={id} asset={a.id} canSave={acc.can.docs && !acc.locked} />
    </CrmShell>
  );
}
