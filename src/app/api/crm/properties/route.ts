import { staffApi } from "@/lib/api";
import { searchProperties } from "@/lib/assets";

/** Properties already in the CRM (CF, cadastral number or address), to link the same property to a new report. */
export async function GET(req: Request) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  return Response.json(await searchProperties(a.db, new URL(req.url).searchParams.get("q") ?? ""));
}
