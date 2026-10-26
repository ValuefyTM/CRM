import { reportApi } from "@/lib/api";
import { similarReports } from "@/lib/similar-reports";

/** Reports of similar properties near the report's subject: `?raza=0.5|1|2|5&acelasi=1` (only the same designated user). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "view");
  if ("res" in a) return a.res;
  const q = new URL(req.url).searchParams;
  return Response.json(await similarReports(a.db, a.user, id, { radius: q.get("raza") ?? undefined, sameUser: q.get("acelasi") === "1" }),
    { headers: { "Cache-Control": "no-store" } });
}
