import { NextResponse } from "next/server";
import { staffApi } from "@/lib/api";
import { translateListing, translationAvailable } from "@/lib/translate-listing";

const UNAVAILABLE = "Traducerea automată nu este disponibilă momentan. Completează manual varianta în engleză sau încearcă din nou mai târziu.";

/** Translates the Romanian texts from the listing form to English. */
export async function POST(req: Request) {
  const a = await staffApi("listings", true);
  if ("res" in a) return a.res;
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title.trim().slice(0, 160) : "";
  const raw = Array.isArray(b.description) ? b.description.map(String) : typeof b.description === "string" ? b.description.split(/\n\s*\n/) : [];
  const description = raw.map((p) => p.trim().slice(0, 4000)).filter(Boolean).slice(0, 30);
  const features = (Array.isArray(b.features) ? b.features : []).map((x) => String(x).trim().slice(0, 80)).filter(Boolean).slice(0, 30);
  if (!title && !description.length) return NextResponse.json({ error: "Completează întâi titlul și descrierea în română." }, { status: 400 });
  if (!translationAvailable()) return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
  const en = await translateListing({ title, description, features });
  if (!en) return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
  return NextResponse.json(en);
}
