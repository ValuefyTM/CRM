import { err, json, reportApi } from "@/lib/api";
import { now } from "@/lib/db";
import { bucket } from "@/lib/orders";
import { reportAssets } from "@/lib/reports";
import { parseGeo } from "@/lib/registry";
import { cadastralRoot } from "@/lib/geolocate";
import { geometry, numberCount, parcelFromDoc, saveSite, siteDocs, SiteError, siteOf, unverified, uvaloParcel, writeText } from "@/lib/site-analysis";
import { zoneAt, ZoneError } from "@/lib/site-zone";
import { factsOf, type LL, type Style } from "@/lib/site-shared";

// The site analysis of an asset (tab „Amplasament”), in steps the page calls one after the other, each saved:
// POST { asset, step: "parcel", source: "ancpi" | "doc" | "zone", doc? } → the contour;
// POST { asset, step: "zone" } → the zone around the parcel (OpenStreetMap) and the geometry of the parcel;
// POST { asset, step: "text", style, prompt? } → the text, from the data only;
// POST multipart (asset, fig1, fig2: PNG) → the two maps, for the photo annex.
// PATCH { asset, situated? | in_annex? | text? | send? } → what the valuer completes; send = into the drafting of the report.

const ok = async (db: D1Database, asset: string) => Response.json({ site: await siteOf(db, asset) });
const fail = (e: unknown) => {
  if (e instanceof SiteError || e instanceof ZoneError) return err(e.message, 422);
  console.error("site", e);
  return err("Analiza nu a putut fi făcută. Încearcă din nou.", 500);
};

async function assetOf(db: D1Database, id: string, assetId: string) {
  return (await reportAssets(db, id)).find((x) => x.id === assetId) ?? null;
}

