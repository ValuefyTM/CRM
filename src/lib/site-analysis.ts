// Server-only: the site analysis of an asset (tab „Amplasament”). The parcel comes from the cadastral plans of the
// locator (UVALO, /api/localizare/parcela) or from a document of the report read by Claude (extras CF, plan de
// amplasament); the zone from OpenStreetMap (site-zone.ts). From the contour the CRM works out the shape, the
// frontage to the street, the depth and the POT; Claude only rewords these into the "Descrierea amplasamentului"
// text, and every number of the text is checked against the data. Kept per asset in asset_site.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { now } from "./db";
import { bucket } from "./orders";
import { assetDocs } from "./legal-check";
import { guessDocKind } from "./doc-kinds";
import { COUNTY_CENTRES, normName, orient, ringArea, centroid, stereo70ToWgs84, wgs84ToStereo70 } from "./stereo70";
import type { Geometry, LL, Parcel, Site, Style, Zone } from "./site-shared";

const model = () => process.env.DRAFT_MODEL?.trim() || "claude-opus-5-5";
export const siteAiEnabled = () => !!process.env.ANTHROPIC_API_KEY;
export class SiteError extends Error {}

const r1 = (x: number) => Math.round(x * 10) / 10, r2 = (x: number) => Math.round(x * 100) / 100, r6 = (x: number) => Math.round(x * 1e6) / 1e6;
const parse = <T,>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };

// ---------- the row ----------

type Row = { source: string | null; doc_ref: string | null; parcel: string | null; zone: string | null; text: string | null; style: string | null; unverified: string | null;
  situated: string | null; in_annex: number; figures: string | null; sent_at: string | null; made_by: string | null; made_at: string | null; updated_at: string | null; made_by_name: string | null };

export async function siteOf(db: D1Database, assetId: string): Promise<Site | null> {
  const r = await db.prepare(`SELECT s.*, COALESCE(NULLIF(u.name, ''), u.email) AS made_by_name FROM asset_site s LEFT JOIN users u ON u.id = s.made_by WHERE s.asset_id = ?`)
    .bind(assetId).first<Row>().catch(() => null);
  if (!r) return null;
  return {
    source: (r.source as Site["source"]) ?? null, doc_ref: r.doc_ref, parcel: parse<Parcel | null>(r.parcel, null), zone: parse<Zone | null>(r.zone, null),
    text: r.text, style: (r.style as Style) ?? null, unverified: parse<string[]>(r.unverified, []), situated: (r.situated as Site["situated"]) ?? null,
    in_annex: !!r.in_annex, figures: parse<string[]>(r.figures, []), sent_at: r.sent_at, made_by: r.made_by_name, made_at: r.made_at, updated_at: r.updated_at,
  };
}

/** Writes some columns of the asset's row (created on the first write). */
export async function saveSite(db: D1Database, reportId: string, assetId: string, v: Partial<Record<"source" | "doc_ref" | "parcel" | "zone" | "text" | "style" | "unverified" | "situated" | "figures" | "sent_at" | "made_by" | "made_at", string | null>> & { in_annex?: number }) {
  const at = now();
  await db.prepare("INSERT INTO asset_site (asset_id, report_id, updated_at) VALUES (?, ?, ?) ON CONFLICT(asset_id) DO NOTHING").bind(assetId, reportId, at).run();
  const keys = Object.keys(v) as (keyof typeof v)[];
  if (!keys.length) return;
  await db.prepare(`UPDATE asset_site SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE asset_id = ?`).bind(...keys.map((k) => v[k] ?? null), at, assetId).run();
}

// ---------- the documents that can give the contour ----------

export type SiteDoc = { ref: string; name: string; kind: string; key: string; type: string | null; at: string | null };

