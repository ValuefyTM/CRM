import { json, staffApi } from "@/lib/api";
import { lookupCadastre } from "@/lib/geolocate";
import { geocodeAddress } from "@/lib/geocode";

const s = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) || null : null);

/**
 * Where an asset being filled in is (the small map of the form): the geoportal plans by its cadastral / CF number
 * first, else its address. Nothing is saved here.
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
  const hit = await geocodeAddress({ address: addr, city: p.city, county: p.county });
  return Response.json({ hit, cadastreTried: !!(p.cad_building || p.cad_land || p.cf_number) });
}
