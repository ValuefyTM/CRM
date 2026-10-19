import { reportApi } from "@/lib/api";
import { inspectionSheetDoc } from "@/lib/insp-sheet-doc";

/** The inspection sheet of an asset as data, for the modal that opens it over the report. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; asset: string }> }) {
  const { id, asset } = await params;
  const a = await reportApi(id, "view");
  if ("res" in a) return a.res;
  try {
    const doc = await inspectionSheetDoc(a.db, id, asset, new URL(req.url).searchParams.get("insp") || undefined);
    if (!doc) return Response.json({ error: "Bunul nu are încă o fișă de inspecție." }, { status: 404 });
    return Response.json({ doc }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("sheet", id, asset, e);
    return Response.json({ error: "Fișa nu a putut fi citită." }, { status: 500 });
  }
}
