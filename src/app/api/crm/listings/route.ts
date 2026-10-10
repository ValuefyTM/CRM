import { NextResponse } from "next/server";
import { err, json, staffApi } from "@/lib/api";
import { createListing, validateInput } from "@/lib/listings";
import { withAutoEnglish } from "@/lib/translate-listing";

/** New listing (a draft until it is published). */
export async function POST(req: Request) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const v = validateInput(await json(req));
  if (!v.ok) return err(v.error);
  const id = await createListing(a.db, await withAutoEnglish(v.value));
  return NextResponse.json({ ok: true, id });
}
