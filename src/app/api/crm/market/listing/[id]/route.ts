import { staffApi } from "@/lib/api";
import { getMarketListing, marketFile } from "@/lib/market/search";

/** One market listing, compact (the preview window opened from a report's similar listings). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("market");
  if ("res" in a) return a.res;
  const d = await getMarketListing(a.db, (await params).id);
  if (!d) return Response.json({ error: "Anunțul nu există." }, { status: 404 });
  const l = d.listing;
  const saved = d.photos.filter((p) => p.r2_key);
  // year built, floor, rooms: from the site's own fields, when it gives them
  const f = Object.entries(d.features);
  const pick = (re: RegExp) => { const e = f.find(([k]) => re.test(k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase())); return e ? String(Array.isArray(e[1]) ? e[1].join(", ") : e[1]) : null; };
  const year = pick(/an(ul)? (constructie|finalizare)|year|building_year/)?.match(/\d{4}/)?.[0] ?? null;
  const floor = pick(/^etaj|floor/);
  const rooms = pick(/camere|rooms/);
  return Response.json({
    id: l.id, source: l.source, ext_id: l.ext_id, url: l.url, title: l.title, transaction: l.transaction, category: l.category, status: l.status,
    price: l.price, currency: l.currency, price_sqm: l.price_sqm, usable_area: l.usable_area, built_area: l.built_area, land_area: l.land_area,
    county: l.county, city: l.city, zone: l.zone, address: l.address, lat: l.lat, lng: l.lng, geo_precision: l.geo_precision,
    seller_kind: l.seller_kind, seller_name: l.seller_name, description: l.description, src_created_at: l.src_created_at, first_seen_at: l.first_seen_at,
    last_seen_at: l.last_seen_at, fetched_at: l.fetched_at, source_file: marketFile(l.source_key as string | null), year, floor, rooms, dup_reason: l.dup_reason, duplicates: d.duplicates.map((x) => ({ id: x.id, source: x.source, url: x.url, price: x.price, currency: x.currency })),
    photos: saved.length ? saved.map((p) => ({ src: marketFile(p.r2_key)!, saved: true })) : d.photos.map((p) => ({ src: p.url, saved: false })),
    history: d.history.map((h) => ({ at: h.at, event: h.event, price: h.price, currency: h.currency })),
  }, { headers: { "Cache-Control": "no-store" } });
}
