import { staffApi } from "@/lib/api";
import { locateOpenInspections } from "@/lib/geolocate";

/** Places on the map a few properties of the open inspections that have no point yet (plans first, then address). */
export async function POST() {
  const a = await staffApi("inspections", true);
  if ("res" in a) return a.res;
  return Response.json(await locateOpenInspections(a.db, 6));
}
