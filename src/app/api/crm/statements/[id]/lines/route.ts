import { err, json, staffApi } from "@/lib/api";
import { addLine, adjustLine, deleteLine } from "@/lib/statements";

/** A manual line: `{ label, amount, reason }`. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("statements.E", true);
  if ("res" in a) return a.res;
  const { id } = await params;
  const r = await addLine(a.db, a.user.id, id, await json(req));
  return r.ok ? Response.json(r) : err(r.error);
}

/** An adjustment with the reason: `{ key | line, removed: true }`, `{ key | line, amount }` or `{ key | line, restore: true }`. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("statements.E", true);
  if ("res" in a) return a.res;
  const { id } = await params;
  const r = await adjustLine(a.db, a.user.id, id, await json(req));
  return r.ok ? Response.json(r) : err(r.error);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("statements.E", true);
  if ("res" in a) return a.res;
  const { id } = await params;
  const r = await deleteLine(a.db, a.user.id, id, new URL(req.url).searchParams.get("line") ?? "");
  return r.ok ? Response.json(r) : err(r.error);
}