/** The asset's documents that may hold a coordinate inventory (CF extract, site plan), the likeliest first. */
export async function siteDocs(db: D1Database, reportId: string, assetId: string, glideCf: string | null): Promise<SiteDoc[]> {
  const all = await assetDocs(db, reportId, assetId);
  const docs: SiteDoc[] = all.map((d) => ({ ref: d.ref, name: d.name, kind: d.kind && d.kind !== "other" ? d.kind : guessDocKind(d.name), key: d.key, type: d.type, at: d.at }))
    .filter((d) => d.kind === "cf" || d.kind === "amplasament" || d.kind === "rlv");
  if (glideCf?.startsWith("r2:")) docs.push({ ref: "g:cf", name: "Extras CF (din fișa proprietății)", kind: "cf", key: glideCf.slice(3), type: null, at: null });
  const rank = (k: string) => (k === "amplasament" ? 0 : k === "cf" ? 1 : 2);
  return docs.sort((a, b) => rank(a.kind) - rank(b.kind) || (b.at ?? "").localeCompare(a.at ?? ""));
}

// ---------- the parcel from the locator (UVALO) ----------

type UPt = { pct: number | string; x: number; y: number; lat: number; lng: number; latura_m?: number };
type UParcel = {
  nr_cadastral: string; localitate: string; judet: string; plan_cadastral_la: string | null; suprafata_mp: number | null; perimetru_m: number;
  centru: { lat: number; lng: number }; inventar_coordonate: UPt[]; constructii: { nume: string; suprafata_la_sol_mp: number; contur: UPt[] }[];
  vecini_inscrisi?: string[]; observatii?: string[]; timisoara?: unknown; grila_notariala_2026?: unknown;
};
type UFeature = { properties: { nr_cadastral?: string; suprafata_mp?: number }; geometry: { coordinates: number[][][] } };

export const locatorEnabled = () => !!process.env.LOCATOR_API_TOKEN;

/** The parcel with this cadastral number (in this locality), or under this point; null when the plans do not have it. */
export async function uvaloParcel(q: { nr: string; city: string | null } | { lat: number; lng: number }): Promise<{ parcel: Parcel | null; message: string | null }> {
  if (!locatorEnabled()) throw new SiteError("Legătura cu planurile cadastrale nu este configurată (LOCATOR_API_TOKEN).");
  const base = (process.env.LOCATOR_API_URL || "https://tools.valuefy.ro").replace(/\/$/, "");
  const sp = new URLSearchParams("nr" in q ? { nr: q.nr, ...(q.city ? { city: q.city } : {}) } : { lat: String(q.lat), lng: String(q.lng) });
  let res: Response;
  try {
    res = await fetch(`${base}/api/localizare/parcela?${sp}`, { headers: { Authorization: `Bearer ${process.env.LOCATOR_API_TOKEN}` }, signal: AbortSignal.timeout(25_000) });
  } catch (e) {
    throw new SiteError((e as Error)?.name === "TimeoutError" ? "Planurile cadastrale nu au răspuns în 25 de secunde." : "Nu pot contacta planurile cadastrale (UVALO).");
  }
  const d = (await res.json().catch(() => null)) as { error?: string; mesaj?: string; parcela?: UParcel | null; vecini_contururi?: { features?: UFeature[] } } | null;
  if (res.status === 404) return { parcel: null, message: d?.error ?? "Numărul nu apare în planurile cadastrale." };
  if (res.status === 401) throw new SiteError("Planurile cadastrale au refuzat tokenul (LOCATOR_API_TOKEN diferă între CRM și UVALO).");
  if (!res.ok || !d) throw new SiteError(`Planurile cadastrale au dat eroare (HTTP ${res.status}).`);
  const p = d.parcela;
  if (!p) return { parcel: null, message: d.mesaj ?? "Punctul nu cade pe un imobil din planuri." };
  const ll = (q: UPt): LL => [q.lat, q.lng];
  const ring = p.inventar_coordonate.map(ll);
  const parcel: Parcel = {
    source: "ancpi", nr: p.nr_cadastral, uat: p.localitate, county: p.judet, plan_date: p.plan_cadastral_la, doc_name: null,
    area_plan: p.suprafata_mp, area_calc: r1(ringArea(p.inventar_coordonate.map((q) => [q.y, q.x]))), area_acte: null, perimeter: p.perimetru_m,
    centre: [p.centru.lat, p.centru.lng], ring,
    pts: p.inventar_coordonate.map((q) => ({ pct: String(q.pct), x: q.x, y: q.y, side: q.latura_m ?? null })),
    buildings: p.constructii.map((b) => ({ name: b.nume, area: b.suprafata_la_sol_mp, ring: b.contur.map(ll) })),
    neighbours: (d.vecini_contururi?.features ?? []).map((f) => ({ nr: f.properties.nr_cadastral ?? "", area: f.properties.suprafata_mp ?? null,
      ring: (f.geometry.coordinates[0] ?? []).slice(0, -1).map(([lng, lat]) => [lat, lng] as LL) })),
    notes: p.observatii ?? [],
    extra: p.timisoara || p.grila_notariala_2026 ? { timisoara: p.timisoara ?? null, grila: p.grila_notariala_2026 ?? null } : null,
    geo: null,
  };
  return { parcel, message: null };
}

