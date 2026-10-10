import { NextResponse } from "next/server";
import { err, staffApi } from "@/lib/api";
import { MAX_SOCIAL_BYTES, getById, setSocialImage } from "@/lib/listings";

/** Stores the 1200×630 share image generated in the browser (valuefy.ro serves it as the link preview). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const { id } = await params;
  if (!(await getById(a.db, id))) return err("Anunțul nu există.", 404);
  if (req.headers.get("content-type") !== "image/jpeg") return err("Format invalid.");
  const data = await req.arrayBuffer();
  if (!data.byteLength || data.byteLength > MAX_SOCIAL_BYTES) return err("Imagine prea mare.");
  const lang = new URL(req.url).searchParams.get("lang") === "en" ? "en" : "ro";
  await setSocialImage(a.db, id, data, "image/jpeg", lang);
  return NextResponse.json({ ok: true });
}
