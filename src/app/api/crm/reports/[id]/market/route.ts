import { reportApi } from "@/lib/api";
import { can } from "@/lib/perms";
import { marketForReport } from "@/lib/market/report";
import { marketFile } from "@/lib/market/search";

/** Market listings around the report's subject: `?bun=<asset>&raza=0.5|1|2|5|10&tr=vanzare|inchiriere&tol=25|50|0&toate=1`. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "view");
  if ("res" in a) return a.res;
  if (!can(a.user, "market")) return Response.json({ error: "Nu ai acces la Anunțuri de piață." }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const r = await marketForReport(a.db, id, { assetId: q.get("bun"), radius: q.get("raza"), tr: q.get("tr"), tol: q.get("tol"), all: q.get("toate") === "1" });
  return Response.json({ ...r, rows: r.rows.map((x) => ({ ...x, photo: marketFile(x.cover_key) })) }, { headers: { "Cache-Control": "no-store" } });
}