// ---------- the parcel from a document (Claude reads the coordinate inventory) ----------

const PLAN_PROMPT = `Citești documente cadastrale din România („plan de amplasament și delimitare a imobilului”, extras de plan cadastral, extras de carte funciară) și extragi datele exact cum sunt scrise.
- Nu inventa nimic. Ce lipsește sau nu se citește sigur este null (sau listă goală), iar nesiguranța o explici în „observatii”.
- Inventarul de coordonate: copiază toate punctele terenului, cu toate zecimalele, în ordinea din tabel. În sistemul Stereo 70, X este coordonata nord și Y coordonata est. Punctele construcțiilor nu intră la teren; pune-le la construcția respectivă, dacă sunt în document.
- În extrasul de carte funciară coordonatele sunt în tabelul „Lungime segmente” (punct început, X / Y, punct sfârșit, X / Y, lungime): ia fiecare punct o singură dată, în ordinea punctelor, cu valorile exact cum apar (primul număr în x, al doilea în y; ordinea nord / est o stabilește aplicația).
- Parcelele vecine desenate în schiță (cu numărul cadastral scris în ele) intră în „parcele_vecine”, cu colțurile din inventar dacă există, altfel listă goală de puncte.
- Suprafețele în metri pătrați, ca numere (fără separatori de mii).
- Dacă documentul nu este un document cadastral cu coordonate, spune ce este în „tip_document” și lasă restul gol.`;

const Pt = z.object({ nr: z.string(), x: z.number(), y: z.number() });
const PlanRead = z.object({
  tip_document: z.string(),
  nr_cadastral: z.string().nullable(),
  uat: z.string().nullable(),
  judet: z.string().nullable(),
  suprafata_masurata_mp: z.number().nullable(),
  suprafata_din_acte_mp: z.number().nullable(),
  intravilan: z.boolean().nullable(),
  puncte: z.array(Pt),
  constructii: z.array(z.object({ cod: z.string(), suprafata_la_sol_mp: z.number().nullable(), puncte: z.array(Pt) })),
  parcele_vecine: z.array(z.object({ nr_cadastral: z.string().nullable(), puncte: z.array(Pt) })),
  observatii: z.string().nullable(),
});

const IMAGE = /^image\/(png|jpe?g|webp|gif)$/;

