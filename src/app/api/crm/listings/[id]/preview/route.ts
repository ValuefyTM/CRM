import { NextResponse } from "next/server";
import { err, staffApi } from "@/lib/api";
import { getById, previewToken } from "@/lib/listings";
import { SITE_URL } from "@/lib/listing-format";

/** Link that opens the listing on valuefy.ro even while it is a draft. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("listings.E", true);
  if ("res" in a) return a.res;
  const l = await getById(a.db, (await params).id);
  if (!l) return err("Anunțul nu există.", 404);
  const token = await previewToken(a.db, a.user.id);
  return NextResponse.json({ url: `${SITE_URL}/api/previzualizare?t=${token}&to=${encodeURIComponent(`/imobiliare/${l.slug}`)}` });
}
