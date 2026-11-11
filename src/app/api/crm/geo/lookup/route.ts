import { json, staffApi } from "@/lib/api";
import { lookupCadastre } from "@/lib/geolocate";
import { geocodeAddress } from "@/lib/geocode";
import { now } from "@/lib/db";

const s = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) || null : null);

/**
 * Where an asset being filled in is (the small map of the form): the geoportal plans by its cadastral / CF number
 * first, else its address. Nothing is saved here, except: with `property`, a point of that property found from its
 * address replaces the one it had from its address (never a point from the plans, the inspection or set by hand).
 */
export async function POST(req: Request) {
  const a = await staffApi("any");
  if ("res" in a) return a.res;
  const b = await json(req);
  const p = { city: s(b.city, 80), county: s(b.county, 60), cad_building: s(b.cad_building, 40), cad_land: s(b.cad_land, 40), cf_number: s(b.cf_number, 40) };
  const cad = await lookupCadastre(p);
  if (cad) return Response.json({ hit: cad });
  const addr = s(b.address);
  if (!addr && !p.city) return Response.json({ hit: null });
  // with `property`: its own address, as saved (the point found is written on it)
  const prop = s(b.property, 80);
  const saved = prop ? await a.db.prepare("SELECT full_address, city, county FROM crm_properties WHERE id = ?").bind(prop)
    .first<{ full_address: string | null; city: string | null; county: string | null }>() : null;
  if (prop && !saved) return Response.json({ hit: null });
  const hit = await geocodeAddress(saved ? { address: saved.full_address, city: saved.city, county: saved.county } : { address: addr, city: p.city, county: p.county });
  if (hit && prop) await a.db.prepare(`UPDATE crm_properties SET geo = ?, geo_source = ?, geo_note = ?, geo_checked_at = ?
      WHERE id = ? AND (geo IS NULL OR geo = '' OR geo_source IN ('adresa', 'localitate'))`).bind(`${hit.lat}, ${hit.lng}`, hit.source, hit.note, now(), prop).run().catch(() => null);
  return Response.json({ hit, cadastreTried: !!(p.cad_building || p.cad_land || p.cf_number) });
}
