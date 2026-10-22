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
import { MapZoom } from "@/components/MapZoom";
import { InspSheet } from "../../InspSheet";
import { ReportDocs, type DocItem } from "../../ReportDocs";
import { SafeImg } from "../../ReportActions";
import { AssetPhotos, type Photo } from "./AssetPhotos";

export const metadata: Metadata = { title: "Bun evaluat | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const APPROACH: Record<string, string> = { market: "Piață", income: "Venit", cost: "Cost" };
const INSP_STATUS: Record<string, [string, string]> = {
  done: ["Realizată", "pillOk"], scheduled: ["Programată", "pillInfo"], to_schedule: ["De programat", "pillWarn"], cancelled: ["Anulată", ""],
};
type Tab = "prezentare" | "inspectii" | "fotografii" | "acte" | "analiza";

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
const monthYear = (d: string) => new Date(d).toLocaleDateString("ro-RO", { month: "short", year: "numeric" }).replace(".", "");

function Kv({ rows }: { rows: readonly (readonly [string, React.ReactNode])[] }) {
  return <dl className="bvKv">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

/** The value of each valuation as a bar (the one looked at in gold), with its date under it. */
function ValueBars({ points, cur }: { points: { v: number; label: string; on: boolean }[]; cur: string }) {
  const W = 520, H = 170, B = 26, T = 22, slot = (W - 20) / points.length, bw = Math.min(56, slot * 0.5);
  const hi = Math.max(...points.map((p) => p.v)), lo = Math.min(...points.map((p) => p.v));
  const floor = Math.max(0, lo - (hi - lo || hi * 0.2) * 1.2);
  const h = (v: number) => ((v - floor) / (hi - floor || 1)) * (H - B - T) + 6;
  const short = (v: number) => (v >= 1e6 ? `${(v / 1e6).toLocaleString("ro-RO", { maximumFractionDigits: 2 })} mil.` : Math.round(v).toLocaleString("ro-RO"));
  return (
    <svg className="bvBars" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Valoarea în fiecare evaluare, în ${cur}`}>
      <line x1="10" x2={W - 10} y1={H - B} y2={H - B} className="bvAxis" />
      {points.map((p, i) => {
        const x = 10 + slot * i + (slot - bw) / 2, y = H - B - h(p.v);
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={h(p.v)} rx="8" className={p.on ? "on" : ""}><title>{`${p.label}: ${lei(p.v, cur)}`}</title></rect>
            <text x={x + bw / 2} y={y - 8} textAnchor="middle" className="val">{short(p.v)}</text>
            <text x={x + bw / 2} y={H - 12} textAnchor="middle">{p.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default async function AssetPage({ params, searchParams }: {
  params: Promise<{ id: string; asset: string }>; searchParams: Promise<{ tab?: string; din?: string }>;
}) {
  const { db, user, base } = await staffPage();
  const { id, asset } = await params;
  const { tab: asked, din } = await searchParams;
  const r = await getReport(db, id);
  if (!r) notFound();
  const acc = await reportAccess(db, user, r);
  if (!acc.view) redirect(`${base}/rapoarte?fara-acces=1`);
  const assets = await reportAssets(db, id);
  const a = assets.find((x) => x.id === asset);
  if (!a) notFound();
  const cur = r.currency === "EUR" ? "EUR" : "lei";
  // Opened from another valuation of the same property ("din" = that report . asset): the page shows the asset as it was
  // in this valuation, with the way back.
  const [fromReport, fromAsset] = (din ?? "").split(".");
  const from = fromReport && fromAsset && fromReport !== id ? await db.prepare("SELECT r.id, r.number, a.id AS asset FROM assets a JOIN reports r ON r.id = a.report_id WHERE a.id = ? AND r.id = ?")
    .bind(fromAsset, fromReport).first<{ id: string; number: string | null; asset: string }>() : null;
  const keep = from ? `din=${from.id}.${from.asset}` : `din=${id}.${a.id}`;

  // The inspections of the asset (the cancelled ones only when they left a sheet), newest first.
  const { results: insp } = await db.prepare(
    `SELECT i.id, i.status, i.scheduled_at, i.done_at, i.created_at, i.glide_id, i.uvalo_id, i.uvalo_code, i.sheet_type,
        COALESCE(NULLIF(u.name, ''), u.email) AS inspector, s.id AS sheet_id, s.photo_url, s.present_person, s.signature_url,
        (SELECT COUNT(*) FROM inspection_photos f WHERE f.inspection_id = i.id AND f.deleted_at IS NULL) AS photos
      FROM inspections i LEFT JOIN users u ON u.id = i.inspector_id LEFT JOIN inspection_sheets s ON s.inspection_id = i.id
      WHERE i.asset_id = ? AND (i.status <> 'cancelled' OR s.id IS NOT NULL) ORDER BY COALESCE(i.done_at, i.scheduled_at, i.created_at) DESC`,
  ).bind(a.id).all<{ id: string; status: string; scheduled_at: string | null; done_at: string | null; created_at: string; glide_id: string | null; uvalo_id: string | null;
    uvalo_code: string | null; sheet_type: string | null; inspector: string | null; sheet_id: string | null; photo_url: string | null; present_person: string | null;
    signature_url: string | null; photos: number }>();
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
  const sheets = Object.fromEntries(await Promise.all(done.filter((i) => i.sheet_id).map(async (i) => [i.id, await inspectionSheetDoc(db, id, a.id, i.id).catch(() => null)] as const)));

  // What the inspection found, from the latest sheet.
  const lastDone = done[0];
  const feat = lastDone ? await db.prepare("SELECT * FROM property_features WHERE inspection_id = ? ORDER BY observed_at DESC LIMIT 1").bind(lastDone.id).first<Record<string, string | number | null>>() : null;
  const featRows = feat ? FEATURES.filter(([k]) => feat[k] != null && feat[k] !== "").map(([k, l, u]) => [l, `${typeof feat[k] === "number" ? (feat[k] as number).toLocaleString("ro-RO") : feat[k]}${u ? ` ${u}` : ""}`] as const) : [];
  const utilRows = feat ? UTIL.filter(([k]) => feat[`${k}_connected`] != null).map(([k, l]) => `${l}: ${feat[`${k}_connected`] ? `branșat${feat[`${k}_meter`] === 1 ? ", cu contor" : ""}` : `nebranșat${feat[`${k}_distance_m`] ? `, rețeaua la ${feat[`${k}_distance_m`]} m` : ""}`}`) : [];
  const found = [...featRows, ...(utilRows.length ? [["Utilități", utilRows.join(" · ")] as const] : [])];

  // Every valuation of the same property (this one included): picked to see the asset as it was then.
  const { results: vals } = await db.prepare(
    `SELECT a.id AS asset_id, a.value, a.approach, r.id, r.number, r.label, r.status, r.delivered_at, r.report_date, r.valuation_date, r.created_at, r.currency, r.purpose,
        c.name AS client, (SELECT COALESCE(NULLIF(u.name, ''), u.email) FROM report_members m JOIN users u ON u.id = m.user_id WHERE m.report_id = r.id AND m.role = 'evaluator' LIMIT 1) AS evaluator,
        (SELECT COUNT(*) FROM assets x WHERE x.report_id = r.id) AS n_assets, r.result_value
      FROM assets a JOIN reports r ON r.id = a.report_id LEFT JOIN entities c ON c.id = r.client_id WHERE a.property_id = ?`,
  ).bind(a.property_id).all<{ asset_id: string; value: number | null; approach: string | null; id: string; number: string | null; label: string | null; status: string; delivered_at: string | null;
    report_date: string | null; valuation_date: string | null; created_at: string; currency: string | null; purpose: string | null; client: string | null; evaluator: string | null;
    n_assets: number; result_value: number | null }>();
  const history = (await Promise.all(vals.map(async (v) => ({
    ...v, date: dateOf(v), val: v.value ?? (v.n_assets === 1 ? v.result_value : null), cur: v.currency === "EUR" ? "EUR" : "lei",
    open: v.id === id || (await reportAccess(db, user, { id: v.id, status: v.status, delivered_at: v.delivered_at })).view,
  })))).sort((x, y) => x.date.localeCompare(y.date));

  // Value analytics, only with at least two valuations that have a value (in the currency of this report).
  const area = a.usable_area ?? (a.land_area && /teren/i.test(a.type ?? "") ? a.land_area : null);
  const series = history.filter((v) => v.val && v.cur === cur);
  const analytics = series.length >= 2;
  const first = series[0], last = series[series.length - 1];
  const years = analytics ? (new Date(last.date).getTime() - new Date(first.date).getTime()) / (365.25 * 864e5) : 0;
  const change = analytics ? ((last.val! - first.val!) / first.val!) * 100 : null;
  const yearly = change != null && years >= 0.5 ? (Math.pow(last.val! / first.val!, 1 / years) - 1) * 100 : null;
  const avg = analytics ? series.reduce((s, v) => s + v.val!, 0) / series.length : null;
  const prevOf = (vId: string) => { const i = series.findIndex((x) => x.id === vId); return i > 0 ? series[i - 1] : null; };
  const mineVal = history.find((v) => v.id === id)?.val ?? a.value;
  const prevMine = prevOf(id);

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
  const facts = p.fields.filter((k) => k !== "construction" && val[k]).map((k) => {
    const label = (p.labels[k] ?? FIELD_LABELS[k]).replace(/ \((mp|km)\)$/, "");
    return [label, /CF|cad|VIN|înmatriculare/i.test(label) ? <span className="mono">{val[k]}</span> : val[k]] as const;
  });
  const reportRows = [...facts, ...(mineVal ? [["Valoare", <span key="v" className="mono">{lei(mineVal, cur)}</span>] as const] : []), ...(a.approach ? [["Abordare", APPROACH[a.approach]] as const] : []),
    ...(a.no_inspection ? [["Fără inspecție", a.no_inspection] as const] : [])];
  const ll = parseGeo(a.geo);
  const title = `${cap(a.type) || "Bun"}${a.construction === "under_construction" ? " · în construcție" : ""}`;
  const address = a.full_address && a.city && !a.full_address.toLowerCase().includes(a.city.toLowerCase()) ? `${a.full_address}, ${a.city}` : a.full_address ?? a.city;
  const [rs, rc] = REPORT_STATUS[r.status] ?? [r.status, ""];
  const zipName = `${cap(a.type) || "Bun"} ${r.number ? `raport ${r.number}` : ""} ${a.city ?? ""}`.trim();
  const backToReport = `${base}/rapoarte/${id}?tab=bunuri&bun=${a.id}`;
  const nav: [Tab, string, number | null][] = [
    ["prezentare", "Prezentare", null], ["inspectii", "Inspecții", insp.length || null], ["fotografii", "Fotografii", photos.length || null], ["acte", "Acte", docItems.length || null],
    ...(analytics ? [["analiza", "Analiză valoare", series.length] as [Tab, string, number]] : []),
  ];
  const tab: Tab = nav.find(([k]) => k === asked)?.[0] ?? "prezentare";
  const self = (t: Tab) => `${base}/rapoarte/${id}/bun/${a.id}?${[t !== "prezentare" ? `tab=${t}` : "", from ? `din=${from.id}.${from.asset}` : ""].filter(Boolean).join("&")}`.replace(/\?$/, "");

  const inspCards = (
    <div className="bvInspGrid">
      {insp.map((i) => {
        const [t, k] = INSP_STATUS[i.status] ?? [i.status, ""];
        const strip = photos.filter((x) => x.inspection === i.id).slice(0, 3);
        const doc = sheets[i.id];
        return (
          <article key={i.id} className={`bvInspCard${i.status === "done" ? "" : " open"}`}>
            {strip.length > 0 && <a className="bvStrip" href={self("fotografii")}>{strip.map((x) => <SafeImg key={x.id} src={x.src} alt="" fallback={<i />} />)}</a>}
            <div className="bvInspBody">
              <div className="bvInspTop"><b>{i.status === "done" ? fmtDate(i.done_at ?? i.created_at) : i.status === "scheduled" && i.scheduled_at ? `Programată ${fmtDate(i.scheduled_at, true)}` : `Alocată ${fmtDate(i.created_at)}`}</b><span className={`pill ${k}`}><i />{t}</span></div>
              <small>{[i.inspector, i.uvalo_code ? `UVALO ${i.uvalo_code}` : i.uvalo_id ? "UVALO" : i.glide_id ? "din vechiul CRM" : "aplicația CRM", i.photos ? `${i.photos} fotografii` : null,
                i.signature_url ? "semnată" : null, i.present_person && `prezent: ${i.present_person}`].filter(Boolean).join(" · ")}</small>
              {(doc || (i.status === "done" && i.sheet_id)) && <InspSheet doc={doc ?? null} src={`/api/crm/reports/${id}/sheet/${a.id}?insp=${encodeURIComponent(i.id)}`} firm={firm} pdf={`${base}/rapoarte/${id}/fisa/${a.id}`} label="Deschide fișa de inspecție →" />}
            </div>
          </article>
        );
      })}
    </div>
  );
  const valueCard = (table: boolean) => analytics && (
    <section className="card">
      <div className="cardHead"><h2>Analiză valoare</h2><span className="muted">{series.length} evaluări · {cur}</span></div>
      <div className="bvAn">
        <ValueBars cur={cur} points={series.map((v) => ({ v: v.val!, label: monthYear(v.date), on: v.id === id }))} />
        <div className="bvStats">
          {change != null && <span><em>Evoluție totală</em><b className={change >= 0 ? "up" : "down"}>{pct(change)}</b><small>{years >= 1 ? `în ${years.toLocaleString("ro-RO", { maximumFractionDigits: 1 })} ani` : "în mai puțin de un an"}</small></span>}
          {yearly != null && <span><em>Pe an, compus</em><b className={yearly >= 0 ? "up" : "down"}>{pct(yearly)}</b><small>medie anuală</small></span>}
          {area ? <span><em>{cur}/mp acum</em><b>{Math.round(last.val! / area).toLocaleString("ro-RO")}</b><small>de la {Math.round(first.val! / area).toLocaleString("ro-RO")}</small></span> : null}
          {avg != null && <span><em>Media evaluărilor</em><b>{lei(Math.round(avg), cur)}</b>{area ? <small>{Math.round(avg / area).toLocaleString("ro-RO")} {cur}/mp</small> : <small>{series.length} evaluări</small>}</span>}
        </div>
      </div>
      {table && (
        <div className="tableWrap">
          <table className="table bvTable">
            <thead><tr><th>Data</th><th>Raport</th><th>Scop</th><th>Evaluator</th><th className="num">Valoare</th>{area ? <th className="num">{cur}/mp</th> : null}<th className="num">Față de anterioara</th></tr></thead>
            <tbody>
              {series.slice().reverse().map((v) => {
                const pv = prevOf(v.id);
                return (
                  <tr key={v.id} className={v.id === id ? "on" : ""}>
                    <td>{fmtDate(v.date)}</td>
                    <td>{v.number ? `nr. ${v.number}` : "fără număr"}{v.id === id && <small className="muted"> · acesta</small>}</td>
                    <td className="muted">{v.purpose ? cap(v.purpose) : "—"}</td>
                    <td className="muted">{v.evaluator ?? "—"}</td>
                    <td className="num mono">{lei(v.val, cur)}</td>
                    {area ? <td className="num mono">{Math.round(v.val! / area).toLocaleString("ro-RO")}</td> : null}
                    <td className={`num ${pv ? (v.val! >= pv.val! ? "up" : "down") : ""}`}>{pv ? pct(((v.val! - pv.val!) / pv.val!) * 100) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {history.some((v) => v.val && v.cur !== cur) && <p className="hint">Evaluările în altă monedă nu sunt incluse.</p>}
    </section>
  );

  return (
    <CrmShell user={user} base={base} active="reports" title={`${title} · Detaliu bun`} subtitle={`Operațional / Rapoarte / ${r.number ? `Nr. ${r.number}` : r.label ?? "Raport"}`} bare>
      {from && (
        <div className="note bvAs">
          <span>Vezi bunul așa cum era în evaluarea <b>{r.number ? `nr. ${r.number}` : "fără număr"}</b> din {fmtDate(dateOf(r))}: inspecțiile, fotografiile și actele de atunci.</span>
          <a className="btn btnNavy btnSm" href={`${base}/rapoarte/${from.id}/bun/${from.asset}`}>← Înapoi la raportul {from.number ? `nr. ${from.number}` : "curent"}</a>
        </div>
      )}
      <section className="bvHead">
        <a className="bvBack" href={backToReport}>← Raport {r.number ? `nr. ${r.number}` : r.label ?? ""} · Bunuri</a>
        <div className="bvTop">
          <a className="bvCoverBox" href={self("fotografii")} aria-label="Fotografiile bunului">
            {coverSrc ? <SafeImg src={coverSrc} alt="" className="bvCover" fallback={<span className="bvNoPh">Fără fotografie</span>} /> : <span className="bvNoPh">Fără fotografie</span>}
            {photos.length > 0 && <span className="bvPhCount">{photos.length} fotografii →</span>}
          </a>
          <div className="bvTitle">
            <span className="bvEyebrow">{cap(a.category) || "Bun"}{a.is_main && assets.length > 1 ? " · bun principal" : ""} · raport {rs.toLowerCase()}</span>
            <h1>{title}</h1>
            <p>{address ?? "fără adresă"}{a.county && !address?.includes(a.county) ? `, jud. ${a.county}` : ""}{a.cf_number ? ` · CF ${a.cf_number}` : ""}</p>
            <div className="bvKpis">
              <div><em>Valoare</em><b>{mineVal ? lei(mineVal, cur) : "—"}</b>{a.approach && <small>abordarea {APPROACH[a.approach]?.toLowerCase()}</small>}</div>
              {area && mineVal ? <div><em>{cur} / mp</em><b>{Math.round(mineVal / area).toLocaleString("ro-RO")}</b><small>{area.toLocaleString("ro-RO")} mp</small></div> : null}
              {prevMine?.val && mineVal ? <div><em>Față de anterioara</em><b className={mineVal >= prevMine.val ? "up" : "down"}>{pct(((mineVal - prevMine.val) / prevMine.val) * 100)}</b><small>{fmtDate(prevMine.date)}</small></div> : null}
              <div><em>Inspecție</em><b className="sm">{lastDone ? `✓ ${fmtDate(lastDone.done_at ?? lastDone.created_at)}` : a.no_inspection ? "fără inspecție" : insp[0] ? (INSP_STATUS[insp[0].status]?.[0] ?? insp[0].status).toLowerCase() : "nealocată"}</b>{lastDone?.inspector && <small>{lastDone.inspector}</small>}</div>
            </div>
          </div>
        </div>
        {history.length > 1 && (
          <div className="bvAxis">
            <div className="bvAxisHead"><b>Axa evaluărilor</b><span>Alege o evaluare ca să vezi bunul așa cum era atunci</span></div>
            <ol className="bvAxisLine">
              {history.map((v) => {
                const body = <><i /><b>{fmtDate(v.date)}</b><small>{[v.id === id ? (from ? "vezi acum" : "raportul acesta") : v.number ? `nr. ${v.number}` : "fără număr", v.val ? lei(v.val, v.cur) : null].filter(Boolean).join(" · ")}</small>
                  {v.open && v.id !== id && (v.client || v.evaluator) && <small className="who">{[v.client && niceName(v.client), v.evaluator].filter(Boolean).join(" · ")}</small>}</>;
                return (
                  <li key={v.id + v.asset_id} className={v.id === id ? "on" : v.open ? "" : "off"}>
                    {v.id !== id && v.open
                      ? <a href={from && from.id === v.id ? `${base}/rapoarte/${v.id}/bun/${v.asset_id}` : `${base}/rapoarte/${v.id}/bun/${v.asset_id}?${keep}`}>{body}</a>
                      : <span title={v.open ? undefined : "Nu faci parte din echipa acestui raport"}>{body}</span>}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </section>

      <div className="bvBody">
        <nav className="bvNav" aria-label="Secțiuni bun">
          {nav.map(([k, l, n]) => <a key={k} href={self(k)} aria-current={tab === k ? "page" : undefined}>{l}{n ? <b>{n}</b> : null}</a>)}
          {assets.length > 1 && (
            <div className="bvOthers">
              <small>Alte bunuri în raport</small>
              {assets.filter((x) => x.id !== a.id).map((x) => <a key={x.id} href={`${base}/rapoarte/${id}/bun/${x.id}${from ? `?din=${from.id}.${from.asset}` : ""}`}>{cap(x.type) || "Bun"}<span>{x.full_address ?? x.city ?? ""}</span></a>)}
            </div>
          )}
        </nav>

        <main className="bvMain">
          {tab === "prezentare" && (
            <>
              <div className="bvTwo">
                <section className="card">
                  <span className="bvKick">Din raport</span>
                  <h2>Date bun</h2>
                  {reportRows.length ? <Kv rows={reportRows} /> : <p className="hint">Fără date completate.</p>}
                  {a.description && <p className="prose">{a.description}</p>}
                  {a.notes && <p className="hint">{a.notes}</p>}
                </section>
                <section className="card">
                  <span className="bvKick">{lastDone?.done_at ? `Din fișa de inspecție · ${fmtDate(lastDone.done_at)}` : "Din fișa de inspecție"}</span>
                  <h2>Constatat la fața locului</h2>
                  {found.length ? <Kv rows={found.slice(0, 10)} /> : <p className="hint">{lastDone ? "Fișa nu are caracteristici completate." : "Bunul nu a fost inspectat încă."}</p>}
                  {found.length > 10 && <a className="link" href={self("inspectii")}>toate cele {found.length} caracteristici →</a>}
                </section>
              </div>
              <section className="card">
                <div className="cardHead"><h2>Inspecții efectuate</h2><span className="muted">{done.length} {done.length === 1 ? "realizată" : "realizate"}{insp.length > done.length ? ` · ${insp.length - done.length} deschise` : ""}</span></div>
                {insp.length ? inspCards : <p className="hint">{a.no_inspection ? `Evaluat fără inspecție: ${a.no_inspection}.` : "Nicio inspecție alocată pentru acest bun."}</p>}
              </section>
              {valueCard(false)}
              <section className="card flush">
                <div className="cardHead"><h2>Localizare</h2>{ll && <a className="link" href={`https://www.google.com/maps?q=${ll[0]},${ll[1]}`} target="_blank" rel="noopener">Deschide în Google Maps ↗</a>}</div>
                {ll ? <div className="pad" style={{ paddingTop: 0 }}><MapZoom point={{ lat: ll[0], lng: ll[1], source: "adresa" }} height={150} link={`https://www.google.com/maps?q=${ll[0]},${ll[1]}`} /></div> : <p className="hint pad">Bunul nu are coordonate. Se completează din adresă sau din cadastru, la proprietate.</p>}
              </section>
            </>
          )}

          {tab === "inspectii" && (
            <>
              <section className="card">
                <div className="cardHead"><h2>Inspecții</h2><span className="muted">{insp.length}</span></div>
                {insp.length ? inspCards : <p className="hint">Nicio inspecție pentru acest bun.</p>}
              </section>
              {found.length > 0 && <section className="card"><span className="bvKick">{lastDone?.done_at ? `Fișa din ${fmtDate(lastDone.done_at)}` : "Ultima fișă"}</span><h2>Constatat la fața locului</h2><Kv rows={found} /></section>}
            </>
          )}

          {tab === "fotografii" && (
            <AssetPhotos report={id} name={zipName} photos={photos} covers={covers} edit={acc.can.assets}
              inspections={insp.filter((i) => photos.some((x) => x.inspection === i.id)).map((i) => ({ id: i.id, label: `Inspecția din ${fmtDate(i.done_at ?? i.scheduled_at ?? i.created_at)}${i.inspector ? ` · ${i.inspector}` : ""}` }))} />
          )}

          {tab === "acte" && <ReportDocs report={id} assets={[{ id: a.id, label: cap(a.type) || "Bunul", sub: address }]} items={docItems} edit={acc.can.docs} remove={acc.can.docsDelete} />}

          {tab === "analiza" && valueCard(true)}
        </main>
      </div>
    </CrmShell>
  );
}
