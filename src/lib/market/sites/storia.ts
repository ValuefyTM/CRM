import { htmlToText, nextData, num, obj, arr, s, withParam } from "../util";
import type { Card, Detail, Site } from "./types";

function loc(locs: unknown) {
  const by: Record<string, string> = {};
  for (const l of arr(locs)) { const o = obj(l); if (s(o.locationLevel)) by[s(o.locationLevel)!] = s(o.name) ?? ""; }
  return { county: by.county ?? null, city: by.city ?? by.town ?? by.commune ?? by.village ?? null, zone: by.district ?? by.subdistrict ?? null };
}

export const storia: Site = {
  name: "storia.ro",
  listFormats: ["raw"],
  detailFormats: ["markdown", "raw"],
  pageUrl: (url, n) => { const u = withParam(url, "limit", new URL(url).searchParams.get("limit") ?? "72"); return n <= 1 ? u : withParam(u, "page", String(n)); },

  parseList(item) {
    const j = nextData(item.raw ?? "");
    const items = arr(obj(obj(obj(obj(obj(j).props).pageProps).data).searchAds).items);
    const out: Card[] = [];
    for (const x of items) {
      const a = obj(x);
      if (!s(a.slug) || a.id == null) continue;
      const tp = obj(a.totalPrice ?? a.rentPrice);
      out.push({
        extId: String(a.id), url: `https://www.storia.ro/ro/oferta/${a.slug}`, title: s(a.title), price: num(tp.value), currency: s(tp.currency),
        usable_area: num(a.areaInSquareMeters), land_area: num(a.terrainAreaInSquareMeters),
        ...loc(obj(obj(a.location).reverseGeocoding).locations),
        seller_kind: a.isPrivateOwner ? "proprietar" : "agentie", seller_name: s(obj(a.agency).name),
        photos: arr(a.images).map((i) => s(obj(i).large)).filter((u): u is string => !!u),
        src_created_at: s(a.createdAtFirst) ?? s(a.dateCreated),
      });
    }
    return out;
  },

  parseDetail(item) {
    const ad = obj(obj(obj(nextData(item.raw ?? "")).props).pageProps).ad;
    if (!ad) return { expired: true };
    const a = obj(ad);
    const r: Detail = { title: s(a.title), description: htmlToText(s(a.description)), src_created_at: s(a.createdAt), src_updated_at: s(a.modifiedAt) };
    const l = obj(a.location), co = obj(l.coordinates);
    if (co.latitude != null) {
      r.lat = num(co.latitude); r.lng = num(co.longitude);
      const rad = num(obj(l.mapDetails).radius);
      r.geo_precision = rad ? `aproximativă (rază ${rad} m)` : "exactă";
    }
    const ad2 = obj(l.address), st = ad2.street && typeof ad2.street === "object" ? s(obj(ad2.street).name) : s(ad2.street);
    Object.assign(r, loc(obj(l.reverseGeocoding).locations));
    r.address = [st, r.city].filter(Boolean).join(", ") || null;
    const f: Record<string, unknown> = {};
    for (const c of arr(a.characteristics)) {
      const o = obj(c);
      f[s(o.key) ?? "?"] = o.localizedValue ?? o.value;
      if (o.key === "price") { r.price = num(o.value); r.currency = s(o.currency); }
    }
    const t = obj(a.target);
    for (const k of ["Area", "Terrain_area", "Use_types", "Media_types", "Access_types", "Construction_status", "Building_type", "OfferType", "ProperType"])
      if (t[k] != null && t[k] !== "" && !(Array.isArray(t[k]) && !(t[k] as unknown[]).length)) f[k] = t[k];
    r.usable_area = num(t.Area); r.land_area = num(t.Terrain_area);
    r.transaction = t.OfferType === "inchiriere" ? "inchiriere" : t.OfferType === "vanzare" ? "vanzare" : null;
    r.features = f;
    r.photos = arr(a.images).map((i) => s(obj(i).large)).filter((u): u is string => !!u);
    const own = obj(a.agency ?? a.owner);
    r.seller_kind = own.type === "agency" ? "agentie" : "proprietar";
    r.seller_name = own.type === "agency" ? s(own.name) : null;
    return r;
  },
};
