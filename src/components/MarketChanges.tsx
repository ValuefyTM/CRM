// What changed at a market listing between two readings (market_listing_history.changes): old → new for the figures and
// the title, the rest named; with `full`, the old and new description can be opened. And the small chart of the price.
const FIELD: Record<string, string> = { price: "preț", currency: "monedă", usable_area: "suprafață utilă", built_area: "suprafață construită", land_area: "teren", title: "titlu", address: "adresă", zone: "zonă" };
const FLAG: Record<string, string> = { description: "descriere", location: "poziția pe hartă", photos: "imagini" };
const val = (v: unknown) => (v == null || v === "" ? "—" : typeof v === "number" ? v.toLocaleString("ro-RO") : String(v));

export function MarketChanges({ json, full }: { json: string | null; full?: boolean }) {
  let c: Record<string, unknown> = {};
  try { c = json ? JSON.parse(json) : {}; } catch { /* empty */ }
  const pairs = Object.entries(c).filter(([k, v]) => FIELD[k] && Array.isArray(v)) as [string, [unknown, unknown]][];
  const flags = Object.keys(c).filter((k) => FLAG[k]);
  const desc = Array.isArray(c.description) ? (c.description as [string | null, string | null]) : null;
  if (!pairs.length && !flags.length) return full ? null : <span className="muted">—</span>;
  return (
    <ul className="mkDiff">
      {pairs.map(([k, [a, b]]) => {
        const pct = k === "price" && typeof a === "number" && typeof b === "number" && a ? ((b - a) / a) * 100 : null;
        return <li key={k}><span className="muted">{FIELD[k]}:</span> <s>{val(a)}</s> → <b>{val(b)}</b>
          {pct != null && <span className={`pill ${pct < 0 ? "pillOk" : "pillErr"}`}>{pct > 0 ? "+" : ""}{pct.toFixed(1).replace(".", ",")}%</span>}</li>;
      })}
      {flags.length > 0 && <li><span className="muted">{pairs.length ? "și:" : "s-au schimbat:"}</span> {flags.map((k) => FLAG[k]).join(", ")}</li>}
      {full && desc && (
        <li><details className="mkDesc"><summary>Descrierea dinainte și cea nouă</summary>
          <div><small>Înainte</small><p>{desc[0] || "—"}</p></div>
          <div><small>După</small><p>{desc[1] || "—"}</p></div>
        </details></li>
      )}
    </ul>
  );
}

/** The asked price in time, as a step line: it stays the same until the reading that found it changed. */
export function PriceChart({ points, unit }: { points: { at: string; price: number }[]; unit: string }) {
  if (points.length < 2) return null;
  const W = 640, H = 150, L = 8, R = 8, T = 22, B = 24;
  const t0 = Date.parse(points[0].at), t1 = Math.max(Date.parse(points[points.length - 1].at), t0 + 1);
  const ps = points.map((p) => p.price), lo = Math.min(...ps), hi = Math.max(...ps);
  const pad = hi === lo ? Math.max(1, hi * 0.05) : (hi - lo) * 0.18;
  const x = (at: string) => L + ((Date.parse(at) - t0) / (t1 - t0)) * (W - L - R);
  const y = (p: number) => T + (1 - (p - (lo - pad)) / (hi - lo + 2 * pad)) * (H - T - B);
  let path = `M${x(points[0].at).toFixed(1)},${y(points[0].price).toFixed(1)}`;
  for (let i = 1; i < points.length; i++) path += ` H${x(points[i].at).toFixed(1)} V${y(points[i].price).toFixed(1)}`;
  const fmt = (v: number) => v.toLocaleString("ro-RO");
  const date = (at: string) => new Date(at).toLocaleDateString("ro-RO", { timeZone: "Europe/Bucharest", day: "2-digit", month: "2-digit", year: "numeric" });
  const first = points[0].price, last = points[points.length - 1].price, pct = first ? ((last - first) / first) * 100 : 0;
  // the dots: the first reading and every change (the last point only closes the line at "now")
  const dots = points.filter((p, i) => i === 0 || p.price !== points[i - 1].price);
  return (
    <figure className="mkChart">
      <figcaption>Evoluția prețului cerut
        <span className={`pill ${pct < 0 ? "pillOk" : pct > 0 ? "pillErr" : ""}`}>{pct === 0 ? "neschimbat" : `${pct > 0 ? "+" : ""}${pct.toFixed(1).replace(".", ",")}% de la apariție`}</span></figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Prețul cerut: de la ${fmt(first)} ${unit} la ${fmt(last)} ${unit}`}>
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="axis" />
        <path d={path} className="line" />
        {dots.map((p, i) => {
          const cx = x(p.at), cy = y(p.price), end = cx > W - 90 ? "end" : cx < 90 ? "start" : "middle";
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r={4.5} className="dot"><title>{`${date(p.at)}: ${fmt(p.price)} ${unit}`}</title></circle>
              <text x={cx} y={cy - 9} textAnchor={end} className="val">{fmt(p.price)} {unit}</text>
            </g>
          );
        })}
        <text x={L} y={H - 7} className="tick">{date(points[0].at)}</text>
        <text x={W - R} y={H - 7} textAnchor="end" className="tick">{date(points[points.length - 1].at)}</text>
      </svg>
    </figure>
  );
}
