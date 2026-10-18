import { NextResponse } from "next/server";
import { err, json, staffApi } from "@/lib/api";
import { audit } from "@/lib/auth";
import { geolocateEnabled, locateBatch, locateCounts, locateOne, locatorCheck, LocatorError } from "@/lib/geolocate";

/** How many properties are still to place on the map (from the cadastral plans or their address). */
export async function GET(req: Request) {
  const a = await staffApi("properties");
  if ("res" in a) return a.res;
  // ?check=1: test the whole link with the Tools locator and say where it stops.
  if (new URL(req.url).searchParams.get("check")) return NextResponse.json(await locatorCheck(a.db));
  return NextResponse.json({ enabled: geolocateEnabled(), ...(await locateCounts(a.db)) });
}

/**
 * Places properties on the map: from the cadastral plans (Tools locator) when set up, else from the address.
 * `{ id }` one property (again, even if it was tried); `{ limit, retry }` the next batch (administrators), the page
 * calls it until nothing is left.
 */
export async function POST(req: Request) {
  const a = await staffApi("properties.E", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  try {
    if (typeof b.id === "string") {
      const ok = await locateOne(a.db, b.id);
      if (ok === null) return err("Proprietatea nu există.", 404);
      const note = await a.db.prepare("SELECT geo, geo_note FROM crm_properties WHERE id = ?").bind(b.id).first<{ geo: string | null; geo_note: string | null }>();
      return NextResponse.json({ ok, geo: note?.geo ?? null, note: note?.geo_note ?? null });
    }
    if (a.user.role !== "owner" && a.user.role !== "admin") return err("Doar administratorii pot localiza toate proprietățile.", 403);
    const limit = Math.min(300, Math.max(10, Number(b.limit) || 150));
    const r = await locateBatch(a.db, limit, b.retry === true);
    if (r.processed) await audit(a.db, `user:${a.user.id}`, "properties.locate", "property", "batch", `${r.located} din ${r.processed} localizate (cadastru sau adresă)`);
    return NextResponse.json({ ...r, ...(await locateCounts(a.db)) });
  } catch (e) {
    console.error("locate", e);
    return err(e instanceof LocatorError ? e.message : "Localizatorul nu a răspuns. Încearcă din nou peste un minut.", 502);
  }
}
