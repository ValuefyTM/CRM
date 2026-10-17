import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { fmtDate, staffPage } from "@/lib/guard";
import { cap, getReport, lei, REPORT_STATUS, reportAssets, reportDocuments, reportOrderDocuments } from "@/lib/reports";
import { fileSrc } from "@/lib/files";
import { reportAccess } from "@/lib/perms-db";
import { assetProfile, FIELD_LABELS, type ProfileField } from "@/lib/asset-labels";
import { inspectionSheetDoc, photoGroup } from "@/lib/insp-sheet-doc";
import { PHOTO_CATEGORIES } from "@/lib/insp-forms";
import { guessDocKind } from "@/lib/doc-kinds";
import { getFirm } from "@/lib/settings";
import { parseGeo } from "@/lib/registry";
import { niceName } from "@/lib/labels";
import { CrmShell } from "@/components/CrmShell";
import { MiniMap } from "@/components/MiniMap";
import { InspSheet } from "../../InspSheet";
import { ReportDocs, type DocItem } from "../../ReportDocs";
import { SafeImg } from "../../ReportActions";
import { AssetPhotos, type Photo } from "./AssetPhotos";

export const metadata: Metadata = { title: "Bun evaluat | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const APPROACH: Record<string, string> = { market: "Piață", income: "Venit", cost: "Cost" };
const INSP_STATUS: Record<string, [string, string]> = {
  done: ["Realizată", "pillOk"], scheduled: ["Programată", "pillInfo"], to_schedule: ["De programat", "pillInfo"], cancelled: ["Anulată", ""],
};
const TABS = [["prezentare", "Prezentare"], ["fotografii", "Fotografii"], ["acte", "Acte"]] as const;
type Tab = (typeof TABS)[number][0];

// What the inspection found (property_features), the most telling columns; utilities are shown apart.
const FEATURES: [col: string, label: string, unit?: string][] = [
  ["usable_area", "Suprafață utilă măsurată", "mp"], ["built_area", "Suprafață construită", "mp"], ["land_area", "Suprafață teren măsurată", "mp"],
  ["rooms", "Camere"], ["bathrooms", "Băi"], ["layout", "Compartimentare"], ["floor", "Etaj"], ["height_regime", "Regim de înălțime"],
  ["year_built", "An construcție"], ["structure", "Structură"], ["walls", "Închideri"], ["roof", "Acoperiș"], ["thermal_insulation", "Termoizolație"],
  ["building_condition", "Starea clădirii"], ["finish_level", "Nivel finisaje"], ["windows", "Tâmplărie"], ["last_renovation", "Ultima renovare"],
  ["heating", "Încălzire"], ["air_conditioning", "Climatizare"], ["installations_condition", "Starea instalațiilor"], ["balconies", "Balcoane"],
  ["orientation", "Orientare"], ["elevator", "Lift"], ["frontage_m", "Front stradal", "m"], ["shape", "Formă teren"], ["slope", "Pantă"],
  ["fencing", "Împrejmuire"], ["access_road", "Acces"], ["urban_zone", "Zonă"], ["land_use", "Categorie de folosință"], ["use_type", "Destinație"],
  ["clear_height_m", "Înălțime liberă", "m"], ["occupancy", "Ocupare"], ["neighbourhood", "Vecinătăți"], ["public_transport", "Transport public"], ["parking", "Parcare"],
];
const UTIL: [k: string, label: string][] = [["water", "Apă"], ["sewer", "Canalizare"], ["gas", "Gaz"], ["power", "Curent"]];

const dateOf = (v: { valuation_date: string | null; report_date: string | null; created_at: string }) => v.valuation_date ?? v.report_date ?? v.created_at.slice(0, 10);
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toLocaleString("ro-RO", { maximumFractionDigits: 1 })}%`;

function Row({ k, children }: { k: string; children?: React.ReactNode }) {
  return <div><dt>{k}</dt><dd>{children ?? "—"}</dd></div>;
}

/** The values of the property over time, one point per valuation (the one looked at is filled). */
function ValueChart({ points, cur }: { points: { t: number; v: number; label: string; on: boolean }[]; cur: string }) {
  const W = 640, H = 220, L = 70, R = 44, T = 18, B = 34;
  const t0 = points[0].t, t1 = points[points.length - 1].t || t0 + 1;
  const vs = points.map((p) => p.v), lo = Math.min(...vs), hi = Math.max(...vs);
  const pad = (hi - lo || hi * 0.1 || 1) * 0.15, y0 = Math.max(0, lo - pad), y1 = hi + pad;
  const x = (t: number) => L + (t1 === t0 ? (W - L - R) / 2 : ((t - t0) / (t1 - t0)) * (W - L - R));
  const y = (v: number) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const ticks = [0, 0.5, 1].map((f) => y0 + f * (y1 - y0));
  const short = (v: number) => (v >= 1e6 ? `${(v / 1e6).toLocaleString("ro-RO", { maximumFractionDigits: 2 })} mil.` : `${Math.round(v / 1e3).toLocaleString("ro-RO")} mii`);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  return (
    <svg className="bvChart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Evoluția valorii, în ${cur}`}>
      {ticks.map((v, i) => (
        <g key={i}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="bvGrid" /><text x={L - 8} y={y(v) + 4} textAnchor="end">{short(v)}</text></g>
      ))}
      <path d={`${path} L${x(points[points.length - 1].t)},${H - B} L${x(t0)},${H - B} Z`} className="bvArea" />
      <path d={path} className="bvLine" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(p.t)} cy={y(p.v)} r={p.on ? 6 : 4.5} className={p.on ? "bvDot on" : "bvDot"}><title>{`${p.label}: ${lei(p.v, cur)}`}</title></circle>
          <text x={x(p.t)} y={H - 12} textAnchor="middle">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

