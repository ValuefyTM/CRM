// Stereo 70 (EPSG:31700) → WGS84, the same formulas as scripts/stereo70.mjs and the locator page. E = Stereo Y (east),
// N = Stereo X (north). Used on the server to place a plan / CF read with AI before the valuer opens a tool.
const D = Math.PI / 180, a = 6378245, f = 1 / 298.3, e2 = 2 * f - f * f, e = Math.sqrt(e2);
const lat0 = 46 * D, lon0 = 25 * D, k0 = 0.99975, FE = 500000, FN = 500000;
const s0 = Math.sin(lat0), c0 = Math.cos(lat0);
const rho0 = (a * (1 - e2)) / Math.pow(1 - e2 * s0 * s0, 1.5), nu0 = a / Math.sqrt(1 - e2 * s0 * s0), R = Math.sqrt(rho0 * nu0);
const n = Math.sqrt(1 + (e2 * Math.pow(c0, 4)) / (1 - e2));
const S1 = (1 + s0) / (1 - s0), S2 = (1 - e * s0) / (1 + e * s0), w1 = Math.pow(S1 * Math.pow(S2, e), n);
const sx0 = (w1 - 1) / (w1 + 1), c = ((n + s0) * (1 - sx0)) / ((n - s0) * (1 + sx0)), w2 = c * w1, chi0 = Math.asin((w2 - 1) / (w2 + 1));
const g = 2 * R * k0 * Math.tan(Math.PI / 4 - chi0 / 2), h = 4 * R * k0 * Math.tan(chi0) + g;
const T = [2.329, -147.042, -92.08], rs = [-0.309, 0.325, 0.497].map((x) => (x / 3600) * D), sc = 1 + 5.69e-6;
const A = 6378137, F = 1 / 298.257223563, E2 = 2 * F - F * F, B = A * (1 - F), EP2 = (A * A - B * B) / (B * B);

export function stereo70ToWgs84(E: number, N: number): [number, number] {
  const dE = E - FE, dN = N - FN;
  const i = Math.atan(dE / (h + dN)), j = Math.atan(dE / (g - dN)) - i;
  const chi = chi0 + 2 * Math.atan((dN - dE * Math.tan(j / 2)) / (2 * R * k0));
  const Lam = j + 2 * i + lon0, lon = (Lam - lon0) / n + lon0;
  const sc_ = Math.sin(chi), psi = (0.5 * Math.log((1 + sc_) / (c * (1 - sc_)))) / n;
  let phi = 2 * Math.atan(Math.exp(psi)) - Math.PI / 2;
  for (let k = 0; k < 10; k++) {
    const sp = Math.sin(phi);
    const psii = Math.log(Math.tan(phi / 2 + Math.PI / 4) * Math.pow((1 - e * sp) / (1 + e * sp), e / 2));
    const nx = phi - ((psii - psi) * Math.cos(phi) * (1 - e2 * sp * sp)) / (1 - e2);
    if (Math.abs(nx - phi) < 1e-14) { phi = nx; break; }
    phi = nx;
  }
  const sp = Math.sin(phi), cp = Math.cos(phi), Nn = a / Math.sqrt(1 - e2 * sp * sp);
  const X = Nn * cp * Math.cos(lon), Y = Nn * cp * Math.sin(lon), Z = Nn * (1 - e2) * sp;
  const [rx, ry, rz] = rs;
  const X2 = T[0] + sc * (X - rz * Y + ry * Z), Y2 = T[1] + sc * (rz * X + Y - rx * Z), Z2 = T[2] + sc * (-ry * X + rx * Y + Z);
  const p = Math.hypot(X2, Y2), th = Math.atan2(Z2 * A, p * B);
  const lat = Math.atan2(Z2 + EP2 * B * Math.pow(Math.sin(th), 3), p - E2 * A * Math.pow(Math.cos(th), 3));
  return [lat / D, Math.atan2(Y2, X2) / D];
}

/** WGS84 → Stereo 70 [E, N] (metres), by Newton iterations over the forward formulas (the map is nearly affine, so a few steps give millimetres). */
export function wgs84ToStereo70(lat: number, lng: number): [number, number] {
  let E = 500000, N = 500000;
  for (let k = 0; k < 15; k++) {
    const [la, lo] = stereo70ToWgs84(E, N);
    const dla = lat - la, dlo = lng - lo;
    if (Math.abs(dla) < 1e-11 && Math.abs(dlo) < 1e-11) break;
    const [la1, lo1] = stereo70ToWgs84(E + 1, N), [la2, lo2] = stereo70ToWgs84(E, N + 1);
    const a = la1 - la, b = la2 - la, c = lo1 - lo, d = lo2 - lo, det = a * d - b * c;
    if (!det) break;
    E += (dla * d - b * dlo) / det;
    N += (a * dlo - c * dla) / det;
  }
  return [E, N];
}

