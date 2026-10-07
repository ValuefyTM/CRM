import { NextResponse } from "next/server";
import { err, json, staffApi } from "@/lib/api";
import { audit } from "@/lib/auth";
import { geolocateEnabled, locate, locateBatch, locateCounts } from "@/lib/geolocate";

/** How many properties are still to place on the map from their cadastral number. */
export async function GET() {
  const a = await staffApi();
  if ("res" in a) return a.res;
  return NextResponse.json({ enabled: geolocateEnabled(), ...(await locateCounts(a.db)) });
}

/**
 * Places properties on the map from their cadastral number (Tools locator). `{ id }` one property (again, even if it
 * was tried); `{ limit, retry }` the next batch (administrators), the page calls it until nothing is left.
 */
export async function POST(req: Request) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  if (!geolocateEnabled()) return err("Localizarea din cadastru nu este configurată (LOCATOR_API_TOKEN).", 503);
  const b = await json(req);
  try {
    if (typeof b.id === "string") {
      const p = await a.db.prepare("SELECT id, city, cad_building, cad_land, cf_number FROM crm_properties WHERE id = ?").bind(b.id)
        .first<{ id: string; city: string | null; cad_building: string | null; cad_land: string | null; cf_number: string | null }>();
      if (!p) return err("Proprietatea nu există.", 404);
      const r = await locate(a.db, [p]);
      const note = await a.db.prepare("SELECT geo, geo_note FROM crm_properties WHERE id = ?").bind(p.id).first<{ geo: string | null; geo_note: string | null }>();
      return NextResponse.json({ ok: r.located > 0, geo: note?.geo ?? null, note: note?.geo_note ?? null });
    }
    if (a.user.role !== "owner" && a.user.role !== "admin") return err("Doar administratorii pot localiza toate proprietățile.", 403);
    const limit = Math.min(300, Math.max(10, Number(b.limit) || 150));
    const r = await locateBatch(a.db, limit, b.retry === true);
    if (r.processed) await audit(a.db, `user:${a.user.id}`, "properties.locate", "property", "batch", `${r.located} din ${r.processed} localizate din cadastru`);
    return NextResponse.json({ ...r, ...(await locateCounts(a.db)) });
  } catch (e) {
    console.error("locate", e);
    return err("Localizatorul nu a răspuns. Încearcă din nou peste un minut.", 502);
  }
}
