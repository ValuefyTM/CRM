// Server-only: the market listings around the subject of a report (the „anunțuri similare” of the report and asset
// pages): same category and transaction, within a radius of the asset's point, area within a tolerance, one listing
// per duplicate group, each with a similarity score to the valued property — as the similar reports have.
import { eurSql } from "../eur";
import { parseGeo } from "../registry";
import { nearbyMarket, type MarketRow } from "./search";

export const MK_RADII = ["0.5", "1", "2", "5", "10"];
/** The default radius around the subject, km. */
export const MK_RADIUS = 0.5;
export type MarketSubject = { asset_id: string; type: string | null; category: string | null; address: string | null; city: string | null;
  usable_area: number | null; land_area: number | null; value_eur: number | null; sqm: number | null; ll: [number, number] | null };
export type SimilarListing = MarketRow & { km: number; score: number; parts: { k: string; v: number }[]; vsMedian: number | null };

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const isLand = (s: { category: string | null; type: string | null }) => /teren/i.test(`${s.category ?? ""} ${s.type ?? ""}`) && !/cas|vil|constr/i.test(s.type ?? "");

/** The report's subject: the given asset, else its main asset (else the first), with its property and value in euro. */
export async function reportSubject(db: D1Database, reportId: string, assetId?: string | null): Promise<MarketSubject | null> {
  const r = await db.prepare(`SELECT a.id AS asset_id, p.type, p.category, p.full_address AS address, p.city, p.usable_area, p.land_area, p.geo, ${eurSql()} AS value_eur
    FROM reports r JOIN assets a ON a.report_id = r.id JOIN crm_properties p ON p.id = a.property_id
    WHERE r.id = ?1 AND (?2 IS NULL OR a.id = ?2) ORDER BY a.is_main DESC, a.rowid LIMIT 1`).bind(reportId, assetId ?? null)
    .first<Omit<MarketSubject, "ll" | "sqm"> & { geo: string | null }>();
  if (!r) return null;
  const { geo, ...s } = r;
  const per = isLand(s) ? s.land_area : s.usable_area ?? s.land_area;
  return { ...s, ll: parseGeo(geo), sqm: s.value_eur && per ? Math.round((s.value_eur / per) * 100) / 100 : null };
}

/**
 * How alike a listing is to the valued property, 0–100, over what both have: distance (40), area (40, the same → 1,
 * half or double → 0), how recent the listing is (20: seen or changed in the last year). Same category is the filter.
 */
function similarity(s: MarketSubject, x: MarketRow & { km: number }, radius: number) {
  const parts: { k: string; v: number; w: number }[] = [{ k: "Distanță", v: clamp(1 - x.km / radius), w: 40 }];
  const a0 = isLand(s) ? s.land_area : s.usable_area ?? s.land_area;
  if (a0 && x.area) parts.push({ k: "Suprafață", v: clamp(1 - Math.abs(Math.log(x.area / a0)) / Math.log(2)), w: 40 });
  const when = Date.parse(x.changed_at ?? x.first_seen_at);
  if (Number.isFinite(when)) parts.push({ k: "Cât de recent", v: clamp(1 - (Date.now() - when) / (365.25 * 864e5)), w: 20 });
  const tw = parts.reduce((t, p) => t + p.w, 0);
  return { score: Math.round((parts.reduce((t, p) => t + p.v * p.w, 0) / tw) * 100), parts: parts.map((p) => ({ k: p.k, v: Math.round(p.v * 100) })) };
}

/**
 * The kinds of property compared only among themselves, within their category: a house with houses, offices with
 * offices, storage with storage. `is`: how the subject's type says it; `types`: the CRM types of the listings (given
 * by their search); `titles`: words of the title, for listings whose search gave no type; `one` / `many`: the names.
 */
const FAMILIES: { key: string; is: RegExp; types: string[]; titles: string[]; one: string; many: string }[] = [
  { key: "apartament", is: /apartament|garsonier/i, types: ["APARTAMENT"], titles: ["apartament", "garsonier", "camere"], one: "apartament", many: "apartamente" },
  { key: "casa", is: /cas[aă]|vil[aă]|duplex/i, types: ["CASA"], titles: ["casa", "casă", "vila", "vilă", "duplex"], one: "casă", many: "case" },
  { key: "birouri", is: /birou/i, types: ["SPATIU DE BIROURI"], titles: ["birou", "office"], one: "spațiu de birouri", many: "spații de birouri" },
  { key: "cazare", is: /cazare|hotel|pensiun/i, types: ["UNITATE CAZARE"], titles: ["hotel", "pensiun", "cazare", "hostel"], one: "unitate de cazare", many: "unități de cazare" },
  { key: "agrement", is: /agrement/i, types: ["SPATIU DE AGREMENT"], titles: ["agrement", "restaurant", "sala de evenimente", "sală de evenimente"], one: "spațiu de agrement", many: "spații de agrement" },
  { key: "comercial", is: /spa[tț]iu comercial|magazin|retail/i, types: ["SPATIU COMERCIAL", "BLOC APARTAMENTE CU SPATIU COMERCIAL"], titles: ["spatiu comercial", "spațiu comercial", "magazin", "showroom"], one: "spațiu comercial", many: "spații comerciale" },
  // a hall is offered for production and for storage alike: an untyped „hală” counts for both
  { key: "productie", is: /produc[tț]ie|fabric[aă]/i, types: ["SPATIU DE PRODUCTIE"], titles: ["product", "producț", "fabrica", "fabrică", "hal"], one: "spațiu de producție", many: "spații de producție" },
  { key: "depozitare", is: /depozit|logistic|hal[aă]/i, types: ["SPATIU DE DEPOZITARE"], titles: ["depozit", "logistic", "hal"], one: "spațiu de depozitare", many: "spații de depozitare" },
];
const family = (s: { category: string | null; type: string | null }) => (isLand(s) ? null : FAMILIES.find((f) => f.is.test(s.type ?? "")) ?? null);
/** A building on its own land (a house, a commercial or industrial property — not an apartment, a parking place, a part
 * of a building, bare land): free land nearby is suggested too, for the value of the land. */
