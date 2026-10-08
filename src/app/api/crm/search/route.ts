import { staffApi } from "@/lib/api";
import { globalSearch } from "@/lib/search";

/** The CRM's top-bar search: reports, orders, clients, contracts and properties matching `q`. */
export async function GET(req: Request) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  return Response.json({ results: await globalSearch(a.db, new URL(req.url).searchParams.get("q") ?? "") });
}