/** Reads the coordinate inventory of a document into a parcel. `hint` = where the asset should be (for the X/Y order). */
export async function parcelFromDoc(doc: SiteDoc, hint: { ll: LL | null; county: string | null }): Promise<{ parcel: Parcel; situated: "intravilan" | "extravilan" | null }> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new SiteError("Citirea cu AI nu este configurată (ANTHROPIC_API_KEY).");
  const obj = await (await bucket())?.get(doc.key);
  if (!obj) throw new SiteError("Fișierul nu a fost găsit în stocare.");
  if (obj.size > 20_000_000) throw new SiteError("Fișierul are peste 20 MB: încarcă doar pagina cu coordonatele.");
  const type = (obj.httpMetadata?.contentType ?? doc.type ?? (/\.pdf$/i.test(doc.name) ? "application/pdf" : "")).toLowerCase().replace("image/jpg", "image/jpeg");
  const data = Buffer.from(await obj.arrayBuffer()).toString("base64");
  let block: Anthropic.Beta.BetaContentBlockParam;
  if (type === "application/pdf") block = { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  else if (IMAGE.test(type)) block = { type: "image", source: { type: "base64", media_type: type as "image/png" | "image/jpeg" | "image/webp" | "image/gif", data } };
  else throw new SiteError("Doar PDF sau imagini (PNG, JPG) pot fi citite.");

  const client = new Anthropic({ apiKey: key });
  let out: z.infer<typeof PlanRead>;
  try {
    const res = await client.beta.messages.parse({
      model: model(),
      max_tokens: 16000,
      system: PLAN_PROMPT,
      output_config: { effort: "high", format: betaZodOutputFormat(PlanRead) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: [block, { type: "text", text: `Extrage datele imobilului din acest document (${doc.name}).` }] }],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) throw new SiteError("Documentul nu a putut fi citit.");
    out = res.parsed_output;
  } catch (e) {
    if (e instanceof SiteError) throw e;
    if (e instanceof Anthropic.RateLimitError) throw new SiteError("Serviciul AI este ocupat. Încearcă din nou peste un minut.");
    if (e instanceof Anthropic.APIError) { console.error("site plan read", doc.ref, e.status, e.message); throw new SiteError(`Documentul nu a putut fi citit de serviciul AI (${e.status ?? "eroare"}).`); }
    throw e;
  }
  if (out.puncte.length < 3) throw new SiteError(`În ${doc.name} nu am găsit un inventar de coordonate (${out.tip_document}).${out.observatii ? ` ${out.observatii}` : ""}`);

  const county = normName(out.judet ?? hint.county ?? "");
  const ref = hint.ll ?? COUNTY_CENTRES[county] ?? null;
  const o = orient(out.puncte, ref, doc.kind === "cf");
  if (!o) throw new SiteError("Coordonatele citite nu cad în România. Verifică documentul.");
  // the same X/Y order for the buildings and the neighbours
  const toEN = (p: { x: number; y: number }) => (o.swap ? [p.x, p.y] : [p.y, p.x]) as [number, number];
  const toLL = (EN: number[]) => { const [lat, lng] = stereo70ToWgs84(EN[0], EN[1]); return [r6(lat), r6(lng)] as LL; };
  const ring = o.ring;
  const sides = ring.map((q, i) => { const n = ring[(i + 1) % ring.length]; return r2(Math.hypot(n[0] - q[0], n[1] - q[1])); });
  const [cE, cN] = centroid(ring);
  const parcel: Parcel = {
    source: "doc", nr: out.nr_cadastral, uat: out.uat, county: out.judet, plan_date: null, doc_name: doc.name,
    area_plan: out.suprafata_masurata_mp, area_calc: r1(ringArea(ring)), area_acte: out.suprafata_din_acte_mp, perimeter: r2(sides.reduce((s, x) => s + x, 0)),
    centre: toLL([cE, cN]), ring: ring.map(toLL),
    pts: ring.map((q, i) => ({ pct: out.puncte[i]?.nr || String(i + 1), x: r2(q[1]), y: r2(q[0]), side: sides[i] })),
    buildings: out.constructii.map((b) => {
      const r = b.puncte.map(toEN);
      return { name: b.cod, area: b.suprafata_la_sol_mp ?? (r.length > 2 ? r1(ringArea(r)) : 0), ring: r.length > 2 ? r.map(toLL) : [] };
    }),
    neighbours: out.parcele_vecine.filter((n) => n.puncte.length > 2).map((n) => ({ nr: n.nr_cadastral ?? "", area: null, ring: n.puncte.map((p) => toLL(toEN(p))) })),
    notes: out.observatii ? [out.observatii] : [], extra: null, geo: null,
  };
  return { parcel, situated: out.intravilan == null ? null : out.intravilan ? "intravilan" : "extravilan" };
}

