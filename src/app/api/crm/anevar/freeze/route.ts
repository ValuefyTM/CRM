import { err, json, staffApi } from "@/lib/api";
import { freezeYear, unfreezeYear } from "@/lib/anevar";

const yearOf = (v: unknown) => { const y = Number(v); return Number.isInteger(y) && y >= 2015 && y <= 2100 ? y : null; };

/** Freezes a year's ANEVAR report: `{ year, note? }`. */
export async function POST(req: Request) {
  const a = await staffApi("anevar", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const year = yearOf(b.year);
  if (!year) return err("Alege anul.");
  const r = await freezeYear(a.db, a.user.id, year, typeof b.note === "string" ? b.note.trim().slice(0, 300) || null : null);
  if (!r.ok) return err(r.error);
  return Response.json({ ok: true, n: r.n });
}

/** Unfreezes a year (the owner only): `?year=`. */
export async function DELETE(req: Request) {
  const a = await staffApi("anevar", true);
  if ("res" in a) return a.res;
  if (a.user.role !== "owner") return err("Doar proprietarul poate debloca un an raportat.", 403);
  const year = yearOf(new URL(req.url).searchParams.get("year"));
  if (!year) return err("Alege anul.");
  const r = await unfreezeYear(a.db, a.user.id, year);
  if (!r.ok) return err(r.error);
  return Response.json({ ok: true });
}
