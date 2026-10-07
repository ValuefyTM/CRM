import { NextResponse } from "next/server";
import { err } from "@/lib/api";
import { inspApi, inspectionDocs, myInspection, photosOf, sheetOf } from "@/lib/insp";

/** One inspection with its sheet (draft or sent), photos and documents (CF extract, floor survey). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await inspApi();
  if ("res" in a) return a.res;
  const id = (await params).id;
  const inspection = await myInspection(a.db, a.user, id);
  if (!inspection) return err("Inspecția nu există sau nu îți este alocată.", 404);
  const [sheet, photos, docs] = await Promise.all([sheetOf(a.db, id), photosOf(a.db, id), inspectionDocs(a.db, inspection)]);
  return NextResponse.json({ inspection, sheet, photos, docs }, { headers: { "Cache-Control": "no-store" } });
}