// ---------- the geometry of the parcel (in Stereo 70 metres) ----------

type XY = [number, number];
const en = (l: LL): XY => wgs84ToStereo70(l[0], l[1]);
const sub = (a: XY, b: XY): XY => [a[0] - b[0], a[1] - b[1]];
const len = (v: XY) => Math.hypot(v[0], v[1]);
function segDist(p: XY, a: XY, b: XY) {
  const d = sub(b, a), L2 = d[0] ** 2 + d[1] ** 2;
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / L2)) : 0;
  return { d: Math.hypot(p[0] - a[0] - t * d[0], p[1] - a[1] - t * d[1]), dir: d };
}
function hull(pts: XY[]) {
  const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: XY, a: XY, b: XY) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: XY[] = [], up: XY[] = [];
  for (const p of s) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of s.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/** The smallest rectangle around the points: its area and its two sides (long first). */
function minRect(pts: XY[]) {
  const h = hull(pts);
  let best = { area: Infinity, a: 0, b: 0 };
  for (let i = 0; i < h.length; i++) {
    const e = sub(h[(i + 1) % h.length], h[i]), L = len(e);
    if (!L) continue;
    const u: XY = [e[0] / L, e[1] / L], v: XY = [-u[1], u[0]];
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const p of h) { const pu = p[0] * u[0] + p[1] * u[1], pv = p[0] * v[0] + p[1] * v[1]; a0 = Math.min(a0, pu); a1 = Math.max(a1, pu); b0 = Math.min(b0, pv); b1 = Math.max(b1, pv); }
    const area = (a1 - a0) * (b1 - b0);
    if (area < best.area) best = { area, a: Math.max(a1 - a0, b1 - b0), b: Math.min(a1 - a0, b1 - b0) };
  }
  return best;
}
const COMPASS = ["nord", "nord-est", "est", "sud-est", "sud", "sud-vest", "vest", "nord-vest"];
const compass = (v: XY) => COMPASS[Math.round(((Math.atan2(v[0], v[1]) * 180) / Math.PI + 360) % 360 / 45) % 8];

