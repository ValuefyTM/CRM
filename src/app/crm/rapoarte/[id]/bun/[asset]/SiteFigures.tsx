"use client";
// The two figures of the site analysis: Fig. 1, the parcel in the zone (map tiles from OpenStreetMap or Esri imagery,
// drawn on a canvas so it can be saved as an image) and Fig. 2, the site plan (SVG: the contour with its points and
// side lengths, the buildings, the registered neighbours, the street, north and scale).
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { dist, fmt, nearest, type LL, type Parcel, type Zone } from "@/lib/site-shared";

export type FigHandle = { png: () => Promise<Blob | null> };

const Z = 15, W = 800, H = 560;
const world = (z: number) => 256 * 2 ** z;
function px([lat, lng]: LL, z = Z): [number, number] {
  const s = world(z), r = (lat * Math.PI) / 180;
  return [((lng + 180) / 360) * s, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s];
}
const TILES = {
  harta: (x: number, y: number) => `https://tile.openstreetmap.org/${Z}/${x}/${y}.png`,
  satelit: (x: number, y: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${Z}/${y}/${x}`,
};
const tile = (src: string) => new Promise<HTMLImageElement | null>((res) => {
  const i = new Image();
  i.crossOrigin = "anonymous";
  i.referrerPolicy = "strict-origin-when-cross-origin";
  i.onload = () => res(i); i.onerror = () => res(null);
  i.src = src;
});

/** Fig. 1: the zone map. */
export const ZoneMap = forwardRef<FigHandle, { zone: Zone; parcel: Parcel | null; base: "harta" | "satelit" }>(function ZoneMap({ zone, parcel, base }, ref) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "ok" | "tainted">("loading");
  useImperativeHandle(ref, () => ({
    png: () => new Promise((res) => { try { cv.current ? cv.current.toBlob((b) => res(b), "image/png") : res(null); } catch { res(null); } }),
  }));
  useEffect(() => {
    let off = false;
    (async () => {
      const c = cv.current;
      if (!c) return;
      const k = 2;
      c.width = W * k; c.height = H * k;
      const g = c.getContext("2d")!;
      g.scale(k, k);
      const centre = parcel?.centre ?? zone.at;
      const [cx, cy] = px(centre), ox = cx - W / 2, oy = cy - H / 2;
      const at = (l: LL): [number, number] => { const [x, y] = px(l); return [x - ox, y - oy]; };
      g.fillStyle = "#ece6d8"; g.fillRect(0, 0, W, H);
      const jobs: Promise<void>[] = [];
      for (let tx = Math.floor(ox / 256); tx <= Math.floor((ox + W) / 256); tx++) for (let ty = Math.floor(oy / 256); ty <= Math.floor((oy + H) / 256); ty++)
        jobs.push(tile(TILES[base](tx, ty)).then((i) => { if (i && !off) g.drawImage(i, tx * 256 - ox, ty * 256 - oy, 256, 256); }));
      await Promise.all(jobs);
      if (off) return;
      if (base === "satelit") { g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(0, 0, W, H); }
      // the circles of 500 m and 1 km
      const mpp = (156543.03392 * Math.cos((centre[0] * Math.PI) / 180)) / 2 ** Z;
      const [pcx, pcy] = at(centre);
      g.setLineDash([6, 6]); g.strokeStyle = base === "satelit" ? "#ffd38a" : "#9a5f00"; g.lineWidth = 1.6;
      for (const [m, l] of [[500, "500 m"], [1000, "1 km"]] as const) {
        g.beginPath(); g.arc(pcx, pcy, m / mpp, 0, Math.PI * 2); g.stroke();
        label(g, l, pcx + (m / mpp) * Math.cos(-0.6) + 4, pcy + (m / mpp) * Math.sin(-0.6), base);
      }
      g.setLineDash([]);
      // the parcel (or the point)
      if (parcel && parcel.ring.length > 2) {
        g.beginPath(); parcel.ring.forEach((l, i) => { const [x, y] = at(l); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath();
        g.fillStyle = "rgba(242,169,59,0.75)"; g.fill(); g.strokeStyle = "#c2362b"; g.lineWidth = 2.4; g.stroke();
      }
      g.beginPath(); g.arc(pcx, pcy, 5, 0, Math.PI * 2); g.fillStyle = "#c2362b"; g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 2; g.stroke();
      // the nearest amenity of each category, numbered as in the list
      nearest(zone).forEach((p, i) => {
        const [x, y] = at([p.lat, p.lng]);
        if (x < 0 || y < 0 || x > W || y > H) return;
        g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2); g.fillStyle = "#17173a"; g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 2; g.stroke();
        g.fillStyle = "#fff"; g.font = "800 12px Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(i + 1), x, y + 0.5);
      });
      // attribution
      g.textAlign = "right"; g.textBaseline = "alphabetic"; g.font = "10px Arial, sans-serif";
      const att = base === "satelit" ? "Imagini © Esri, Maxar · date © OpenStreetMap" : "© contribuitorii OpenStreetMap";
      const tw = g.measureText(att).width;
      g.fillStyle = "rgba(255,255,255,0.85)"; g.fillRect(W - tw - 10, H - 16, tw + 10, 16);
      g.fillStyle = "#333"; g.fillText(att, W - 5, H - 4.5);
      try { c.toDataURL("image/png").slice(0, 10); setState("ok"); } catch { setState("tainted"); }
    })();
    return () => { off = true; };
  }, [zone, parcel, base]);
  return (
    <>
      <canvas ref={cv} className="amCanvas" role="img" aria-label="Harta zonei: parcela, dotările numerotate și cercurile de 500 m și 1 km" />
      {state === "loading" && <span className="amLoading">Se încarcă harta…</span>}
    </>
  );
});
function label(g: CanvasRenderingContext2D, t: string, x: number, y: number, base: string) {
  g.font = "700 11px Arial, sans-serif"; g.textAlign = "left"; g.textBaseline = "middle";
  g.lineWidth = 3; g.strokeStyle = base === "satelit" ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.9)"; g.strokeText(t, x, y);
  g.fillStyle = base === "satelit" ? "#fff" : "#6e4400"; g.fillText(t, x, y);
}

/** Fig. 2: the site plan. */
export const SitePlan = forwardRef<FigHandle, { parcel: Parcel; zone: Zone | null }>(function SitePlan({ parcel, zone }, ref) {
  const svg = useRef<SVGSVGElement>(null);
  useImperativeHandle(ref, () => ({
    png: async () => {
      const s = svg.current;
      if (!s) return null;
      const xml = new XMLSerializer().serializeToString(s);
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml); }).catch(() => null);
      const c = document.createElement("canvas");
      c.width = 1600; c.height = 1200;
      const g = c.getContext("2d")!;
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      return new Promise((res) => c.toBlob((b) => res(b), "image/png"));
    },
  }));

  const VW = 400, VH = 300, M = 34;
  const [lat0, lng0] = parcel.centre;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110574;
  const m = (l: LL): [number, number] => [(l[1] - lng0) * kx, (l[0] - lat0) * ky];
  const ring = parcel.ring.map(m);
  const xs = ring.map((q) => q[0]), ys = ring.map((q) => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const s = Math.min((VW - 2 * M) / (x1 - x0 || 1), (VH - 2 * M - 16) / (y1 - y0 || 1));
  const cxm = (x0 + x1) / 2, cym = (y0 + y1) / 2;
  const P = (q: [number, number]): [number, number] => [VW / 2 + (q[0] - cxm) * s, (VH - 16) / 2 - (q[1] - cym) * s];
  const pts = ring.map(P);
  const pc = pts.reduce((a, q) => [a[0] + q[0] / pts.length, a[1] + q[1] / pts.length], [0, 0]);
  const poly = (r: [number, number][]) => r.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" ");
  const out = (q: [number, number], d: number): [number, number] => { const v = [q[0] - pc[0], q[1] - pc[1]], L = Math.hypot(v[0], v[1]) || 1; return [q[0] + (v[0] / L) * d, q[1] + (v[1] / L) * d]; };
  const front = new Set(parcel.geo?.frontage?.sides ?? []);
  // the labels that fit: the corners that turn most, then the longest sides, none closer than 14 px to another
  const labels: { x: number; y: number; t: string; side?: boolean }[] = [];
  const free = (x: number, y: number, d: number) => labels.every((l) => Math.hypot(l.x - x, l.y - y) > d);
  const turn = (i: number) => {
    const a = pts[(i - 1 + pts.length) % pts.length], q = pts[i], b = pts[(i + 1) % pts.length];
    const u = [q[0] - a[0], q[1] - a[1]], v = [b[0] - q[0], b[1] - q[1]];
    return Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]));
  };
  pts.map((q, i) => ({ i, t: turn(i) })).filter((x) => x.t > 0.15 || pts.length <= 12).sort((a, b) => b.t - a.t).forEach(({ i }) => {
    const [x, y] = out(pts[i], 10);
    if (free(x, y, 14)) labels.push({ x, y, t: parcel.pts[i]?.pct ?? String(i + 1) });
  });
  pts.map((q, i) => ({ i, L: Math.hypot(pts[(i + 1) % pts.length][0] - q[0], pts[(i + 1) % pts.length][1] - q[1]) })).filter((x) => x.L > 30 && parcel.pts[x.i]?.side != null)
    .sort((a, b) => b.L - a.L).forEach(({ i }) => {
      const q = pts[i], n = pts[(i + 1) % pts.length], [x, y] = out([(q[0] + n[0]) / 2, (q[1] + n[1]) / 2], 11);
      if (free(x, y, 22)) labels.push({ x, y, t: `${fmt(parcel.pts[i].side!, 2)} m`, side: true });
    });
  // the scale bar: a round length of about 70 px
  const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find((v) => v * s >= 55) ?? 500;
  const streets = (zone?.roads ?? []).filter((r) => r.d <= 40 && r.geom.length > 1).slice(0, 3).map((r) => ({ name: r.name || r.ref, line: r.geom.map((l) => P(m(l))) }));
  const id = "amClip";
  return (
    <svg ref={svg} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${VW} ${VH}`} className="amSvg" role="img" fontFamily="Arial, Helvetica, sans-serif"
      aria-label={`Plan de situație: conturul parcelei cu punctele 1–${pts.length}, lungimile laturilor, construcțiile și vecinii`}>
      <defs><clipPath id={id}><rect x="0" y="0" width={VW} height={VH - 16} /></clipPath></defs>
      <rect x="0" y="0" width={VW} height={VH} fill="#fff" />
      <g clipPath={`url(#${id})`}>
        {streets.map((st, i) => (
          <g key={i}>
            <polyline points={poly(st.line)} fill="none" stroke="#ece5d6" strokeWidth={Math.max(10, 7 * s)} strokeLinecap="round" strokeLinejoin="round" />
            {st.name && (() => {
              const vis = st.line.filter((q) => q[0] > 20 && q[0] < VW - 20 && q[1] > 14 && q[1] < VH - 30);
              const q = vis[Math.floor(vis.length / 2)];
              return q ? <text x={q[0]} y={q[1] + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#6b6b6b">{st.name}</text> : null;
            })()}
          </g>
        ))}
        {parcel.neighbours.map((n, i) => {
          const r = n.ring.map((l) => P(m(l)));
          const c = r.reduce((a, q) => [a[0] + q[0] / r.length, a[1] + q[1] / r.length], [0, 0]);
          const cc: [number, number] = [Math.min(VW - 26, Math.max(26, c[0])), Math.min(VH - 30, Math.max(12, c[1]))];
          return (
            <g key={i}>
              <polygon points={poly(r)} fill="none" stroke="#7aa0c8" strokeWidth="1.2" strokeDasharray="5 4" />
              {n.nr && <text x={cc[0]} y={cc[1]} textAnchor="middle" fontSize="10" fontWeight="700" fill="#4a6f96">{n.nr}</text>}
            </g>
          );
        })}
      </g>
      <polygon points={poly(pts)} fill="#fdf1dc" stroke="#c2362b" strokeWidth="2.2" strokeLinejoin="round" />
      {pts.map((q, i) => front.has(i) && <line key={`f${i}`} x1={q[0]} y1={q[1]} x2={pts[(i + 1) % pts.length][0]} y2={pts[(i + 1) % pts.length][1]} stroke="#c2362b" strokeWidth="4.5" />)}
      {parcel.buildings.filter((b) => b.ring.length > 2).map((b, i) => {
        const r = b.ring.map((l) => P(m(l)));
        const c = r.reduce((a, q) => [a[0] + q[0] / r.length, a[1] + q[1] / r.length], [0, 0]);
        return (
          <g key={i}>
            <polygon points={poly(r)} fill="#fff" stroke="#141414" strokeWidth="1.4" />
            <text x={c[0]} y={c[1] + 4} textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#141414">{b.name}{b.area ? ` · ${fmt(b.area)} mp` : ""}</text>
          </g>
        );
      })}
      {pts.map((q, i) => <circle key={`c${i}`} cx={q[0]} cy={q[1]} r="2.2" fill="#c2362b" />)}
      {labels.map((l, i) => <text key={`l${i}`} x={l.x} y={l.y + (l.side ? 3 : 4)} textAnchor="middle" fontSize={l.side ? 9.5 : 10.5} fontWeight={l.side ? 700 : 800} fill={l.side ? "#9a5f00" : "#141414"}>{l.t}</text>)}
      <g transform={`translate(${VW - 22} 34)`}><path d="M0 -20 L7 2 L0 -4 L-7 2 Z" fill="#141414" /><text x="0" y="16" textAnchor="middle" fontSize="11" fontWeight="800">N</text></g>
      <rect x="0" y={VH - 16} width={VW} height="16" fill="#fff" />
      <g transform={`translate(${VW - 18 - nice * s} ${VH - 6})`}>
        <rect x="0" y="-5" width={nice * s} height="4" fill="#141414" /><text x={nice * s / 2} y="-8" textAnchor="middle" fontSize="9">{nice} m</text>
      </g>
      <text x="8" y={VH - 5} fontSize="9" fill="#6b6b6b">{parcel.nr ? `Nr. cad. ${parcel.nr} · ` : ""}{fmt(parcel.area_plan ?? parcel.area_calc)} mp{parcel.geo?.frontage ? ` · front ${fmt(parcel.geo.frontage.length, 1)} m` : ""}</text>
    </svg>
  );
});

export const poiLine = (p: { label: string; name: string; d: number }) => `${p.name || p.label}${p.name ? ` (${p.label.toLowerCase()})` : ""} · ${dist(p.d)}`;