export default async function AssetPage({ params, searchParams }: {
  params: Promise<{ id: string; asset: string }>; searchParams: Promise<{ tab?: string; din?: string }>;
}) {
  const { db, user, base } = await staffPage();
  const { id, asset } = await params;
  const { tab: asked, din } = await searchParams;
  const tab: Tab = TABS.find(([k]) => k === asked)?.[0] ?? "prezentare";
  const r = await getReport(db, id);
  if (!r) notFound();
  const acc = await reportAccess(db, user, r);
  if (!acc.view) redirect(`${base}/rapoarte?fara-acces=1`);
  const assets = await reportAssets(db, id);
  const a = assets.find((x) => x.id === asset);
  if (!a) notFound();
  const cur = r.currency === "EUR" ? "EUR" : "lei";
  // Opened from another valuation of the same property ("din" = that report / asset): the page shows the asset as it was
  // in this valuation, with the way back.
  const [fromReport, fromAsset] = (din ?? "").split(".");
  const from = fromReport && fromAsset && fromReport !== id ? await db.prepare("SELECT r.id, r.number, a.id AS asset FROM assets a JOIN reports r ON r.id = a.report_id WHERE a.id = ? AND r.id = ?")
    .bind(fromAsset, fromReport).first<{ id: string; number: string | null; asset: string }>() : null;
  const keep = from ? `din=${from.id}.${from.asset}` : `din=${id}.${a.id}`;
  const self = (t: Tab) => `${base}/rapoarte/${id}/bun/${a.id}?${[t !== "prezentare" ? `tab=${t}` : "", from ? `din=${from.id}.${from.asset}` : ""].filter(Boolean).join("&")}`.replace(/\?$/, "");

  // The inspections of the asset (the cancelled ones only when they left a sheet), newest first.
  const { results: insp } = await db.prepare(
    `SELECT i.id, i.status, i.scheduled_at, i.done_at, i.created_at, i.glide_id, i.uvalo_id, i.uvalo_code, i.sheet_type,
        COALESCE(NULLIF(u.name, ''), u.email) AS inspector, s.id AS sheet_id, s.photo_url, s.present_person, s.description, s.location,
        (SELECT COUNT(*) FROM inspection_photos f WHERE f.inspection_id = i.id AND f.deleted_at IS NULL) AS photos
      FROM inspections i LEFT JOIN users u ON u.id = i.inspector_id LEFT JOIN inspection_sheets s ON s.inspection_id = i.id
      WHERE i.asset_id = ? AND (i.status <> 'cancelled' OR s.id IS NOT NULL) ORDER BY COALESCE(i.done_at, i.scheduled_at, i.created_at) DESC`,
  ).bind(a.id).all<{ id: string; status: string; scheduled_at: string | null; done_at: string | null; created_at: string; glide_id: string | null; uvalo_id: string | null;
    uvalo_code: string | null; sheet_type: string | null; inspector: string | null; sheet_id: string | null; photo_url: string | null; present_person: string | null;
    description: string | null; location: string | null; photos: number }>();
  const done = insp.filter((i) => i.status === "done");
  const ids = insp.map((i) => i.id);
  const { results: rawPhotos } = ids.length ? await db.prepare(
    `SELECT id, inspection_id, category, caption, album, r2_key, taken_at FROM inspection_photos WHERE deleted_at IS NULL AND inspection_id IN (${ids.map(() => "?").join(", ")})
      ORDER BY sort, created_at`,
  ).bind(...ids).all<{ id: string; inspection_id: string; category: string; caption: string | null; album: string | null; r2_key: string; taken_at: string | null }>() : { results: [] };
  const catLabel = (k: string) => PHOTO_CATEGORIES.find((c) => c.k === k)?.label ?? "Fotografie";
  const photos: Photo[] = rawPhotos.map((p) => {
    const uv = !!insp.find((i) => i.id === p.inspection_id)?.uvalo_id;
    return { id: p.id, inspection: p.inspection_id, src: fileSrc(`r2:${p.r2_key}`)!, group: photoGroup(p, uv), label: p.caption || catLabel(p.category), taken_at: p.taken_at };
  });
  const covers = Object.fromEntries(insp.map((i) => [i.id, rawPhotos.find((p) => p.inspection_id === i.id && `r2:${p.r2_key}` === i.photo_url)?.id ?? null]));
  const coverSrc = fileSrc(a.sheet_photo) ?? photos[0]?.src ?? fileSrc(a.image_url);

  // The sheets, opened over the page as in UVALO.
  const ownIssuer = !r.issuer_name || /valuefy/i.test(r.issuer_name);
  const firm = { name: r.issuer_name ?? "VALUEFY", logo: fileSrc(r.issuer_logo), corp: ownIssuer ? (await getFirm(db)).anevar || null : null };
  const sheets = Object.fromEntries(await Promise.all(done.filter((i) => i.sheet_id).map(async (i) => [i.id, await inspectionSheetDoc(db, id, a.id, i.id)] as const)));

  // What the inspection found, from the latest sheet.
  const feat = done[0] ? await db.prepare("SELECT * FROM property_features WHERE inspection_id = ? ORDER BY observed_at DESC LIMIT 1").bind(done[0].id).first<Record<string, string | number | null>>() : null;
  const featRows = feat ? FEATURES.filter(([k]) => feat[k] != null && feat[k] !== "").map(([k, l, u]) => [l, `${typeof feat[k] === "number" ? (feat[k] as number).toLocaleString("ro-RO") : feat[k]}${u ? ` ${u}` : ""}`] as const) : [];
  const utilRows = feat ? UTIL.filter(([k]) => feat[`${k}_connected`] != null).map(([k, l]) => [l, feat[`${k}_connected`] ? `branșat${feat[`${k}_meter`] === 1 ? ", cu contor" : ""}` : `nebranșat${feat[`${k}_distance_m`] ? `, rețeaua la ${feat[`${k}_distance_m`]} m` : ""}`] as const) : [];

  // Every valuation of the same property (this one included): picked to see the asset as it was then.
  const { results: vals } = await db.prepare(
    `SELECT a.id AS asset_id, a.value, a.approach, r.id, r.number, r.label, r.status, r.delivered_at, r.report_date, r.valuation_date, r.created_at, r.currency, r.purpose,
        c.name AS client, (SELECT COALESCE(NULLIF(u.name, ''), u.email) FROM report_members m JOIN users u ON u.id = m.user_id WHERE m.report_id = r.id AND m.role = 'evaluator' LIMIT 1) AS evaluator,
        (SELECT COUNT(*) FROM assets x WHERE x.report_id = r.id) AS n_assets, r.result_value,
        (SELECT s.photo_url FROM inspection_sheets s WHERE s.asset_id = a.id AND s.photo_url IS NOT NULL ORDER BY s.created_at DESC LIMIT 1) AS photo
      FROM assets a JOIN reports r ON r.id = a.report_id LEFT JOIN entities c ON c.id = r.client_id WHERE a.property_id = ?`,
  ).bind(a.property_id).all<{ asset_id: string; value: number | null; approach: string | null; id: string; number: string | null; label: string | null; status: string; delivered_at: string | null;
    report_date: string | null; valuation_date: string | null; created_at: string; currency: string | null; purpose: string | null; client: string | null; evaluator: string | null;
    n_assets: number; result_value: number | null; photo: string | null }>();
  const history = (await Promise.all(vals.map(async (v) => ({
    ...v, date: dateOf(v), val: v.value ?? (v.n_assets === 1 ? v.result_value : null), cur: v.currency === "EUR" ? "EUR" : "lei",
    open: v.id === id || (await reportAccess(db, user, { id: v.id, status: v.status, delivered_at: v.delivered_at })).view,
  })))).sort((x, y) => y.date.localeCompare(x.date));
  const mineIdx = history.findIndex((v) => v.id === id);

  // Value analytics (in the currency of this report): change over time, per square meter, against the previous valuation.
  const area = a.usable_area ?? (a.land_area && /teren/i.test(a.type ?? "") ? a.land_area : null);
  const series = history.filter((v) => v.val && v.cur === cur).slice().reverse();
  const first = series[0], last = series[series.length - 1];
  const years = first && last ? (new Date(last.date).getTime() - new Date(first.date).getTime()) / (365.25 * 864e5) : 0;
  const change = first?.val && last?.val && series.length > 1 ? ((last.val - first.val) / first.val) * 100 : null;
  const yearly = change != null && years >= 0.5 ? (Math.pow(last.val! / first.val!, 1 / years) - 1) * 100 : null;
  const prevOf = (vId: string) => { const i = series.findIndex((x) => x.id === vId); return i > 0 ? series[i - 1] : null; };
  const avg = series.length ? series.reduce((s, v) => s + v.val!, 0) / series.length : null;
  const prevMine = prevOf(id);
  const mineVal = history[mineIdx]?.val ?? a.value;

  // The documents: the asset's own and the ones of the whole report (or order), as on the report.
  const [docs, orderDocs] = await Promise.all([reportDocuments(db, id), reportOrderDocuments(db, r.order_id)]);
  const docItems: DocItem[] = [
    ...docs.filter((x) => x.kind === "source" && (!x.asset_id || x.asset_id === a.id)).map((x): DocItem => ({ id: x.id, name: x.filename, kind: x.doc_type ?? guessDocKind(x.filename), asset_id: x.asset_id,
      status: x.status === "missing" ? "missing" : "uploaded", origin: "report", href: x.status === "missing" ? null : `/api/crm/reports/${r.id}/documents/${x.id}`, size: x.size_bytes,
      at: x.status === "missing" ? x.requested_at : x.created_at, by: x.uploaded_by_name })),
    ...orderDocs.map((x): DocItem => ({ id: x.id, name: x.filename, kind: guessDocKind(x.filename), asset_id: null, status: "uploaded", origin: "order", href: `/api/crm/orders/${r.order_id}/documents/${x.id}`, size: x.size_bytes, at: x.created_at, by: null })),
    ...[a.cf_file ? { name: `Extras CF ${a.cf_number ?? ""}`.trim(), path: a.cf_file, kind: "cf" } : null, a.plan_file ? { name: `Releveu ${cap(a.type)}`.trim(), path: a.plan_file, kind: "rlv" } : null]
      .filter((x): x is { name: string; path: string; kind: string } => !!x)
      .map((f): DocItem => ({ id: f.path, name: f.name, kind: f.kind, asset_id: a.id, status: "uploaded", origin: "glide", href: null, size: null, at: null, by: null })),
  ];

  // The details this type of asset has.
  const p = assetProfile(a.category, a.type);
  const num = (n: number | null, u: string) => (n ? `${n.toLocaleString("ro-RO")}${u}` : null);
  const val: Partial<Record<ProfileField, string | null>> = {
    usable_area: num(a.usable_area, " mp"), land_area: num(a.land_area, " mp"), rooms: a.rooms ? String(a.rooms) : null, floor: a.floor, height_regime: a.height_regime,
    year_built: a.year_built ? String(a.year_built) : null, vehicle_make: a.vehicle_make, vehicle_model: a.vehicle_model, reg_number: a.reg_number, vin: a.vin,
    mileage: num(a.mileage, " km"), cf_number: a.cf_number, cad_building: a.cad_building !== a.cf_number ? a.cad_building : null, cad_land: a.cad_land,
  };
  const facts = p.fields.filter((k) => k !== "construction" && val[k]).map((k) => [(p.labels[k] ?? FIELD_LABELS[k]).replace(/ \((mp|km)\)$/, ""), val[k]!] as const);
  const ll = parseGeo(a.geo);
  const title = `${cap(a.type) || "Bun"}${a.construction === "under_construction" ? " · în construcție" : ""}`;
  const address = a.full_address && a.city && !a.full_address.toLowerCase().includes(a.city.toLowerCase()) ? `${a.full_address}, ${a.city}` : a.full_address ?? a.city;
  const lastDone = done[0];
  const [pt, pc] = a.no_inspection && !lastDone ? ["Fără inspecție", ""] : lastDone ? ["Inspectat", "pillOk"] : insp[0] ? (INSP_STATUS[insp[0].status] ?? [insp[0].status, ""]) : ["Neinspectat", "pillWarn"];
  const [rs, rc] = REPORT_STATUS[r.status] ?? [r.status, ""];
  const counts: Partial<Record<Tab, number>> = { fotografii: photos.length, acte: docItems.length };
  const zipName = `${cap(a.type) || "Bun"} ${r.number ? `raport ${r.number}` : ""} ${a.city ?? ""}`.trim();
  const backToReport = `${base}/rapoarte/${id}?tab=bunuri&bun=${a.id}`;

  return (
    <CrmShell user={user} base={base} active="reports" title={`${title} · Detaliu bun`} subtitle={`Operațional / Rapoarte / ${r.number ? `Nr. ${r.number}` : r.label ?? "Raport"}`} bare>
      {from && (
        <div className="note bvAs">
          <span>Vezi bunul așa cum era în evaluarea <b>{r.number ? `nr. ${r.number}` : r.label ?? "fără număr"}</b> din {fmtDate(dateOf(r))}: inspecțiile, fotografiile și actele de atunci.</span>
          <a className="btn btnNavy btnSm" href={`${base}/rapoarte/${from.id}/bun/${from.asset}`}>← Înapoi la raportul {from.number ? `nr. ${from.number}` : "curent"}</a>
        </div>
      )}
      <section className={`bvHero${coverSrc ? "" : " noPh"}`}>
        {coverSrc && <SafeImg src={coverSrc} alt="" className="bvCover" />}
        <div className="bvShade" />
        <div className="bvHeroIn">
          <p className="eyebrow"><a className="dBack" href={backToReport}>← Raport {r.number ? `nr. ${r.number}` : r.label ?? ""}</a>{cap(a.category) || "Bun"}{a.is_main && assets.length > 1 ? " · bun principal" : ""}</p>
          <h2>{title}</h2>
          <p className="bvAddr">{address ?? "fără adresă"}{a.county && !address?.includes(a.county) ? `, jud. ${a.county}` : ""}</p>
          <div className="bvPills">
            <span className={`pill ${pc}`}><i />{pt}{lastDone?.done_at ? ` · ${fmtDate(lastDone.done_at)}` : ""}</span>
            <span className={`pill ${rc}`}><i />Raport: {rs}</span>
            {a.cf_number && <span className="pill"><i />CF {a.cf_number}</span>}
            {history.length > 1 && <span className="pill pillInfo"><i />{history.length} evaluări ale proprietății</span>}
          </div>
        </div>
        <div className="bvNums">
          <span><em>Valoare</em><b className="mono">{mineVal ? lei(mineVal, cur) : "—"}</b>{a.approach && <small>abordarea {APPROACH[a.approach]?.toLowerCase()}</small>}</span>
          {area && mineVal ? <span><em>{cur} / mp</em><b className="mono">{Math.round(mineVal / area).toLocaleString("ro-RO")}</b><small>{area.toLocaleString("ro-RO")} mp</small></span> : null}
          {prevMine?.val && mineVal ? <span><em>Față de evaluarea anterioară</em><b className={mineVal >= prevMine.val ? "up" : "down"}>{pct(((mineVal - prevMine.val) / prevMine.val) * 100)}</b><small>{fmtDate(prevMine.date)}</small></span> : null}
        </div>
      </section>

      <nav className="pillTabs dTabs" aria-label="Secțiuni bun">
        {TABS.map(([k, l]) => <a key={k} href={self(k)} aria-current={tab === k ? "page" : undefined}>{l}{counts[k] ? <small>{counts[k]}</small> : null}</a>)}
      </nav>

      {tab === "prezentare" && (
        <div className="dBody">
          <div className="dMain">
            <div className="dGrid2">
              <section className="card">
                <h2>Date bun</h2>
                <dl className="kv">
                  <Row k="Tip">{title}</Row>
                  <Row k="Adresă">{address}</Row>
                  {facts.map(([k, v]) => <Row key={k} k={k}>{/CF|cad|VIN|înmatriculare/i.test(k) ? <span className="mono">{v}</span> : v}</Row>)}
                  <Row k="Valoare">{mineVal ? <span className="mono num">{lei(mineVal, cur)}</span> : null}</Row>
                  <Row k="Abordare">{a.approach ? APPROACH[a.approach] : null}</Row>
                  {a.no_inspection && <Row k="Fără inspecție">{a.no_inspection}</Row>}
                </dl>
                {a.description && <p className="prose">{a.description}</p>}
                {a.notes && <p className="hint">{a.notes}</p>}
              </section>
              <section className="card">
                <div className="cardHead"><h2>Constatat la inspecție</h2>{lastDone?.done_at && <span className="muted">{fmtDate(lastDone.done_at)}</span>}</div>
                {featRows.length + utilRows.length === 0 ? <p className="hint">{lastDone ? "Fișa nu are caracteristici completate." : "Bunul nu a fost inspectat încă."}</p> : (
                  <dl className="kv">
                    {featRows.slice(0, 16).map(([k, v]) => <Row key={k} k={k}>{v}</Row>)}
                    {utilRows.length > 0 && <Row k="Utilități">{utilRows.map(([k, v]) => `${k}: ${v}`).join(" · ")}</Row>}
                  </dl>
                )}
                {featRows.length > 16 && (
                  <details className="dMore"><summary>Toate caracteristicile ({featRows.length})</summary>
                    <dl className="kv">{featRows.slice(16).map(([k, v]) => <Row key={k} k={k}>{v}</Row>)}</dl>
                  </details>
                )}
              </section>
            </div>

            <section className="card flush">
              <div className="cardHead"><h2>Inspecții efectuate</h2><span className="muted">{done.length} {done.length === 1 ? "inspecție" : "inspecții"}{insp.length > done.length ? ` · ${insp.length - done.length} deschise sau anulate` : ""}</span></div>
              {insp.length === 0 ? <p className="hint pad">{a.no_inspection ? `Evaluat fără inspecție: ${a.no_inspection}.` : "Nicio inspecție alocată pentru acest bun."}</p> : (
                <ul className="bvInsp">
                  {insp.map((i) => {
                    const [t, k] = INSP_STATUS[i.status] ?? [i.status, ""];
                    const ph = fileSrc(i.photo_url) ?? photos.find((x) => x.inspection === i.id)?.src;
                    const doc = sheets[i.id];
                    return (
                      <li key={i.id}>
                        <span className="bvInspPh">{ph ? <SafeImg src={ph} alt="" fallback={<i />} /> : <i />}</span>
                        <span className="who">
                          <b>{i.status === "done" ? `Inspecție din ${fmtDate(i.done_at ?? i.created_at)}` : i.scheduled_at ? `Programată ${fmtDate(i.scheduled_at, true)}` : `Alocată ${fmtDate(i.created_at)}`}</b>
                          <small>{[i.inspector, i.uvalo_code ? `UVALO ${i.uvalo_code}` : i.glide_id ? "din Glide" : "aplicația CRM", i.photos ? `${i.photos} fotografii` : null, i.present_person && `prezent: ${i.present_person}`].filter(Boolean).join(" · ")}</small>
                        </span>
                        <span className={`pill ${k}`}><i />{t}</span>
                        {doc ? <InspSheet doc={doc} firm={firm} pdf={`${base}/rapoarte/${id}/fisa/${a.id}`} label="Fișa" />
                          : i.status === "done" && i.sheet_id ? <a className="btn btnGhost btnSm" href={`${base}/rapoarte/${id}/fisa/${a.id}`}>Fișa</a> : <span />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {series.length >= 2 && (
              <section className="card">
                <div className="cardHead"><h2>Evoluția valorii</h2><span className="muted">{series.length} evaluări cu valoare, în {cur}</span></div>
                <div className="bvStats">
                  <span><em>Prima evaluare</em><b className="mono">{lei(first.val, cur)}</b><small>{fmtDate(first.date)}</small></span>
                  <span><em>Ultima evaluare</em><b className="mono">{lei(last.val, cur)}</b><small>{fmtDate(last.date)}</small></span>
                  {change != null && <span><em>Evoluție totală</em><b className={change >= 0 ? "up" : "down"}>{pct(change)}</b><small>{years >= 1 ? `în ${years.toLocaleString("ro-RO", { maximumFractionDigits: 1 })} ani` : "în mai puțin de un an"}</small></span>}
                  {yearly != null && <span><em>Pe an (medie)</em><b className={yearly >= 0 ? "up" : "down"}>{pct(yearly)}</b><small>creștere anuală compusă</small></span>}
                  {avg != null && <span><em>Media evaluărilor</em><b className="mono">{lei(Math.round(avg), cur)}</b>{area ? <small>{Math.round(avg / area).toLocaleString("ro-RO")} {cur}/mp</small> : null}</span>}
                </div>
                <ValueChart cur={cur} points={series.map((v) => ({ t: new Date(v.date).getTime(), v: v.val!, label: new Date(v.date).toLocaleDateString("ro-RO", { month: "short", year: "numeric" }).replace(".", ""), on: v.id === id }))} />
                <div className="tableWrap">
                  <table className="table bvTable">
                    <thead><tr><th>Data</th><th>Raport</th><th>Scop</th><th className="num">Valoare</th>{area ? <th className="num">{cur}/mp</th> : null}<th className="num">Față de anterioara</th></tr></thead>
                    <tbody>
                      {series.slice().reverse().map((v) => {
                        const pv = prevOf(v.id);
                        return (
                          <tr key={v.id} className={v.id === id ? "on" : ""}>
                            <td>{fmtDate(v.date)}</td>
                            <td>{v.number ? `nr. ${v.number}` : "fără număr"}{v.id === id && <small className="muted"> · acesta</small>}</td>
                            <td className="muted">{v.purpose ? cap(v.purpose) : "—"}</td>
                            <td className="num mono">{lei(v.val, cur)}</td>
                            {area ? <td className="num mono">{Math.round(v.val! / area).toLocaleString("ro-RO")}</td> : null}
                            <td className={`num ${pv ? (v.val! >= pv.val! ? "up" : "down") : ""}`}>{pv ? pct(((v.val! - pv.val!) / pv.val!) * 100) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {history.some((v) => v.val && v.cur !== cur) && <p className="hint">Evaluările în altă monedă nu sunt în grafic.</p>}
              </section>
            )}
          </div>

          <aside className="dSide">
            <section className="card flush">
              <div className="cardHead"><h2>Evaluările proprietății</h2><span className="muted">{history.length}</span></div>
              {history.length < 2 && <p className="hint pad">Este singura evaluare a acestei proprietăți în CRM. Când proprietatea e evaluată din nou (același CF), evaluările apar aici.</p>}
              <ul className="bvVals">
                {history.map((v) => {
                  const body = (
                    <>
                      <span className="bvValPh">{fileSrc(v.photo) ? <SafeImg src={fileSrc(v.photo)!} alt="" fallback={<i />} /> : <i />}</span>
                      <span className="who">
                        <b>{v.number ? `Nr. ${v.number}` : "Fără număr"} · {fmtDate(v.date)}</b>
                        <small>{[v.val ? lei(v.val, v.cur) : "fără valoare", v.open && v.client && niceName(v.client), v.evaluator].filter(Boolean).join(" · ")}</small>
                      </span>
                      {v.id === id ? <span className="pill pillOk"><i />{from ? "vezi acum" : "acesta"}</span> : !v.open ? <span className="muted" title="Nu faci parte din echipa acestui raport">fără acces</span> : null}
                    </>
                  );
                  return (
                    <li key={v.id + v.asset_id} className={v.id === id ? "on" : ""}>
                      {v.id !== id && v.open
                        ? <a href={from && from.id === v.id ? `${base}/rapoarte/${v.id}/bun/${v.asset_id}` : `${base}/rapoarte/${v.id}/bun/${v.asset_id}?${keep}`}>{body}</a>
                        : <span>{body}</span>}
                    </li>
                  );
                })}
              </ul>
            </section>
            {ll && (
              <section className="card flush">
                <div className="cardHead"><h2>Localizare</h2><a className="link" href={`https://www.google.com/maps?q=${ll[0]},${ll[1]}`} target="_blank" rel="noopener">Google Maps ↗</a></div>
                <MiniMap point={{ lat: ll[0], lng: ll[1], source: "adresa" }} height={220} />
              </section>
            )}
            {assets.length > 1 && (
              <section className="card">
                <h2>Celelalte bunuri din raport</h2>
                <ul className="bvOthers">
                  {assets.filter((x) => x.id !== a.id).map((x) => (
                    <li key={x.id}><a className="link" href={`${base}/rapoarte/${id}/bun/${x.id}${from ? `?din=${from.id}.${from.asset}` : ""}`}>{cap(x.type) || "Bun"}</a><small>{x.full_address ?? x.city ?? ""}</small></li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      )}

      {tab === "fotografii" && (
        <AssetPhotos report={id} name={zipName} photos={photos} covers={covers} edit={acc.can.assets}
          inspections={insp.filter((i) => photos.some((x) => x.inspection === i.id)).map((i) => ({ id: i.id, label: `Inspecția din ${fmtDate(i.done_at ?? i.scheduled_at ?? i.created_at)}${i.inspector ? ` · ${i.inspector}` : ""}` }))} />
      )}

      {tab === "acte" && (
        <ReportDocs report={id} assets={[{ id: a.id, label: cap(a.type) || "Bunul", sub: address }]} items={docItems} edit={acc.can.docs} remove={acc.can.docsDelete} />
      )}
    </CrmShell>
  );
}