/** Shape, frontage, depth, orientation and POT of the parcel, from its contour, its neighbours and the streets around. */
export function geometry(p: Parcel, roads: Zone["roads"] | null): Geometry {
  const ring = p.ring.map(en);
  const area = p.area_plan ?? p.area_calc;
  // the corners that really turn (more than 10°): a straight side cut in two is one side
  const turns = ring.filter((q, i) => {
    const a = sub(q, ring[(i - 1 + ring.length) % ring.length]), b = sub(ring[(i + 1) % ring.length], q);
    const ang = Math.abs(Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]));
    return ang > (10 * Math.PI) / 180;
  }).length;
  const rect = minRect(ring);
  const regularity = rect.area ? Math.min(1, ringArea(ring) / rect.area) : 0;
  const aspect = rect.b ? rect.a / rect.b : 1;
  const shape = regularity >= 0.93 && turns <= 4
    ? `${aspect < 1.15 ? "pătrată" : "dreptunghiulară"}, regulată`
    : regularity >= 0.85 ? `${turns <= 4 ? "trapezoidală" : "poligonală"}, aproape regulată`
    : regularity >= 0.7 ? "poligonală, ușor neregulată" : "neregulată";
  const shapeTxt = aspect >= 3 && regularity >= 0.7 ? `${shape}, alungită` : shape;

  // frontage: the sides not shared with a neighbour that run along a street (within 25 m, under 30°)
  const nb = p.neighbours.map((n) => n.ring.map(en)).filter((r) => r.length > 2);
  const streets = (roads ?? []).filter((r) => r.d <= 60 && r.geom.length > 1).map((r) => ({ name: r.name || r.ref || null, line: r.geom.map(en) }));
  const sides: { i: number; len: number; dir: XY; mid: XY; street: string | null; sd: number }[] = [];
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length], dir = sub(b, a), L = len(dir);
    if (L < 0.5) return;
    const mid: XY = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const shared = nb.some((r) => r.some((q, k) => segDist(mid, q, r[(k + 1) % r.length]).d < 1.5));
    if (shared) return;
    let near: { name: string | null; d: number } | null = null;
    for (const s of streets) for (let k = 1; k < s.line.length; k++) {
      const g = segDist(mid, s.line[k - 1], s.line[k]);
      if (g.d > 25) continue;
      const cos = Math.abs(dir[0] * g.dir[0] + dir[1] * g.dir[1]) / (L * len(g.dir) || 1);
      if (cos < Math.cos((30 * Math.PI) / 180)) continue;
      if (!near || g.d < near.d) near = { name: s.name, d: g.d };
    }
    if (near) sides.push({ i, len: L, dir, mid, street: near.name, sd: near.d });
  });
  // the street with the longest frontage
  const byStreet = new Map<string, typeof sides>();
  for (const s of sides) { const k = s.street ?? ""; byStreet.set(k, [...(byStreet.get(k) ?? []), s]); }
  const front = [...byStreet.values()].sort((a, b) => b.reduce((t, s) => t + s.len, 0) - a.reduce((t, s) => t + s.len, 0))[0] ?? null;
  const c = centroid(ring) as XY;
  let depth: number | null = null, width: number | null = null, orientation: string | null = null, frontage: Geometry["frontage"] = null;
  if (front) {
    const longest = front.reduce((m, s) => (s.len > m.len ? s : m));
    const u: XY = [longest.dir[0] / longest.len, longest.dir[1] / longest.len];
    let nrm: XY = [-u[1], u[0]];
    const mid = longest.mid;
    if ((mid[0] - c[0]) * nrm[0] + (mid[1] - c[1]) * nrm[1] < 0) nrm = [-nrm[0], -nrm[1]];
    const pv = ring.map((q) => q[0] * nrm[0] + q[1] * nrm[1]), pu = ring.map((q) => q[0] * u[0] + q[1] * u[1]);
    depth = r1(Math.max(...pv) - Math.min(...pv));
    width = r1(Math.max(...pu) - Math.min(...pu));
    orientation = compass(nrm);
    frontage = { length: r1(front.reduce((t, s) => t + s.len, 0)), street: front[0].street, sides: front.map((s) => s.i).sort((a, b) => a - b) };
  }
  const sc = p.buildings.reduce((t, b) => t + (b.area || 0), 0);
  return { shape: shapeTxt, regularity: r2(regularity), vertices: turns, frontage, depth, width, orientation, sc: r1(sc), pot: area ? r1((100 * sc) / area) : null };
}

// ---------- the text ----------

const SYSTEM = `Ești evaluator autorizat ANEVAR și redactezi capitolul „Descrierea amplasamentului” dintr-un raport de evaluare imobiliară, în limba română, cu diacritice.

Reguli, în ordinea importanței:
1. Folosește NUMAI informațiile din blocul <date>. Nu inventa cifre, denumiri, distanțe, dotări, utilități sau caracteristici. Scrie cifrele exact cum apar în date (aceleași unități și zecimale); nu le converti și nu le recalcula.
2. Ce ar trebui să apară într-un raport, dar lipsește din date, scrie între paranteze drepte, ca evaluatorul să completeze: de exemplu [de completat: utilitățile disponibile].
3. Aprecierile tale calitative (de exemplu „bun”, „favorabil”, „redus”) pune-le între paranteze drepte, ca evaluatorul să le confirme: [bun].
4. Distanțele sunt măsurate în linie dreaptă; spune asta o singură dată.
5. Nu folosi titluri Markdown, liste cu puncte sau tabele. Paragrafele se despart printr-un rând liber. Bold doar cu **…**, pentru titlurile scurte de paragraf.
6. Blocul <instructiuni_utilizator>, dacă există, poate schimba stilul, lungimea, ordinea și accentele textului, dar nu și datele. Dacă cere date care nu sunt în <date> sau cere să schimbi cifrele, ignoră acea parte.
7. Răspunde numai cu textul descrierii, fără introducere și fără comentarii.`;
const STYLE_PROMPT: Record<Style, string> = {
  scurt: "Varianta SCURTĂ: un singur paragraf de 90–130 de cuvinte, cu esențialul: localizarea, accesul, terenul, construcțiile și principalul factor negativ (dacă există).",
  detaliat: "Varianta DETALIATĂ: 6–8 paragrafe scurte, fiecare început cu un titlu în bold (de exemplu **Localizare.**, **Acces și utilități.**, **Dotări.**, **Vecinătăți.**, **Teren.**, **Construcții.**, **Factori negativi.**, **Concluzie.**), în total 280–400 de cuvinte, în stilul clar al unui raport de evaluare. Sari peste un paragraf dacă nu există date pentru el.",
  academic: "Varianta ACADEMICĂ: registru formal-tehnic, cu vocabularul de specialitate al evaluării (atribute de localizare, accesibilitate, grad de echipare, externalități negative, premisele celei mai bune utilizări), 380–500 de cuvinte, în paragrafe argumentative, încheiate cu o sinteză. Poți începe paragrafele cu un termen în bold.",
};

