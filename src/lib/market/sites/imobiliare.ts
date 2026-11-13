import { between, cleanMd, ldJson, num, obj, arr, s, uniq, unescapeHtml, walk, withParam } from "../util";
import type { Card, Detail, Site } from "./types";

export const imobiliare: Site = {
  name: "imobiliare.ro",
  listFormats: ["markdown", "raw"],
  detailFormats: ["markdown", "raw"],
  pageUrl: (url, n) => (n <= 1 ? url : withParam(url, "page", String(n))),

  parseList(item) {
    const raw = item.raw ?? "";
    const out: Card[] = [];
    for (const blk of ldJson(raw)) for (const d of walk(blk)) {
      if (d["@type"] !== "ItemList") continue;
      for (const el of arr(d.itemListElement)) {
        const it = obj(obj(el).item);
        const id = /item-(\d+)/.exec(s(it["@id"]) ?? "")?.[1];
        if (!id) continue;
        const href = new RegExp(`href="((?:https://www\\.imobiliare\\.ro)?/oferta/[^"]*?-${id})"`).exec(raw)?.[1];
        if (!href) continue;
        const name = unescapeHtml(s(it.name) ?? "");
        const ps = obj(obj(it.offers).priceSpecification);
        const img = obj(it.image);
        out.push({
          extId: id, url: href.startsWith("/") ? `https://www.imobiliare.ro${href}` : href, title: name,
          price: num(ps.price), currency: s(ps.priceCurrency),
          usable_area: num(/([\d.,]+)\s*mp/.exec(name)?.[1]), zone: /\bîn (.+)$/.exec(name)?.[1]?.trim() ?? null,
          description: s(it.description), photos: s(img.url) ? [s(img.url)!] : [],
        });
      }
    }
    return out;
  },

  parseDetail(item) {
    const raw = item.raw ?? "", md = item.markdown ?? "";
    const r: Detail = { features: {} };
    const graph: Record<string, unknown>[] = [];
    for (const b of ldJson(raw)) { const o = obj(b); graph.push(...(Array.isArray(o["@graph"]) ? (o["@graph"] as Record<string, unknown>[]) : [o])); }
    const byId = new Map(graph.map((g) => [s(g["@id"]), g]));
    let crumbs: string[] = [];
    for (const g of graph) {
      const t = g["@type"], id = s(g["@id"]) ?? "";
      if (t === "Product") {
        r.title = unescapeHtml(s(g.name) ?? ""); r.description = s(g.description);
        // the gallery at full resolution, as the page has it (each size has its own signed path: they cannot be derived
        // from one another); the 1200×630 previews of the structured data only when the page has no gallery
        const gallery = uniq([...raw.matchAll(/https:\/\/i\.roamcdn\.net\/prop\/imo\/gallery-full-1200w-watermark\/[^"'\s&\\)]+/g)].map((m) => m[0]));
        r.photos = gallery.length ? gallery : arr(g.image).map((im) => s(obj(im)["@id"]) ?? s(obj(im).url) ?? s(im)).filter((u): u is string => !!u);
      } else if (t === "Accommodation") {
        r.usable_area = num(g.floorSize); r.features!.categorie_sursa = g.accommodationCategory;
      } else if (t === "Offer" && id.includes("listing-")) {
        const ps = obj(g.priceSpecification);
        r.price = num(ps.price); r.currency = s(ps.priceCurrency); r.features!.tva_inclus = ps.valueAddedTaxIncluded;
        r.transaction = (s(g.businessFunction) ?? "").includes("LeaseOut") ? "inchiriere" : "vanzare";
        const ag = byId.get(s(obj(g.offeredBy)["@id"]));
        if (ag) { r.seller_name = s(ag.name); r.seller_kind = "agentie"; }
      } else if (t === "PostalAddress" && id.includes("Address/listing-")) {
        // in a city with zones: addressLocality = the zone ("Exterior Nord"), addressRegion = the city ("Timișoara")
        const street = (s(g.streetAddress) ?? "").trim().replace(/^[-\s]+|[-\s]+$/g, "");
        const loc = unescapeHtml(s(g.addressLocality) ?? "").trim(), reg = unescapeHtml(s(g.addressRegion) ?? "").trim();
        if (reg && loc && reg !== loc && !/^jude/i.test(reg)) { r.city = reg; r.zone = loc; } else r.city = loc || reg || null;
        r.address = [street, r.zone, r.city].filter(Boolean).join(", ") || null;
      } else if (t === "RealEstateListing") {
        r.src_created_at = s(g.dateCreated); r.src_updated_at = s(g.dateModified);
        // the path of the page: … › Județul Timiș › Timișoara › Exterior Nord › <title>
        const names = arr(obj(g.breadcrumb).itemListElement).map((e) => unescapeHtml(s(obj(e).name) ?? "").trim());
        const j = names.findIndex((n) => /^Județul |^Municipiul București/.test(n));
        if (j >= 0) {
          crumbs = names.slice(j, -1);
          if (/^Județul /.test(crumbs[0])) crumbs[0] = crumbs[0].replace(/^Județul /, ""); else crumbs.unshift("București");
        }
      }
    }
    if (crumbs.length >= 2) {
      r.county = crumbs[0]; r.city = crumbs[1]; r.zone = crumbs[2] ?? (r.zone && r.zone !== r.city ? r.zone : null);
      const street = (r.address ?? "").split(",")[0];
      r.address = [street && street !== r.zone && street !== r.city ? street : null, r.zone, r.city].filter(Boolean).join(", ") || null;
    }
    const c = /(?:&quot;|")center(?:&quot;|"):\[(-?\d+\.\d+),(-?\d+\.\d+)\]/.exec(raw);
    if (c) { r.lat = Number(c[1]); r.lng = Number(c[2]); }
    r.geo_precision = md.includes("Locație exactă") ? "exactă" : md.includes("Locație aproximativă") ? "aproximativă" : null;
    // the specification table: label / value pairs
    const lines = between(md, "## Specificații proprietate", ["## Puncte de interes", "## Detalii de contact"]).split("\n")
      .map((l) => l.trim()).filter((l) => l && !l.startsWith("[") && !l.startsWith("#"));
    for (let i = 0; i + 1 < lines.length; i += 2) if (lines[i].length < 40) r.features![lines[i].replace(/:$/, "")] = lines[i + 1];
    for (const [k, v] of Object.entries(r.features!)) {
      const kn = k.toLowerCase();
      if (kn.includes("suprafață construită")) r.built_area = num(v);
      else if (kn.includes("suprafață teren")) r.land_area = num(v);
      else if (kn.includes("suprafață utilă") && !r.usable_area) r.usable_area = num(v);
    }
    if (!r.description) r.description = cleanMd(between(md, "## Descriere", ["Citește mai mult", "\n## "]));
    if (!r.title && !r.description) r.expired = true;
    return r;
  },
};
