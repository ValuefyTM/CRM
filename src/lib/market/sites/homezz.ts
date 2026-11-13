import { between, htmlToText, ldJson, num, s, walk, withParam } from "../util";
import type { Card, Detail, Site } from "./types";

const LABELS = ["Suprafața utilă", "Suprafață totală", "Suprafața construită", "Suprafață teren", "Suprafața terenului", "An finalizare construcție",
  "Numărul de locuri de parcare", "Comision cumpărător", "Tip imobil", "Stadiu construcție", "Tip tranzacție", "Tip vânzător", "Număr camere", "Etaj", "Compartimentare"];

export const homezz: Site = {
  name: "homezz.ro",
  listFormats: ["markdown"],
  detailFormats: ["markdown", "raw"],
  pageUrl: (url, n) => (n <= 1 ? url : withParam(url, "page", String(n))),

  parseList(item) {
    const md = item.markdown ?? "";
    const out: Card[] = [];
    for (const m of md.matchAll(/\[([^[\]]+?) ([\d,.]+) € \| (?:[^|\]]*\| )?(\d[\d,.]*) m² ([^\]]+)\]\((https:\/\/homezz\.ro\/[^)]+-(\d+)\.html)\)/g)) {
      const parts = m[4].split(",").map((x) => x.trim());
      out.push({ extId: m[6], url: m[5], title: m[1].trim(), price: num(m[2]), currency: "EUR", usable_area: num(m[3]),
        city: parts[0] ?? null, county: parts.length > 1 ? parts[parts.length - 1] : null });
    }
    return out;
  },

  parseDetail(item, card) {
    const raw = item.raw ?? "", md = item.markdown ?? "";
    const r: Detail = { features: {} };
    for (const b of ldJson(raw)) for (const d of walk(b)) if (d["@type"] === "RealEstateListing") {
      r.title = s(d.name); r.description = htmlToText(s(d.description)); r.src_created_at = s(d.datePosted);
    }
    if (!r.description) {
      const m = /```\n([\s\S]*?)```/.exec(md);
      if (!m) return { expired: true };
      r.description = m[1].trim();
    }
    for (const line of between(md, "## Specificații", ["```", "## "]).split("\n").map((l) => l.trim()).filter(Boolean)) {
      const lab = LABELS.find((l) => line.startsWith(`${l} `));
      if (lab) r.features![lab] = line.slice(lab.length).trim();
    }
    for (const [k, v] of Object.entries(r.features!)) {
      const kn = k.toLowerCase();
      if (kn.includes("utilă")) r.usable_area = num(v);
      else if (kn.includes("totală") || kn.includes("construit")) r.built_area = num(v);
      else if (kn.includes("teren")) r.land_area = num(v);
    }
    const a = /id="lat"[^>]*>\s*(-?[\d.]+)/.exec(raw), b = /id="(?:lng|lon|long)"[^>]*>\s*(-?[\d.]+)/.exec(raw);
    const m2 = /## Locație\n+(-?\d+\.\d+)\n+(-?\d+\.\d+)/.exec(md);
    if (a && b) { r.lat = Number(a[1]); r.lng = Number(b[1]); } else if (m2) { r.lat = Number(m2[1]); r.lng = Number(m2[2]); }
    if (r.lat) r.geo_precision = "punct pe hartă (precizie nedeclarată)";
    const p = /^([\d.,]+) €$/m.exec(md);
    if (p) { r.price = num(p[1]); r.currency = "EUR"; }
    const seen = new Set<string>();
    for (const m of raw.matchAll(new RegExp(`https://homezz\\.ro/media/[\\d-]+/${card.extId}/[^"'\\s\\\\)]+?\\.(?:jpe?g|png|webp)`, "g")))
      if (!m[0].includes("_thumb")) seen.add(m[0]);
    r.photos = [...seen];
    return r;
  },
};
