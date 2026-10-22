import { staffApi } from "@/lib/api";
import { searchProperties } from "@/lib/assets";
import { propertyScope } from "@/lib/perms-db";

/** Properties already in the CRM (CF, cadastral number or address), to link the same property to a new report — those the user may see. */
export async function GET(req: Request) {
  const a = await staffApi("properties");
  if ("res" in a) return a.res;
  return Response.json(await searchProperties(a.db, new URL(req.url).searchParams.get("q") ?? "", propertyScope(a.user)));
}
