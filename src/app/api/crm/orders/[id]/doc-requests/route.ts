import { err, json, staffApi } from "@/lib/api";
import { inScope } from "@/lib/scope";
import { cancelRequest, requestDocs } from "@/lib/order-chat";

/** Documents asked of the collaborator: `{ names: string[], note }`. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("orders", true);
  if ("res" in a) return a.res;
  const { id } = await params;
  if (!(await inScope(a.db, a.user, "orders", id))) return err("Nu există.", 404);
  const b = await json(req);
  const names = Array.isArray(b.names) ? b.names.filter((x): x is string => typeof x === "string") : [];
  const r = await requestDocs(a.db, id, a.user, names, typeof b.note === "string" ? b.note : "");
  return r.ok ? Response.json(r) : err(r.error);
}

/** A request withdrawn: `?request=`. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("orders", true);
  if ("res" in a) return a.res;
  const { id } = await params;
  if (!(await inScope(a.db, a.user, "orders", id))) return err("Nu există.", 404);
  return (await cancelRequest(a.db, id, new URL(req.url).searchParams.get("request") ?? "")) ? Response.json({ ok: true }) : err("Cererea nu mai e deschisă.");
}
