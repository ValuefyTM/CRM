import { htmlToText, num, obj, arr, olxState, s, walk, withParam } from "../util";
import type { Card, Detail, Site } from "./types";

/** OLX also shows Storia's listings in its results: those come from the Storia search, not twice. */
const INCLUDE_CROSSPOSTS = false;

function fromAd(a: Record<string, unknown>): Card {
  const params = new Map(arr(a.params).map((p) => [s(obj(p).key), obj(p)]));
  const pv = (k: string) => num(params.get(k)?.normalizedValue ?? params.get(k)?.value);
  const pr = obj(a.price), dv = s(pr.displayValue) ?? "";
  // the listing page can convert to lei; displayValue keeps the currency the seller chose
  const price = dv && num(dv) != null
    ? { value: num(dv), currency: dv.includes("€") ? "EUR" : /lei/i.test(dv) ? "RON" : s(obj(pr.regularPrice).currencyCode) }
    : { value: num(obj(pr.regularPrice).value), currency: s(obj(pr.regularPrice).currencyCode) };
  const mp = obj(a.map), l = obj(a.location);
  const r: Card = {
    extId: String(a.id), url: (s(a.url) ?? "").split(/[?#]/)[0], title: s(a.title), price: price.value, currency: price.currency,
    usable_area: pv("usablearea") ?? pv("m"), built_area: pv("builtarea"), land_area: pv("landarea"),
    county: s(l.regionName), city: s(l.cityName), zone: s(l.districtName), description: htmlToText(s(a.description)),
    seller_kind: a.isBusiness ? "agentie" : "proprietar", seller_name: a.isBusiness ? s(obj(a.user).company_name) || null : null,
    photos: arr(a.photos).map((p) => (s(p) ?? "").split(";")[0]).filter(Boolean), src_created_at: s(a.createdTime),
    features: Object.fromEntries([...params.values()].map((p) => [s(p.name) ?? s(p.key) ?? "?", p.value])),
  };
  if (mp.lat != null) {
    r.lat = num(mp.lat); r.lng = num(mp.lon);
    r.geo_precision = mp.show_detailed ? "exactă" : `aproximativă (rază ${mp.radius} km)`;
  }
  return r;
}

export const olx: Site = {
  name: "olx.ro",
  listFormats: ["raw"],
  detailFormats: ["markdown", "raw"],
  pageUrl: (url, n) => (n <= 1 ? url : withParam(url, "page", String(n))),

  parseList(item) {
    const ads = arr(obj(obj(obj(olxState(item.raw ?? "")).listing).listing).ads);
    return ads.map(obj).filter((a) => a.id != null && s(a.url) && (INCLUDE_CROSSPOSTS || !(s(a.externalUrl) || s(obj(a.partner).code)))).map(fromAd);
  },

  parseDetail(item) {
    const st = olxState(item.raw ?? "");
    if (!st) return { expired: true };
    let ad: Record<string, unknown> | null = null;
    for (const d of walk(obj(st).ad ?? st)) if (d.id != null && "photos" in d && "params" in d) { ad = d; break; }
    if (!ad) return { expired: true };
    const { extId: _e, url: _u, ...r } = fromAd(ad);
    if (s(ad.lastRefreshTime)) r.features = { ...r.features, reactualizat: ad.lastRefreshTime };
    return r;
  },
};
