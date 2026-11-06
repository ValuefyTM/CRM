// The site analysis on paper (browser only), laid out as the UVALO site analysis exports it: the zone map and the site
// plan drawn the same way, A4 pages drawn on a canvas (header with the firm and the valuer, the two figures side by side,
// under each its table, then the "Descrierea amplasamentului" text, justified, with the bracketed parts highlighted, and
// the sources in the footer) → PDF; the same order and look as a Word document (.docx).
import { makeZip } from "./zip";
import { wgs84ToStereo70 } from "./stereo70";
import { fmt, inCity, type LL, type Parcel, type Site, type Zone } from "./site-shared";

export type Meta = { company: string; subtitle: string; evaluator: string; title: string };
export type Base = "harta" | "satelit";
export const RADIUS = 1000;

/** Distances as in UVALO: at least 10 m, rounded to 10 m; km with one decimal. */
export const fmtD = (m: number | null | undefined) => (m == null ? "–" : m < 1000 ? `${fmt(Math.max(10, Math.round(m / 10) * 10))} m` : `${fmt(m / 1000, 1)} km`);

/** The categories with an amenity within 1.5 km, in the order of the list: the nearest one and how many in the radius. */
export function catCounts(z: Zone) {
  return z.cats.map((c) => {
    const all = z.pois.filter((x) => x.cat === c.key).sort((a, b) => a.d - b.d);
    return { ...c, near: all[0] ?? null, count: all.filter((x) => x.d <= RADIUS).length };
  }).filter((c): c is typeof c & { near: NonNullable<typeof c.near> } => !!c.near && c.near.d <= 1500);
}

// ---------- the zone map (Fig. 1) ----------

const TS = 256;
const TILES: Record<Base, string> = {
  harta: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  satelit: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
};
const projX = (lng: number, z: number) => ((lng + 180) / 360) * TS * 2 ** z;
const projY = (lat: number, z: number) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * TS * 2 ** z; };
const loadImg = (src: string) => new Promise<HTMLImageElement | null>((res) => {
  const i = new Image();
  i.crossOrigin = "anonymous";
  i.referrerPolicy = "strict-origin-when-cross-origin";
  i.onload = () => res(i); i.onerror = () => res(null);
  i.src = src;
});
const FONT = "Verdana, Geneva, sans-serif";

