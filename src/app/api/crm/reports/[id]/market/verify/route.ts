import { err, json, reportApi } from "@/lib/api";
import { saveVerification } from "@/lib/market/verify";

/** The phone check of one comparable, on this report: `{ listing, done, day, person, outcome, note }`. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "edit", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const listing = typeof b.listing === "string" ? b.listing : "";
  if (!listing) return err("Lipsește anunțul.");
  const ok = await a.db.prepare("SELECT 1 FROM market_listings WHERE id = ?").bind(listing).first();
  if (!ok) return err("Anunțul nu există.", 404);
  await saveVerification(a.db, id, listing, { done: !!b.done, day: b.day as string, person: b.person as string, outcome: b.outcome as never, note: b.note as string }, a.user.id);
  return Response.json({ ok: true });
}