const onOwnLand = (s: { category: string | null; type: string | null }) => !isLand(s) && family(s)?.key !== "apartament" && !/parcare|box[aă]|accesoriu|curte|parte dintr-o cl[aă]dire/i.test(s.type ?? "");
/** How the subject's kind is named: „x proprietăți de tip …” and the tab of the window. */
const kindNames = (s: { category: string | null; type: string | null }): { one: string; many: string } => {
  const f = family(s);
  if (f) return { one: f.one, many: f.many };
  if (isLand(s)) return { one: "teren", many: "terenuri" };
  const c = (s.category ?? "").toUpperCase();
  const one = c === "COMERCIAL" ? "comercial" : c === "INDUSTRIAL" ? "industrial" : c.includes("AGRICOL") ? "agricol" : c === "MIXT" ? "mixt" : (s.category ?? "similar").toLowerCase();
  return { one, many: `proprietăți de tip ${one}` };
};

export type MarketGroup = { rows: SimilarListing[]; median: number | null; n: number };
const EMPTY: MarketGroup = { rows: [], median: null, n: 0 };

/**
 * The listings around the subject, in up to two groups: `prop` — the same kind as the subject (houses for a house,
 * apartments for an apartment, the category otherwise) — and, for sales around a building on its own land, `teren` —
 * free land, compared by the subject's land area. Rentals have no land group.
 */
export async function marketForReport(db: D1Database, reportId: string, o: { assetId?: string | null; radius?: string | null; tr?: string | null; tol?: string | null; all?: boolean }) {
  const radius = MK_RADII.includes(o.radius ?? "") ? Number(o.radius) : MK_RADIUS;
  const tr = o.tr === "inchiriere" ? "inchiriere" : "vanzare";
  const tol = ["25", "50", "0"].includes(o.tol ?? "") ? Number(o.tol) : 50;
  const subject = await reportSubject(db, reportId, o.assetId);
  const names = subject ? kindNames(subject) : { one: "", many: "" };
  const base = { radius, tr, tol, subject, kind: names.one, kinds: names.many };
  if (!subject?.ll) return { ...base, ...EMPTY, groups: { prop: EMPTY } as { prop: MarketGroup; teren?: MarketGroup } };
  const group = async (land: boolean): Promise<MarketGroup> => {
    // free land is compared by the land of the subject; the property itself by its usable area
    const s: MarketSubject = land ? { ...subject, category: "TEREN", type: null, usable_area: null } : subject;
    const area = land || isLand(subject) ? subject.land_area : subject.usable_area ?? subject.land_area;
    const near = await nearbyMarket(db, subject.ll!, { category: land ? "TEREN" : subject.category, family: land ? null : family(subject), transaction: tr, area, tol, radiusKm: radius, limit: 200, status: o.all ? "all" : "activ" });
    const act = near.rows.filter((x) => x.status === "activ").map((x) => x.price_sqm).filter((v): v is number => v != null && v > 0).sort((p, q) => p - q);
    const median = act.length ? (act.length % 2 ? act[(act.length - 1) / 2] : (act[act.length / 2 - 1] + act[act.length / 2]) / 2) : null;
    const rows: SimilarListing[] = near.rows.map((x) => {
      const k = x.km ?? 0;
      return { ...x, km: k, ...similarity(s, { ...x, km: k }, radius), vsMedian: median && x.price_sqm ? (x.price_sqm - median) / median : null };
    }).sort((p, q) => q.score - p.score);
    return { rows, median, n: act.length };
  };
  const withLand = tr === "vanzare" && onOwnLand(subject);
  const [prop, teren] = await Promise.all([group(false), withLand ? group(true) : Promise.resolve(null)]);
  return { ...base, ...prop, groups: { prop, ...(teren ? { teren } : {}) } as { prop: MarketGroup; teren?: MarketGroup } };
}

/** For the button: how many listings around the subject (default radius and filters), of its kind and — where suggested — free land. */
export async function marketCount(db: D1Database, reportId: string, assetId?: string | null) {
  const r = await marketForReport(db, reportId, { assetId }).catch(() => null);
  return r?.subject?.ll ? { n: r.rows.length, land: r.groups.teren ? r.groups.teren.rows.length : null, kind: r.kind, radius: r.radius } : null;
}