export async function zoneCanvas(z: Zone, p: Parcel | null, base: Base, w: number, h: number) {
  const c = p?.centre ?? z.at;
  let zoom = 18;
  for (; zoom > 10; zoom--) { const dy = projY(c[0] - RADIUS / 111320, zoom) - projY(c[0] + RADIUS / 111320, zoom); if (dy * 1.08 <= h) break; }
  const cx = projX(c[1], zoom), cy = projY(c[0], zoom), x0 = cx - w / 2, y0 = cy - h / 2;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#e9e4d8"; ctx.fillRect(0, 0, w, h);
  const jobs: { tx: number; ty: number; p: Promise<HTMLImageElement | null> }[] = [];
  for (let tx = Math.floor(x0 / TS); tx <= Math.floor((x0 + w) / TS); tx++) for (let ty = Math.floor(y0 / TS); ty <= Math.floor((y0 + h) / TS); ty++)
    jobs.push({ tx, ty, p: loadImg(TILES[base].replace("{z}", String(zoom)).replace("{x}", String(tx)).replace("{y}", String(ty))) });
  for (const j of jobs) { const im = await j.p; if (im) ctx.drawImage(im, Math.round(j.tx * TS - x0), Math.round(j.ty * TS - y0)); }
  const at = (la: number, ln: number) => [projX(ln, zoom) - x0, projY(la, zoom) - y0];
  const r = projY(c[0] - RADIUS / 111320, zoom) - cy;
  ctx.save(); ctx.strokeStyle = "#C23A2E"; ctx.lineWidth = 2; ctx.setLineDash([8, 8]); ctx.fillStyle = "rgba(194,58,46,.05)";
  ctx.beginPath(); ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
  const sat = base === "satelit";
  if (p && p.ring.length > 2) {
    ctx.beginPath(); p.ring.forEach((q, i) => { const [x, y] = at(q[0], q[1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.closePath();
    ctx.fillStyle = sat ? "rgba(194,58,46,.22)" : "rgba(194,58,46,.85)"; ctx.fill(); ctx.strokeStyle = sat ? "#FFD54A" : "#141414"; ctx.lineWidth = sat ? 3 : 2; ctx.stroke();
  } else {
    ctx.fillStyle = "#C23A2E"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(w / 2, h / 2, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  catCounts(z).forEach((k, i) => {
    const [x, y] = at(k.near.lat, k.near.lng);
    ctx.fillStyle = "#1F6F63"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = `700 13px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(i + 1), x, y + 1);
  });
  const attr = sat ? "Imagini © Esri" : "© OpenStreetMap";
  ctx.font = "400 12px Arial, sans-serif";
  const tw = ctx.measureText(attr).width;
  ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(w - tw - 12, h - 20, tw + 12, 20);
  ctx.fillStyle = "#333"; ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(attr, w - 6, h - 10);
  return cv;
}

// ---------- the site plan (Fig. 2) ----------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
type XY = [number, number];
const en = (l: LL): XY => wgs84ToStereo70(l[0], l[1]);
const bbox = (s: XY[]) => [Math.min(...s.map((q) => q[0])), Math.min(...s.map((q) => q[1])), Math.max(...s.map((q) => q[0])), Math.max(...s.map((q) => q[1]))];
function centroid(s: XY[]): XY {
  let A = 0, x = 0, y = 0;
  const a0 = s[0][0], b0 = s[0][1];
  for (let i = 0, j = s.length - 1; i < s.length; j = i++) {
    const pa = s[j][0] - a0, pb = s[j][1] - b0, qa = s[i][0] - a0, qb = s[i][1] - b0, f = pa * qb - qa * pb;
    A += f; x += (pa + qa) * f; y += (pb + qb) * f;
  }
  if (Math.abs(A) < 1e-9) return [s.reduce((t, q) => t + q[0], 0) / s.length, s.reduce((t, q) => t + q[1], 0) / s.length];
  return [a0 + x / (3 * A), b0 + y / (3 * A)];
}

/** The site plan as SVG (Stereo 70, north up): the streets, the registered neighbours, the parcel with its points and side
 *  lengths, the buildings, the frontage and the depth, north and the scale. */
export function planSvg(p: Parcel, z: Zone | null, W: number, H: number) {
  const S = p.pts.map((q) => [q.y, q.x] as XY);
  const b = bbox(S), sz = Math.max(b[2] - b[0], b[3] - b[1]), pad = Math.max(14, sz * 0.45);
  const x0 = b[0] - pad, x1 = b[2] + pad, y0 = b[1] - pad, y1 = b[3] + pad;
  const k = Math.min((W - 40) / (x1 - x0), (H - 40) / (y1 - y0)), ox = (W - (x1 - x0) * k) / 2, oy = (H - (y1 - y0) * k) / 2;
  const X = (e: number) => (ox + (e - x0) * k).toFixed(1), Y = (n: number) => (oy + (y1 - n) * k).toFixed(1);
  const path = (s: XY[]) => s.map((q, i) => (i ? "L" : "M") + X(q[0]) + " " + Y(q[1])).join(" ") + "Z";
  const line = (s: XY[]) => s.map((q, i) => (i ? "L" : "M") + X(q[0]) + " " + Y(q[1])).join(" ");
  let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Verdana,Geneva,sans-serif"><rect width="${W}" height="${H}" fill="#FBF8F2"/>`;
  const roads = (z?.roads ?? []).map((r) => ({ name: r.name, en: r.geom.map(en) })).filter((r) => r.en.length > 1);
  roads.forEach((r) => { o += `<path d="${line(r.en)}" fill="none" stroke="#E2D8C4" stroke-width="${Math.max(10, 7 * k)}" stroke-linecap="round" stroke-linejoin="round"/>`; });
  roads.forEach((r) => { o += `<path d="${line(r.en)}" fill="none" stroke="#FFFFFF" stroke-width="${Math.max(7, 5 * k)}" stroke-linecap="round" stroke-linejoin="round"/>`; });
  const near = (B: number[]) => B[2] >= x0 && B[0] <= x1 && B[3] >= y0 && B[1] <= y1;
  const nb = p.neighbours.map((n) => ({ id: n.nr, s: n.ring.map(en) })).filter((n) => n.s.length > 2 && near(bbox(n.s)));
  const fromDoc = p.source === "doc";
  nb.forEach((q) => { o += `<path d="${path(q.s)}" fill="#FFFFFF" fill-opacity="${fromDoc ? ".9" : ".85"}" stroke="${fromDoc ? "#9C9282" : "#BDB3A0"}" stroke-width="${fromDoc ? 1.2 : 1}"${fromDoc ? ' stroke-dasharray="5 3"' : ""}/>`; });
  nb.forEach((q) => {
    if (!q.id) return;
    const c = centroid(q.s), B = bbox(q.s);
    if (fromDoc) {
      const cx = Math.min(Math.max(c[0], x0 + 6 / k), x1 - 6 / k), cy = Math.min(Math.max(c[1], y0 + 6 / k), y1 - 6 / k);
      o += `<text x="${X(cx)}" y="${Y(cy)}" font-size="11" fill="#6B6253" text-anchor="middle" dominant-baseline="middle" stroke="#FFFFFF" stroke-width="3" paint-order="stroke">${esc(q.id)}</text>`;
    } else if ((B[2] - B[0]) * k > 46 && (B[3] - B[1]) * k > 16 && c[0] > x0 && c[0] < x1 && c[1] > y0 && c[1] < y1)
      o += `<text x="${X(c[0])}" y="${Y(c[1])}" font-size="11" fill="#6B6253" text-anchor="middle" dominant-baseline="middle">${esc(q.id)}</text>`;
  });
  // the parcel and its buildings
  o += `<path d="${path(S)}" fill="#F8E4DF" stroke="#C23A2E" stroke-width="3"/>`;
  const C = centroid(S);
  const bs = p.buildings.filter((x) => x.ring.length > 2).map((x) => ({ c: x.name, s: x.ring.map(en) }));
  bs.forEach((x) => { const c = centroid(x.s); o += `<path d="${path(x.s)}" fill="#E9D9CC" stroke="#141414" stroke-width="1.5"/><text x="${X(c[0])}" y="${Y(c[1])}" font-size="13" font-weight="700" fill="#141414" text-anchor="middle" dominant-baseline="middle">${esc(x.c)}</text>`; });
  if (p.nr) o += `<text x="${X(C[0])}" y="${+Y(C[1]) + (bs.length ? 28 : 0)}" font-size="13" font-weight="700" fill="#C23A2E" text-anchor="middle" dominant-baseline="middle">${esc(p.nr)}</text>`;
  // the points and the side lengths, as on the site plan
  const n = S.length, cx = +X(C[0]), cy = +Y(C[1]);
  const out = (px: number, py: number, d: number) => { const vx = px - cx, vy = py - cy, L = Math.hypot(vx, vy) || 1; return [px + (vx / L) * d, py + (vy / L) * d]; };
  const halo = 'stroke="#FBF8F2" stroke-width="4" paint-order="stroke"';
  if (n <= 40) S.forEach((q, i) => {
    const r = S[(i + 1) % n], ax = +X(q[0]), ay = +Y(q[1]), bx = +X(r[0]), by = +Y(r[1]), len = Math.hypot(r[0] - q[0], r[1] - q[1]);
    if (Math.hypot(bx - ax, by - ay) > 38) {
      const [mx, my] = out((ax + bx) / 2, (ay + by) / 2, 13);
      let ang = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      o += `<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" font-size="11" fill="#141414" text-anchor="middle" dominant-baseline="middle" transform="rotate(${ang.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)})" ${halo}>${fmt(len, 2)}</text>`;
    }
  });
  if (n <= 40) S.forEach((q, i) => { const x = +X(q[0]), y = +Y(q[1]), [tx, ty] = out(x, y, 12); o += `<circle cx="${x}" cy="${y}" r="3.2" fill="#141414"/><text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" font-size="11" font-weight="700" fill="#141414" text-anchor="middle" dominant-baseline="middle" ${halo}>${esc(p.pts[i]?.pct ?? String(i + 1))}</text>`; });
  // the street names
  roads.forEach((r) => {
    if (!r.name) return;
    let best: { m: XY; L: number; a: number } | null = null;
    for (let i = 1; i < r.en.length; i++) {
      const m: XY = [(r.en[i - 1][0] + r.en[i][0]) / 2, (r.en[i - 1][1] + r.en[i][1]) / 2];
      if (m[0] < x0 || m[0] > x1 || m[1] < y0 || m[1] > y1) continue;
      const L = Math.hypot(r.en[i][0] - r.en[i - 1][0], r.en[i][1] - r.en[i - 1][1]);
      if (!best || L > best.L) best = { m, L, a: Math.atan2(r.en[i][1] - r.en[i - 1][1], r.en[i][0] - r.en[i - 1][0]) };
    }
    if (best) {
      let ang = (-best.a * 180) / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      o += `<text x="${X(best.m[0])}" y="${Y(best.m[1])}" font-size="11" fill="#6B6253" text-anchor="middle" dominant-baseline="middle" transform="rotate(${ang.toFixed(1)} ${X(best.m[0])} ${Y(best.m[1])})" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(r.name)}</text>`;
    }
  });
  // the frontage and the depth
  const g = p.geo;
  if (g?.frontage && g.frontage.sides.length) {
    const longest = g.frontage.sides.map((i) => ({ a: S[i], b: S[(i + 1) % n] })).filter((s) => s.a && s.b).sort((u, v) => Math.hypot(v.b[0] - v.a[0], v.b[1] - v.a[1]) - Math.hypot(u.b[0] - u.a[0], u.b[1] - u.a[1]))[0];
    if (longest) {
      const m: XY = [(longest.a[0] + longest.b[0]) / 2, (longest.a[1] + longest.b[1]) / 2], v = [m[0] - C[0], m[1] - C[1]], L = Math.hypot(v[0], v[1]) || 1, off = Math.max(6, sz * 0.08);
      const tx = m[0] + (v[0] / L) * off, ty = m[1] + (v[1] / L) * off;
      o += `<text x="${X(tx)}" y="${Y(ty)}" font-size="12" font-weight="700" fill="#9A5F00" text-anchor="middle" dominant-baseline="middle" stroke="#FBF8F2" stroke-width="4" paint-order="stroke">deschidere ${fmt(g.frontage.length, 1)} m</text>`;
      if (g.depth != null) o += `<text x="${X(C[0])}" y="${+Y(C[1]) + (bs.length ? 46 : 20)}" font-size="11" font-weight="700" fill="#9A5F00" text-anchor="middle" stroke="#F8E4DF" stroke-width="4" paint-order="stroke">adâncime ${fmt(g.depth, 1)} m</text>`;
    }
  }
  o += `<g transform="translate(${W - 34},34)"><path d="M0 -18 L7 6 L0 1 L-7 6 Z" fill="#141414"/><text y="20" font-size="11" text-anchor="middle" fill="#141414">N</text></g>`;
  const sc = [5, 10, 20, 50, 100, 200].find((v) => v * k >= 60) ?? 200;
  o += `<g transform="translate(16,${H - 18})"><rect width="${(sc * k).toFixed(1)}" height="5" fill="#141414"/><text y="-5" font-size="10" fill="#4A4A4A">${sc} m</text></g>`;
  return o + "</svg>";
}

export async function planCanvas(p: Parcel, z: Zone | null, w: number, h: number) {
  const im = await loadImg("data:image/svg+xml;charset=utf-8," + encodeURIComponent(planSvg(p, z, w, h)));
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#FBF8F2"; ctx.fillRect(0, 0, w, h);
  if (im) ctx.drawImage(im, 0, 0, w, h);
  return cv;
}

// ---------- the tables, the title, the sources ----------

type Table = [title: string, rows: [string, string][]];

export function siteTables(s: Site): Table[] {
  const p = s.parcel, g = p?.geo, z = s.zone, t: Table[] = [];
  if (p) {
    const A = p.area_plan ?? p.area_calc, rows: [string, string][] = [["Suprafață măsurată în plan", `${fmt(A)} mp`]];
    if (p.area_acte) rows.push(["Suprafață din act / diferență", `${fmt(p.area_acte)} mp / ${A - p.area_acte >= 0 ? "+" : ""}${fmt((100 * (A - p.area_acte)) / p.area_acte, 1)}%`]);
    if (g) {
      rows.push(["Formă", `${g.shape} (regularitate ${fmt(g.regularity, 2)})`]);
      if (g.frontage) rows.push(["Deschidere la stradă", `${fmt(g.frontage.length, 1)} m${g.frontage.street ? ` – ${g.frontage.street}` : ""}`]);
      if (g.depth != null) rows.push(["Adâncime", `${fmt(g.depth, 1)} m`]);
      if (g.orientation) rows.push(["Orientare front", `spre ${g.orientation}`]);
    }
    rows.push(["Construcții", p.buildings.length ? p.buildings.map((b) => `${b.name} ${fmt(b.area)} mp`).join(", ") : "niciuna în plan"]);
    if (p.buildings.length && g?.pot != null) rows.push(["POT existent", `${fmt(g.pot, 1)}%`]);
    if (s.situated) rows.push(["Situare", s.situated]);
    t.push(["Caracteristicile terenului", rows]);
  }
  if (z) {
    const rows: [string, string][] = [];
    if (z.locality) rows.push([`Centrul localității ${z.locality.name}`, fmtD(z.locality.d)]);
    if (z.city && (!z.locality || z.city.name !== z.locality.name) && !inCity(z)) rows.push([`Centrul ${z.city.name}`, fmtD(z.city.d)]);
    catCounts(z).forEach((c, i) => rows.push([`${i + 1}. ${c.label}`, `${fmtD(c.near.d)} · ${c.count} în rază`]));
    z.neg.forEach((x) => rows.push([`⚠ ${x.label}`, x.d === 0 ? "pe amplasament" : fmtD(x.d)]));
    t.unshift([`Localizare și dotări (rază ${fmtD(RADIUS)})`, rows]);
  }
  return t;
}
export const docTitle = (s: Site, fallback: string) => {
  const p = s.parcel;
  return p?.nr ? `Parcela nr. cadastral ${p.nr}${p.uat ? `, ${p.uat}` : ""}${p.county ? `, jud. ${p.county}` : ""}` : fallback;
};
export function sources(s: Site) {
  const p = s.parcel, z = s.zone;
  return `Surse: ${p ? (p.source === "ancpi" ? `plan cadastral ANCPI (${p.plan_date ?? "export"}); ` : `${p.doc_name ?? "documentul încărcat"} (coordonate citite cu AI); `) : ""}© contribuitorii OpenStreetMap${z ? ` (date din ${z.date.split("-").reverse().join(".")})` : ""}. Distanțele sunt în linie dreaptă. Datele au caracter informativ și nu înlocuiesc extrasul de carte funciară sau documentația cadastrală.`;
}

// ---------- the PDF: A4 pages drawn on a canvas ----------

function trunc(ctx: CanvasRenderingContext2D, t: string, w: number) {
  if (ctx.measureText(t).width <= w) return t;
  let s = t;
  while (s.length && ctx.measureText(s + "…").width > w) s = s.slice(0, -1);
  return s + "…";
}
function a4() {
  const cv = document.createElement("canvas");
  cv.width = 1240; cv.height = 1754;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 1240, 1754);
  return { cv, ctx };
}
function pageHead(ctx: CanvasRenderingContext2D, M: number, W: number, meta: Meta, sub: string) {
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#1A1916"; ctx.font = `700 22px ${FONT}`; ctx.fillText(trunc(ctx, meta.company, W * 0.62), M, M + 24);
  ctx.fillStyle = "#54514A"; ctx.font = `400 13px ${FONT}`; ctx.fillText(trunc(ctx, meta.subtitle, W * 0.62), M, M + 46);
  ctx.textAlign = "right"; ctx.fillStyle = "#6b6559"; ctx.font = `400 12.5px ${FONT}`;
  ctx.fillText(`Data: ${new Date().toLocaleDateString("ro-RO")}`, M + W, M + 18);
  if (meta.evaluator) ctx.fillText(`Evaluator: ${trunc(ctx, meta.evaluator, W * 0.34)}`, M + W, M + 38);
  if (sub) ctx.fillText(sub, M + W, M + 58);
  ctx.textAlign = "left"; ctx.fillStyle = "#F2A93B"; ctx.fillRect(M, M + 70, W, 2);
}
function pageFoot(ctx: CanvasRenderingContext2D, M: number, W: number, H: number, txt: string, right: string) {
  ctx.fillStyle = "#CFC4AE"; ctx.fillRect(M, H - M - 26, W, 1);
  ctx.fillStyle = "#6b6559"; ctx.font = `400 11px ${FONT}`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  const lines: string[] = [];
  let line = "";
  for (const w of txt.split(" ")) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > W - 140) { lines.push(line); line = w; } else line = t; }
  lines.push(line);
  const y = H - M - 10;
  lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, M, y + i * 14 - (lines.length > 1 ? 14 : 0)));
  ctx.textAlign = "right"; ctx.fillText(right, M + W, H - M - 10); ctx.textAlign = "left";
}
function wrapLines(ctx: CanvasRenderingContext2D, t: string, w: number) {
  const out: string[] = [];
  let line = "";
  for (let word of String(t).split(/\s+/).filter(Boolean)) {
    while (ctx.measureText(word).width > w && word.length > 1) {
      if (line) { out.push(line); line = ""; }
      let k = word.length - 1;
      while (k > 1 && ctx.measureText(word.slice(0, k)).width > w) k--;
      out.push(word.slice(0, k)); word = word.slice(k);
    }
    const s = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(s).width > w) { out.push(line); line = word; } else line = s;
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}
function drawTable(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, title: string, rows: [string, string][]) {
  ctx.fillStyle = "#1A1916"; ctx.font = `700 15px ${FONT}`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillText(title, x, y + 16);
  y += 28;
  const c1 = w * 0.5, lh = 17, pad = 7;
  rows.forEach((r, i) => {
    ctx.font = `400 12.5px ${FONT}`; const L = wrapLines(ctx, r[0], c1 - 16);
    ctx.font = `700 12.5px ${FONT}`; const R = wrapLines(ctx, r[1], w - c1 - 10);
    const n = Math.max(L.length, R.length), rh = Math.max(30, n * lh + 2 * pad - 1);
    ctx.fillStyle = i % 2 ? "#FBF8F2" : "#FFFFFF"; ctx.fillRect(x, y, w, rh);
    ctx.strokeStyle = "#E2D8C4"; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, rh - 1);
    ctx.textBaseline = "middle";
    const y0 = y + (rh - (n - 1) * lh) / 2 + 1;
    ctx.fillStyle = r[0].startsWith("⚠") ? "#B3261E" : "#4A4A4A"; ctx.font = `400 12.5px ${FONT}`; L.forEach((l, k) => ctx.fillText(l, x + 8, y0 + k * lh));
    ctx.fillStyle = "#141414"; ctx.font = `700 12.5px ${FONT}`; R.forEach((l, k) => ctx.fillText(l, x + c1, y0 + k * lh));
    ctx.textBaseline = "alphabetic"; y += rh;
  });
  return y;
}

/** "**bold** text [de completat]" → runs: b = bold, m = to complete (highlighted). */
export function markRuns(par: string) {
  const out: { t: string; b: boolean; m: boolean }[] = [];
  let bold = false;
  for (const part of par.split(/(\*\*)/)) {
    if (part === "**") { bold = !bold; continue; }
    for (const q of part.split(/(\[[^\]]{1,160}\])/)) if (q) out.push({ t: q, b: bold, m: /^\[.*\]$/.test(q) });
  }
  return out;
}

function pagesFromText(text: string, start: { ctx: CanvasRenderingContext2D; y: number; n: number }, meta: Meta, foot: string, right: string) {
  const pages: HTMLCanvasElement[] = [], M = 80, W = 1240 - 2 * M, size = 17, lh = 29;
  let ctx = start.ctx, y = start.y;
  const font = (b: boolean) => `${b ? "700 " : "400 "}${size}px ${FONT}`;
  const newPage = () => { const p = a4(); pageHead(p.ctx, M, W, meta, `pagina ${start.n + pages.length + 1}`); pageFoot(p.ctx, M, W, 1754, foot, right); pages.push(p.cv); ctx = p.ctx; y = M + 110; };
  type Wd = { t: string; b: boolean; m: boolean; j: boolean };
  const measure = (w: Wd) => { ctx.font = font(w.b); return ctx.measureText(w.t).width; };
  for (const par of text.split(/\n\s*\n/)) {
    for (let src of par.split(/\n/).map((x) => x.trim()).filter(Boolean)) {
      const bullet = /^[-•–*]\s+/.test(src), ind = bullet ? 26 : 0;
      if (bullet) src = src.replace(/^[-•–*]\s+/, "");
      const words: Wd[] = [];
      let ws0 = true;
      markRuns(src).forEach((r) => r.t.split(/(\s+)/).forEach((t) => { if (!t) return; if (!t.trim()) { ws0 = true; return; } words.push({ ...r, t, j: !ws0 && words.length > 0 }); ws0 = false; }));
      ctx.font = font(false);
      const sp = ctx.measureText(" ").width, avail = W - ind;
      const parts: Wd[] = [];
      for (let w of words) {
        let t = w.t;
        ctx.font = font(w.b);
        while (ctx.measureText(t).width > avail && t.length > 1) { let k = t.length - 1; while (k > 1 && ctx.measureText(t.slice(0, k)).width > avail) k--; parts.push({ ...w, t: t.slice(0, k) }); t = t.slice(k); w = { ...w, j: false }; }
        parts.push({ ...w, t });
      }
      let line: Wd[] = [], lw = 0, first = true;
      const flush = (last: boolean) => {
        if (y + lh > 1754 - M - 44) newPage();
        if (first && bullet) { ctx.font = font(false); ctx.fillStyle = "#1A1916"; ctx.textBaseline = "alphabetic"; ctx.fillText("•", M + 6, y); }
        const ws = line.map(measure), tot = ws.reduce((a, b) => a + b, 0), ng = line.filter((w, i) => i && !w.j).length, gap = !last && ng ? (avail - tot) / ng : sp;
        let x = M + ind;
        line.forEach((w, i) => {
          const ww = ws[i];
          if (i && !w.j) x += gap;
          if (w.m) { const nx = i < line.length - 1 && line[i + 1].m; ctx.fillStyle = "#FFF2B3"; ctx.fillRect(x, y - size, ww + (nx && !line[i + 1].j ? gap : 0), size + 7); }
          ctx.font = font(w.b); ctx.fillStyle = "#1A1916"; ctx.textBaseline = "alphabetic"; ctx.fillText(w.t, x, y); x += ww;
        });
        y += lh; line = []; lw = 0; first = false;
      };
      for (let w of parts) {
        const ww = measure(w), add = (line.length && !w.j ? sp : 0) + ww;
        if (line.length && lw + add > avail) { flush(false); w = { ...w, j: false }; line.push(w); lw = ww; } else { line.push(w); lw += add; }
      }
      if (line.length) flush(true);
    }
    y += 12;
  }
  return pages;
}

const plain = (t: string) => t.trim();

export async function buildPages(s: Site, meta: Meta, base: Base) {
  const M = 80, W = 1240 - 2 * M, foot = sources(s), right = meta.company;
  const p1 = a4(), ctx = p1.ctx;
  pageHead(ctx, M, W, meta, ""); pageFoot(ctx, M, W, 1754, foot, right);
  ctx.fillStyle = "#1A1916"; ctx.font = `700 26px ${FONT}`; ctx.textAlign = "left"; ctx.fillText("Analiza amplasamentului", M, M + 112);
  ctx.fillStyle = "#4A4A4A"; ctx.font = `400 14px ${FONT}`; ctx.fillText(trunc(ctx, docTitle(s, meta.title), W), M, M + 138);
  let y = M + 160;
  const p = s.parcel, half = (W - 24) / 2, mh = p ? 470 : 560, mw = p ? half : W;
  if (s.zone) {
    const zc = await zoneCanvas(s.zone, p, base, Math.round(mw * 1.5), Math.round(mh * 1.5));
    ctx.drawImage(zc, M, y, mw, mh); ctx.strokeStyle = "#CFC4AE"; ctx.lineWidth = 1; ctx.strokeRect(M + 0.5, y + 0.5, mw - 1, mh - 1);
  }
  if (p) { const pc = await planCanvas(p, s.zone, Math.round(half * 1.5), Math.round(mh * 1.5)); ctx.drawImage(pc, M + half + 24, y, half, mh); ctx.strokeRect(M + half + 24.5, y + 0.5, half - 1, mh - 1); }
  ctx.fillStyle = "#6b6559"; ctx.font = `400 12px ${FONT}`;
  if (s.zone) ctx.fillText(`Fig. 1 — Încadrarea în zonă (rază ${fmtD(RADIUS)}; numerele = dotările din tabel)`, M, y + mh + 20);
  if (p) ctx.fillText("Fig. 2 — Plan de situație", M + half + 24, y + mh + 20);
  y += mh + 48;
  const T = siteTables(s);
  let yy = y;
  if (T.length === 2) yy = Math.max(drawTable(ctx, M, y, half, T[0][0], T[0][1]), drawTable(ctx, M + half + 24, y, half, T[1][0], T[1][1]));
  else if (T.length) yy = drawTable(ctx, M, y, W, T[0][0], T[0][1]);
  const pages = [p1.cv], text = s.text ? plain(s.text) : "";
  if (text) {
    let start;
    if (1754 - M - 60 - yy > 520) { ctx.fillStyle = "#1A1916"; ctx.font = `700 18px ${FONT}`; ctx.textAlign = "left"; ctx.fillText("Descrierea amplasamentului", M, yy + 40); start = { ctx, y: yy + 76, n: 1 }; }
    else {
      const p2 = a4(); pageHead(p2.ctx, M, W, meta, "pagina 2"); pageFoot(p2.ctx, M, W, 1754, foot, right);
      p2.ctx.fillStyle = "#1A1916"; p2.ctx.font = `700 20px ${FONT}`; p2.ctx.textAlign = "left"; p2.ctx.fillText("Descrierea amplasamentului", M, M + 112);
      pages.push(p2.cv); start = { ctx: p2.ctx, y: M + 150, n: 2 };
    }
    pages.push(...pagesFromText(text, start, meta, foot, right));
  }
  return pages;
}

const jpeg = (cv: HTMLCanvasElement, q: number) => new Promise<Uint8Array>((res, rej) => cv.toBlob((b) => (b ? b.arrayBuffer().then((a) => res(new Uint8Array(a))) : rej(new Error("tainted"))), "image/jpeg", q));
const png = (cv: HTMLCanvasElement) => new Promise<Uint8Array | null>((res) => { try { cv.toBlob((b) => (b ? b.arrayBuffer().then((a) => res(new Uint8Array(a))) : res(null)), "image/png"); } catch { res(null); } });
export const CORS = "Browserul a blocat compunerea imaginii din plăcile hărții. Reîncearcă peste câteva secunde.";

export async function sitePdf(s: Site, meta: Meta, base: Base) {
  const { PDFDocument } = await import("pdf-lib");
  const pages = await buildPages(s, meta, base);
  const pdf = await PDFDocument.create();
  const A4: [number, number] = [595.28, 841.89];
  for (const cv of pages) {
    const img = await pdf.embedJpg(await jpeg(cv, 0.92).catch(() => { throw new Error(CORS); }));
    pdf.addPage(A4).drawImage(img, { x: 0, y: 0, width: A4[0], height: A4[1] });
  }
  return new Blob([new Uint8Array(await pdf.save())], { type: "application/pdf" });
}

// ---------- Word: the same order and look ----------

const x = (s: string) => esc(s);
type R = { t: string; b?: boolean; sz?: number; color?: string; hl?: boolean };
const run = (r: R) => `<w:r><w:rPr><w:rFonts w:ascii="Verdana" w:hAnsi="Verdana" w:cs="Verdana"/>${r.b ? "<w:b/>" : ""}${r.color ? `<w:color w:val="${r.color}"/>` : ""}<w:sz w:val="${r.sz ?? 20}"/>${r.hl ? '<w:highlight w:val="yellow"/>' : ""}</w:rPr><w:t xml:space="preserve">${x(r.t)}</w:t></w:r>`;
const para = (runs: string, o: { before?: number; after?: number; jc?: string; border?: string } = {}) =>
  `<w:p><w:pPr>${o.border ?? ""}<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 0}"/>${o.jc ? `<w:jc w:val="${o.jc}"/>` : ""}</w:pPr>${runs}</w:p>`;
const EMU = 9525; // per pixel (96 dpi), as the docx library counts
const pic = (rid: string, n: number, w: number, h: number) => `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${w * EMU}" cy="${h * EMU}"/><wp:docPr id="${n}" name="Figura ${n}"/>
<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:nvPicPr><pic:cNvPr id="${n}" name="fig${n}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w * EMU}" cy="${h * EMU}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
const NB = '<w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/>';
const BD = (t: string) => `<w:${t} w:val="single" w:sz="4" w:space="0" w:color="D8CFBD"/>`;

export async function siteDocx(s: Site, meta: Meta, base: Base) {
  const media: { name: string; data: Uint8Array }[] = [], rels: string[] = [], kids: string[] = [];
  kids.push(para(run({ t: meta.company, b: true, sz: 28 })));
  if (meta.subtitle) kids.push(para(run({ t: meta.subtitle, sz: 18, color: "54514A" })));
  kids.push(para(run({ t: `Data: ${new Date().toLocaleDateString("ro-RO")}${meta.evaluator ? ` · Evaluator: ${meta.evaluator}` : ""}`, sz: 16, color: "6B6559" }),
    { after: 200, border: '<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="1" w:color="F2A93B"/></w:pBdr>' }));
  kids.push(para(run({ t: "Analiza amplasamentului", b: true, sz: 32 })));
  kids.push(para(run({ t: docTitle(s, meta.title), sz: 18, color: "54514A" }), { after: 160 }));

  // as in the PDF: the maps side by side, under each its table (a layout table without borders, 10106 twips wide)
  const FW = 10106, GAP = 240, HW = (FW - GAP) / 2;
  const cap = (t: string) => para(run({ t, sz: 15, color: "8A857C" }), { before: 40, after: 120 });
  const grid = (cells: string[][]) => {
    const two = cells.length === 2, w = two ? HW : FW, cols = two ? [HW, GAP, HW] : [FW], list = two ? [cells[0], null, cells[1]] : cells;
    return `<w:tbl><w:tblPr><w:tblW w:w="${FW}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${NB}<w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr>`
      + `<w:tblGrid>${cols.map((c) => `<w:gridCol w:w="${c}"/>`).join("")}</w:tblGrid><w:tr>${list.map((c) => `<w:tc><w:tcPr><w:tcW w:w="${c ? w : GAP}" w:type="dxa"/><w:tcBorders>${NB}</w:tcBorders></w:tcPr>${c ? c.join("") : "<w:p/>"}</w:tc>`).join("")}</w:tr></w:tbl>`;
  };
  const dataTable = (rows: [string, string][], w: number) => {
    const c1 = Math.round(w * 0.48), c2 = w - c1, sz = w < FW ? 16 : 18;
    const mar = '<w:tcMar><w:top w:w="30" w:type="dxa"/><w:bottom w:w="30" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar>';
    return `<w:tbl><w:tblPr><w:tblW w:w="${w}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(BD).join("")}</w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="${c1}"/><w:gridCol w:w="${c2}"/></w:tblGrid>`
      + rows.map((r) => `<w:tr><w:tc><w:tcPr><w:tcW w:w="${c1}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="FBF8F2"/>${mar}</w:tcPr>${para(run({ t: r[0], sz, color: r[0].startsWith("⚠") ? "B3261E" : "4A4A4A" }))}</w:tc>`
        + `<w:tc><w:tcPr><w:tcW w:w="${c2}" w:type="dxa"/>${mar}</w:tcPr>${para(run({ t: r[1], sz, b: true }))}</w:tc></w:tr>`).join("") + "</w:tbl>";
  };
  let n = 0;
  const addImg = (data: Uint8Array, w: number, h: number) => {
    n++;
    media.push({ name: `word/media/fig${n}.png`, data });
    rels.push(`<Relationship Id="rIdFig${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/fig${n}.png"/>`);
    return para(pic(`rIdFig${n}`, n, w, h));
  };
  const p = s.parcel, px = p ? 325 : 672, ph = p ? Math.round((325 * 470) / 568) : Math.round((672 * 560) / 1080), maps: string[][] = [];
  if (s.zone) { const zb = await png(await zoneCanvas(s.zone, p, base, px * 3, ph * 3)); if (zb) maps.push([addImg(zb, px, ph), cap(`Fig. 1 — Încadrarea în zonă (rază ${fmtD(RADIUS)}; numerele = dotările din tabel)`)]); }
  if (p) { const pb = await png(await planCanvas(p, s.zone, px * 3, ph * 3)); if (pb) maps.push([addImg(pb, px, ph), cap("Fig. 2 — Plan de situație")]); }
  if (maps.length) kids.push(grid(maps));
  const T = siteTables(s);
  if (T.length) {
    kids.push(para("", { after: 60 }));
    if (T.length === 2) kids.push(grid(T.map(([t, rows]) => [para(run({ t, b: true, sz: 20 }), { after: 80 }), dataTable(rows, HW), "<w:p/>"])));
    else T.forEach(([t, rows]) => { kids.push(para(run({ t, b: true, sz: 22 }), { before: 160, after: 80 })); kids.push(dataTable(rows, FW)); });
  }
  if (s.text) {
    kids.push(para(run({ t: "Descrierea amplasamentului", b: true, sz: 24 }), { before: 280, after: 120 }));
    for (const par of s.text.trim().split(/\n\s*\n/)) kids.push(para(markRuns(par.trim().replace(/\n/g, " ")).map((r) => run({ t: r.t, b: r.b, hl: r.m })).join(""), { after: 140, jc: "both" }));
  }
  kids.push(para(run({ t: sources(s), sz: 14, color: "8A857C" }), { before: 240 }));

  const sect = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="900" w:right="900" w:bottom="900" w:left="900" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${kids.join("")}${sect}</w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Verdana" w:hAnsi="Verdana" w:cs="Verdana" w:eastAsia="Verdana"/><w:sz w:val="20"/><w:lang w:val="ro-RO"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
  const enc = (t: string) => new TextEncoder().encode(t);
  const zip = makeZip([
    { name: "[Content_Types].xml", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`) },
    { name: "_rels/.rels", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`) },
    { name: "word/_rels/document.xml.rels", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${rels.join("")}</Relationships>`) },
    { name: "word/document.xml", data: enc(doc) },
    { name: "word/styles.xml", data: enc(styles) },
    ...media,
  ]);
  return new Blob([zip], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

/** The two figures as PNG, for the photo annex (the sizes of UVALO's PNG exports). */
export async function figurePngs(s: Site, base: Base) {
  const out: { name: string; blob: Blob }[] = [];
  const toBlob = (cv: HTMLCanvasElement) => new Promise<Blob | null>((res) => { try { cv.toBlob((b) => res(b), "image/png"); } catch { res(null); } });
  if (s.zone) { const b = await toBlob(await zoneCanvas(s.zone, s.parcel, base, 1800, 1200)); if (b) out.push({ name: "fig1", blob: b }); }
  if (s.parcel) { const b = await toBlob(await planCanvas(s.parcel, s.zone, 1800, 1100)); if (b) out.push({ name: "fig2", blob: b }); }
  return out;
}
