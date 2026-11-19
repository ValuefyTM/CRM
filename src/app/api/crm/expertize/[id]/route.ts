import { err, json, staffApi } from "@/lib/api";
import { caseAction, deleteCase, isExpert, updateCase } from "@/lib/expert-cases";

type Ctx = { params: Promise<{ id: string }> };
async function mine(write: boolean) {
  const a = await staffApi("any", write);
  if ("res" in a) return a;
  return isExpert(a.user) ? a : { res: err("Modulul este doar pentru experții judiciari.", 403) };
}

/** The case's own fields (data, objectives, visit, fee, stage). */
export async function PUT(req: Request, { params }: Ctx) {
  const a = await mine(true);
  if ("res" in a) return a.res;
  const r = await updateCase(a.db, a.user.id, (await params).id, await json(req));
  return r.ok ? Response.json(r) : err(r.error, 400);
}

/** `{ action }`: parties, terms, summons, folders, files (see caseAction). */
export async function POST(req: Request, { params }: Ctx) {
  const a = await mine(true);
  if ("res" in a) return a.res;
  const r = await caseAction(a.db, a.user.id, (await params).id, await json(req));
  return r.ok ? Response.json(r) : err(r.error, 400);
}

export async function DELETE(_: Request, { params }: Ctx) {
  const a = await mine(true);
  if ("res" in a) return a.res;
  return (await deleteCase(a.db, a.user.id, (await params).id)) ? Response.json({ ok: true }) : err("Dosarul nu există.", 404);
}
