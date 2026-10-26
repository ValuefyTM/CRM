import { err, staffApi } from "@/lib/api";
import { ownerNetYear, validPeriod } from "@/lib/statements";

/** The owner's net from January to `?luna=YYYY-MM` (the statements page loads it after showing the month). */
export async function GET(req: Request) {
  const a = await staffApi("statements");
  if ("res" in a) return a.res;
  if (a.user.role !== "owner") return err("Doar proprietarul firmei.", 403);
  const luna = new URL(req.url).searchParams.get("luna") ?? "";
  if (!validPeriod(luna)) return err("Luna nu e validă.");
  return Response.json(await ownerNetYear(a.db, luna), { headers: { "Cache-Control": "private, max-age=60" } });
}