/** Delta-encoded ring of the locator data (millimetres) → Stereo 70 metres [E, N]. */
export function decodeRing(z: number[]) {
  const r: number[][] = [];
  let x = 0, y = 0;
  for (let i = 0; i < z.length; i += 2) { x += z[i]; y += z[i + 1]; r.push([x / 1000, y / 1000]); }
  return r;
}

/** Centre of a polygon (area centroid in the plane; the mean of its corners for degenerate rings). */
export function centroid(ring: number[][]): [number, number] {
  let s = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const fct = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    s += fct; cx += (ring[j][0] + ring[i][0]) * fct; cy += (ring[j][1] + ring[i][1]) * fct;
  }
  if (Math.abs(s) < 1e-9) {
    const m = ring.reduce((t, q) => [t[0] + q[0], t[1] + q[1]], [0, 0]);
    return [m[0] / ring.length, m[1] / ring.length];
  }
  return [cx / (3 * s), cy / (3 * s)];
}

export const ringArea = (r: number[][]) => {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return Math.abs(s / 2);
};

/** County seats, a network-free reference for the X/Y order of a document (same table as amplasament.html). */
export const COUNTY_CENTRES: Record<string, [number, number]> = {
  alba: [46.07, 23.58], arad: [46.18, 21.32], arges: [44.86, 24.87], bacau: [46.57, 26.91], bihor: [47.05, 21.93], "bistrita nasaud": [47.13, 24.49],
  botosani: [47.75, 26.67], brasov: [45.65, 25.6], braila: [45.27, 27.96], bucuresti: [44.43, 26.1], buzau: [45.15, 26.82], "caras severin": [45.3, 21.89],
  calarasi: [44.2, 27.33], cluj: [46.77, 23.6], constanta: [44.18, 28.63], covasna: [45.86, 25.79], dambovita: [44.93, 25.46], dolj: [44.32, 23.8],
  galati: [45.44, 28.05], giurgiu: [43.9, 25.97], gorj: [45.04, 23.27], harghita: [46.36, 25.8], hunedoara: [45.75, 22.9], ialomita: [44.56, 27.37],
  iasi: [47.16, 27.59], ilfov: [44.5, 26.1], maramures: [47.66, 23.58], mehedinti: [44.63, 22.66], mures: [46.54, 24.56], neamt: [46.93, 26.37],
  olt: [44.43, 24.36], prahova: [44.94, 26.02], "satu mare": [47.79, 22.88], salaj: [47.18, 23.06], sibiu: [45.79, 24.15], suceava: [47.65, 26.26],
  teleorman: [43.97, 25.33], timis: [45.75, 21.23], tulcea: [45.18, 28.8], vaslui: [46.64, 27.73], valcea: [45.1, 24.37], vrancea: [45.7, 27.18],
};

export const normName = (t: unknown) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/^(municipiul|orasul|oras|comuna|com\.|mun\.|judetul|jud\.)\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();

type Pt = { x: unknown; y: unknown };
const inRo = (ll: [number, number]) => ll[0] > 43.5 && ll[0] < 48.4 && ll[1] > 20.1 && ll[1] < 30;

/** Read points → ring [E, N]; swap = the document's x is the east value (CF extracts print Y first). */
export function ringOf(pts: Pt[] | undefined, swap: boolean) {
  const s = (pts ?? []).map((p) => (swap ? [+(p.x as number), +(p.y as number)] : [+(p.y as number), +(p.x as number)]))
    .filter((q) => Number.isFinite(q[0]) && Number.isFinite(q[1]) && q[0] > 0 && q[1] > 0);
  if (s.length > 2 && s[0][0] === s[s.length - 1][0] && s[0][1] === s[s.length - 1][1]) s.pop();
  return s.length > 2 ? s : null;
}

/**
 * The X/Y order of the read coordinates: the variant inside Romania; if both are, the one nearer the hint (UAT or county
 * centre) when the difference is clear, otherwise the CF convention (Y first) for land book extracts. Same rules as
 * orientPts() in amplasament.html.
 */
export function orient(pts: Pt[] | undefined, hint: [number, number] | null, preferSwap: boolean) {
  const a = ringOf(pts, false), b = ringOf(pts, true);
  if (!a || !b) return null;
  const la = stereo70ToWgs84(...centroid(a)), lb = stereo70ToWgs84(...centroid(b));
  const ia = inRo(la), ib = inRo(lb);
  if (ia && !ib) return { ring: a, ll: la, swap: false };
  if (ib && !ia) return { ring: b, ll: lb, swap: true };
  if (!ia) return null;
  if (hint) {
    const d = (l: [number, number]) => Math.hypot(l[0] - hint[0], (l[1] - hint[1]) * 0.7), da = d(la), db = d(lb);
    if (Math.abs(da - db) > 0.15) return da < db ? { ring: a, ll: la, swap: false } : { ring: b, ll: lb, swap: true };
  }
  return preferSwap ? { ring: b, ll: lb, swap: true } : { ring: a, ll: la, swap: false };
}
