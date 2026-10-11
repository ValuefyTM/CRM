import { NextResponse } from "next/server";
import { staffApi } from "@/lib/api";
import { revokeGrant } from "@/lib/mcp-auth";

/** Stops one of the signed-in user's Claude connections (its tokens stop working at once). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  await revokeGrant(a.db, a.user.id, (await params).id);
  return NextResponse.json({ ok: true });
}
