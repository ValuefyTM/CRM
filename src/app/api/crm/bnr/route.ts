import { err, staffApi } from "@/lib/api";
import { eurRate } from "@/lib/bnr";

/** The BNR euro rate of a day: `?date=YYYY-MM-DD` → `{ rate, date }` (the last rate published on or before that day). */
export async function GET(req: Request) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const day = new URL(req.url).searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return err("Data lipsește.");
  const r = await eurRate(a.db, day);
  if (!r) return err("Cursul BNR nu a putut fi citit acum. Scrie cursul manual.", 502);
  return Response.json(r);
}