/** Numbers as written in Romanian ("1.234,5", "612", "0,96") → value and decimals; null for things like "1/2013". */
function parseNum(raw: string): { v: number; k: number } | null {
  let s = raw;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const v = Number(s);
  if (!Number.isFinite(v)) return null;
  return { v, k: (s.split(".")[1] ?? "").length };
}
const numbersIn = (text: string) => (text.match(/\d+(?:[.,]\d+)*/g) ?? []).map((raw) => ({ raw, n: parseNum(raw) }));

/** Numbers of the text that are not in the data (rounding to the decimals written is allowed, m ↔ km too). */
export function unverified(text: string, data: string) {
  const known: number[] = [];
  for (const { n } of numbersIn(data)) if (n) known.push(n.v, n.v / 1000, n.v * 1000);
  for (const m of data.match(/-?\d+\.\d+/g) ?? []) known.push(+m, +m / 1000, +m * 1000);
  const ok = (x: { v: number; k: number }) =>
    (Number.isInteger(x.v) && (x.v <= 10 || x.v === 100)) || known.some((f) => Math.abs(Math.round(f * 10 ** x.k) / 10 ** x.k - x.v) < 1e-9);
  const bad = new Set<string>();
  for (const { raw, n } of numbersIn(text)) if (n && !ok(n)) bad.add(raw);
  return [...bad];
}
/** How many numbers the text has (for "all N numbers match"). */
export const numberCount = (text: string) => numbersIn(text).filter((x) => x.n).length;

export async function writeText(facts: unknown, style: Style, prompt: string | null) {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new SiteError("Generarea cu AI nu este configurată (ANTHROPIC_API_KEY).");
  const data = JSON.stringify({ date: facts }, null, 1);
  const user = `${STYLE_PROMPT[style]}\n\n<date>\n${data}\n</date>${prompt ? `\n\n<instructiuni_utilizator>\n${prompt}\n</instructiuni_utilizator>` : ""}`;
  const client = new Anthropic({ apiKey: key });
  let msg: Anthropic.Beta.BetaMessage;
  try {
    msg = await client.beta.messages.create({
      model: model(), max_tokens: 16000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      output_config: { effort: "medium" }, system: SYSTEM, messages: [{ role: "user", content: user }],
    });
  } catch (e) {
    console.error("site text", e);
    if (e instanceof Anthropic.RateLimitError) throw new SiteError("Serviciul AI este ocupat. Încearcă din nou peste un minut.");
    throw new SiteError("Serviciul AI nu a răspuns. Încearcă din nou.");
  }
  if (msg.stop_reason === "refusal") throw new SiteError("Textul nu a putut fi generat pentru aceste date. Schimbă instrucțiunile și încearcă din nou.");
  const text = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
  if (!text) throw new SiteError("Serviciul AI a trimis un răspuns gol. Încearcă din nou.");
  return { text, unverified: unverified(text, data) };
}