/** A map saved for the photo annex: `?fig=<key>`. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "view");
  if ("res" in a) return a.res;
  const key = new URL(req.url).searchParams.get("fig") ?? "";
  if (!key.startsWith(`reports/${id}/site/`) || key.includes("..")) return err("Nu există.", 404);
  const obj = await (await bucket())?.get(key);
  if (!obj) return err("Harta nu a fost găsită.", 404);
  return new Response(obj.body, { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "view", true);
  if ("res" in a) return a.res;
  if (!a.access.can.edit && !a.access.can.assets) return err("Nu poți modifica bunurile acestui raport.", 403);

  // the maps, drawn by the page
  if ((req.headers.get("content-type") ?? "").startsWith("multipart/")) {
    const form = await req.formData().catch(() => null);
    const assetId = String(form?.get("asset") ?? "");
    if (!form || !(await assetOf(a.db, id, assetId))) return err("Bunul nu există.", 404);
    const r2 = await bucket();
    if (!r2) return err("Stocarea fișierelor nu este disponibilă.", 503);
    const keys: string[] = [];
    for (const n of ["fig1", "fig2"]) {
      const f = form.get(n);
      if (!(f instanceof File) || f.type !== "image/png" || f.size > 6_000_000) continue;
      const key = `reports/${id}/site/${assetId}/${n}-${Date.now()}.png`;
      await r2.put(key, await f.arrayBuffer(), { httpMetadata: { contentType: "image/png" }, customMetadata: { report: id, kind: "site" } });
      keys.push(key);
    }
    if (!keys.length) return err("Hărțile nu au ajuns.");
    const old = (await siteOf(a.db, assetId))?.figures ?? [];
    await saveSite(a.db, id, assetId, { figures: JSON.stringify(keys), in_annex: 1 });
    await Promise.all(old.filter((k) => !keys.includes(k)).map((k) => r2.delete(k).catch(() => {})));
    return ok(a.db, assetId);
  }

  const b = await json(req);
  const assetId = typeof b.asset === "string" ? b.asset : "";
  const asset = await assetOf(a.db, id, assetId);
  if (!asset) return err("Bunul nu există.", 404);
  const ll = parseGeo(asset.geo);

  try {
    if (b.step === "parcel") {
      const source = b.source === "doc" ? "doc" : b.source === "zone" ? "zone" : "ancpi";
      const base = { source, made_by: a.user.id, made_at: now(), zone: null, text: null, style: null, unverified: null, sent_at: null };
      if (source === "zone") {
        if (!ll) return err("Bunul nu are coordonate: completează-le la proprietate (din adresă sau din cadastru).");
        await saveSite(a.db, id, assetId, { ...base, doc_ref: null, parcel: null });
        return ok(a.db, assetId);
      }
      if (source === "doc") {
        const docs = await siteDocs(a.db, id, assetId, asset.cf_file);
        const doc = docs.find((d) => d.ref === b.doc) ?? docs[0];
        if (!doc) return err("Nu am găsit la acte un extras CF sau un plan de amplasament.");
        const r = await parcelFromDoc(doc, { ll, county: asset.county });
        await saveSite(a.db, id, assetId, { ...base, doc_ref: doc.ref, parcel: JSON.stringify(r.parcel), ...(r.situated ? { situated: r.situated } : {}) });
        return ok(a.db, assetId);
      }
      const nr = cadastralRoot(asset.cad_land) ?? cadastralRoot(asset.cad_building) ?? cadastralRoot(asset.cf_number);
      let r = nr ? await uvaloParcel({ nr, city: asset.city }) : null;
      if (!r?.parcel && ll) r = await uvaloParcel({ lat: ll[0], lng: ll[1] });
      if (!r?.parcel) return err(`${r?.message ?? "Bunul nu are număr cadastral sau coordonate."} Alege un act cu coordonate sau doar analiza zonei.`, 404);
      await saveSite(a.db, id, assetId, { ...base, doc_ref: null, parcel: JSON.stringify(r.parcel) });
      return ok(a.db, assetId);
    }

    const site = await siteOf(a.db, assetId);
    if (!site) return err("Fă întâi analiza.");

    if (b.step === "zone") {
      const at: LL | null = site.parcel?.centre ?? ll;
      if (!at) return err("Bunul nu are coordonate.");
      const zone = await zoneAt(at[0], at[1]);
      const parcel = site.parcel ? { ...site.parcel, geo: geometry(site.parcel, zone.roads) } : null;
      await saveSite(a.db, id, assetId, { zone: JSON.stringify(zone), parcel: parcel ? JSON.stringify(parcel) : null });
      return ok(a.db, assetId);
    }

    if (b.step === "text") {
      const style: Style = b.style === "scurt" || b.style === "academic" ? b.style : "detaliat";
      const prompt = typeof b.prompt === "string" ? b.prompt.trim().slice(0, 1500) || null : null;
      const facts = factsOf(site, { address: asset.full_address, city: asset.city, county: asset.county, type: asset.type });
      const t = await writeText(facts, style, prompt);
      await saveSite(a.db, id, assetId, { text: t.text, style, unverified: JSON.stringify(t.unverified), sent_at: null });
      return ok(a.db, assetId);
    }
  } catch (e) {
    return fail(e);
  }
  return err("Pas necunoscut.");
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "view", true);
  if ("res" in a) return a.res;
  if (!a.access.can.edit && !a.access.can.assets) return err("Nu poți modifica bunurile acestui raport.", 403);
  const b = await json(req);
  const assetId = typeof b.asset === "string" ? b.asset : "";
  const asset = await assetOf(a.db, id, assetId);
  if (!asset) return err("Bunul nu există.", 404);
  const site = await siteOf(a.db, assetId);
  if (!site) return err("Fă întâi analiza.");

  if ("situated" in b) await saveSite(a.db, id, assetId, { situated: b.situated === "intravilan" || b.situated === "extravilan" ? b.situated : null });
  if ("in_annex" in b) await saveSite(a.db, id, assetId, { in_annex: b.in_annex ? 1 : 0 });
  if (typeof b.text === "string") {
    const text = b.text.slice(0, 20000);
    const data = JSON.stringify({ date: factsOf(site, { address: asset.full_address, city: asset.city, county: asset.county, type: asset.type }) }, null, 1);
    await saveSite(a.db, id, assetId, { text, unverified: JSON.stringify(unverified(text, data)), sent_at: null });
  }
  if (b.send) {
    const cur = await siteOf(a.db, assetId);
    if (!cur?.text) return err("Nu există text de trimis.");
    // the drafting mode's field „Amplasament · zona”: the text as a draft, the bracketed parts as what is missing
    const missing = [...cur.text.matchAll(/\[de completat:\s*([^\]]+)\]/gi)].map((m) => m[1].trim()).slice(0, 30);
    const at = now();
    await a.db.prepare(`INSERT INTO report_drafts (report_id, asset_id, field, text, state, missing, model, gen_at, copied_at, updated_by, updated_at) VALUES (?1, ?2, 'amplasament', ?3, 'draft', ?4, 'amplasament', ?5, NULL, ?6, ?5)
        ON CONFLICT(report_id, asset_id, field) DO UPDATE SET text = excluded.text, state = 'draft', missing = excluded.missing, model = excluded.model, gen_at = excluded.gen_at, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
      .bind(id, assetId, cur.text, JSON.stringify(missing), at, a.user.id).run();
    await saveSite(a.db, id, assetId, { sent_at: at });
  }
  const out = await siteOf(a.db, assetId);
  return Response.json({ site: out, numbers: out?.text ? numberCount(out.text) : 0 });
}
