import { err, json, reportApi } from "@/lib/api";
import { latestChecks, legalProgress, markIssue, runLegalCheck } from "@/lib/legal-check";

/** The newest legal check of each asset of the report; or the progress of a running one. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "view");
  if ("res" in a) return a.res;
  // `?progress=<asset>`: how far the running check has got
  const asset = new URL(req.url).searchParams.get("progress");
  if (asset) return Response.json({ progress: await legalProgress(a.db, id, asset) }, { headers: { "Cache-Control": "no-store" } });
  return Response.json({ checks: await latestChecks(a.db, id) }, { headers: { "Cache-Control": "no-store" } });
}

/** Runs the legal check of an asset's documents: `{ asset }` (who may manage the report's documents). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "view", true);
  if ("res" in a) return a.res;
  if (!a.access.can.docs) return err("Nu poți lucra cu actele acestui raport.", 403);
  const b = await json(req);
  const r = await runLegalCheck(a.db, id, typeof b.asset === "string" ? b.asset : "", a.user.id);
  return r.ok ? Response.json({ ok: true, id: r.id }) : err(r.error);
}

/** Marks an issue: `{ check, key, state: "rezolvat" | "acceptat" | null, note }`. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "view", true);
  if ("res" in a) return a.res;
  if (!a.access.can.docs) return err("Nu poți lucra cu actele acestui raport.", 403);
  const b = await json(req);
  const state = b.state === "rezolvat" || b.state === "acceptat" ? b.state : null;
  const ok = await markIssue(a.db, String(b.check ?? ""), id, String(b.key ?? "").slice(0, 200), state, typeof b.note === "string" ? b.note : null, a.user.name || a.user.email);
  return ok ? Response.json({ ok: true }) : err("Analiza nu există.", 404);
}
