import { reportApi } from "@/lib/api";
import { can } from "@/lib/perms";
import { marketForReport } from "@/lib/market/report";
import { marketFile } from "@/lib/market/search";
import { verificationsOf } from "@/lib/market/verify";

/** Market listings around the report's subject: `?bun=<asset>&raza=0.5|1|2|5|10&tr=vanzare|inchiriere&tol=25|50|0&toate=1`. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "view");
  if ("res" in a) return a.res;
  if (!can(a.user, "market")) return Response.json({ error: "Nu ai acces la Comparabile." }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const r = await marketForReport(a.db, id, { assetId: q.get("bun"), radius: q.get("raza"), tr: q.get("tr"), tol: q.get("tol"), all: q.get("toate") === "1" });
  const verif = await verificationsOf(a.db, id).catch(() => ({}));
  const photos = <T extends { rows: { cover_key: string | null }[] }>(g: T) => ({ ...g, rows: g.rows.map((x) => ({ ...x, photo: marketFile(x.cover_key) })) });
  return Response.json({ ...r, verif, rows: photos(r).rows, groups: { prop: photos(r.groups.prop), ...(r.groups.teren ? { teren: photos(r.groups.teren) } : {}) } }, { headers: { "Cache-Control": "no-store" } });
}
