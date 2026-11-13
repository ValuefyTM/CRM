import { between, cleanMd, ldJson, mdImages, num, obj, arr, s, uniq, walk, withParam } from "../util";
import type { Card, Detail, Site } from "./types";

const idOf = (url: string) => /\/([0-9a-z]{16,})\.html/.exec(url)?.[1] ?? null;

export const publi24: Site = {
  name: "publi24.ro",
  listFormats: ["markdown", "raw"],
  detailFormats: ["markdown", "raw"],
  pageUrl: (url, n) => (n <= 1 ? url : withParam(url, "pag", String(n))),

  parseList(item) {
    const raw = item.raw ?? "", md = item.markdown ?? "";
    // the area is only on the card: "3 EUR/m2 | 1,150 m2" or "6,000 m2"
    const areas = new Map<string, number | null>();
    const lines = md.split("\n").map((l) => l.trim()).filter(Boolean);
    lines.forEach((l, i) => {
      const m = /^## \[.+\]\((https:\/\/www\.publi24\.ro\/[^)]+)\)$/.exec(l);
      if (!m) return;
      for (const x of lines.slice(i + 1, i + 8)) {
        if (x.startsWith("## [")) break;
        const a = /(?:^|\| )([\d.,]+) m2$/.exec(x);
        if (a) { areas.set(m[1], num(a[1])); break; }
      }
    });
    const out: Card[] = [];
    for (const blk of ldJson(raw)) for (const d of walk(blk)) {
      if (d["@type"] !== "ItemList") continue;
      for (const x of arr(d.itemListElement)) {
        const it = obj(x), u = s(it.url) ?? "";
        const url = u.startsWith("http") ? u : `https://www.publi24.ro/${u.replace(/^\//, "")}`;
        const id = idOf(url);
        if (!id) continue;
        const off = obj(it.offers), addr = obj(obj(off.availableAtOrFrom).address);
        out.push({
          extId: id, url, title: s(it.name), price: num(off.price), currency: s(off.priceCurrency), usable_area: areas.get(url) ?? null,
          city: s(addr.addressLocality), county: s(addr.addressRegion), description: s(obj(off.itemOffered).description) ?? s(it.description),
          photos: arr(it.image).map((i) => s(obj(i).contentUrl)).filter((v): v is string => !!v),
        });
      }
    }
    return out;
  },

  parseDetail(item) {
    const raw = item.raw ?? "", md = item.markdown ?? "";
    if (!md.includes("##### Descriere")) return { expired: true };
    const f: Record<string, string> = {};
    for (const m of between(md, "##### Specificații", ["##### Descriere"]).matchAll(/\*\*([^*]+)\*\*\s*\n\s*([^\n]+)/g)) f[m[1].trim()] = m[2].trim();
    const r: Detail = { features: f, description: cleanMd(between(md, "##### Descriere", ["**ID anunț**", "\n## "])) };
    for (const [k, v] of Object.entries(f)) {
      const kn = k.toLowerCase();
      if (kn.includes("suprafata utila")) r.usable_area = num(v);
      else if (kn.includes("suprafata construita")) r.built_area = num(v);
      else if (kn.includes("teren") && kn.includes("suprafata")) r.land_area = num(v);
    }
    const a = /var lat *= *(-?[\d.]+)/.exec(raw), b = /var lng *= *(-?[\d.]+)/.exec(raw);
    if (a && b && Number(a[1]) !== 0) { r.lat = Number(a[1]); r.lng = Number(b[1]); r.geo_precision = "punct pe hartă (precizie nedeclarată)"; }
    const t = /^# (.+)$/m.exec(md);
    if (t) r.title = t[1].trim();
    const p = /^([\d .]+) (EUR|RON|LEI)\b/m.exec(md);
    if (p) { r.price = num(p[1]); r.currency = p[2] === "EUR" ? "EUR" : "RON"; }
    const head = md.split("##### Descriere")[0];
    const loc = [...head.matchAll(/\[([^\]]+)\]\(https:\/\/www\.publi24\.ro\/anunturi\/[^)]+ "Anunțuri/g)].map((m) => m[1]);
    if (loc.length) { r.county = loc[0]; r.city = loc.length > 1 ? loc[loc.length - 1] : null; }
    // the gallery is in the source at the "extralarge" size; "large"/"top" are also thumbnails of other listings
    const xl = uniq([...raw.matchAll(/https:\/\/s3\.publi24\.ro\/[^"'\s\\)]+\/extralarge\/[^"'\s\\)]+/g)].map((m) => m[0]));
    const imgs = mdImages(head, /s3\.publi24\.ro/).filter((u) => !u.includes("/avatars/"));
    r.photos = xl.length ? xl : imgs.filter((u) => !u.includes("/top/")).length ? imgs.filter((u) => !u.includes("/top/")) : imgs;
    return r;
  },
};
