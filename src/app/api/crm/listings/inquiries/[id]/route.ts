import { NextResponse } from "next/server";
import { err, json, staffApi } from "@/lib/api";
import { INQUIRY_STATUSES, setInquiryStatus } from "@/lib/listings";

/** Viewing / report request from a listing page: mark it handled (e.g. report sent). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("listings", true);
  if ("res" in a) return a.res;
  const { status } = await json(req);
  if (typeof status !== "string" || !INQUIRY_STATUSES.includes(status)) return err("Status invalid.");
  await setInquiryStatus(a.db, Number((await params).id), status);
  return NextResponse.json({ ok: true });
}
