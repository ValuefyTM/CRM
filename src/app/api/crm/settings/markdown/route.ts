import { err, json, staffApi } from "@/lib/api";
import { audit } from "@/lib/auth";
import { mdEnabled, submitReading, syncReadings } from "@/lib/report-md";

/** The Markdown reading of the final reports (owner): `{ action: "pilot", limit }` sends a batch, `{ action: "sync" }` brings in the results. */
export async function POST(req: Request) {
  const a = await staffApi("settings", true);
  if ("res" in a) return a.res;
  if (a.user.role !== "owner") return err("Doar proprietarul.", 403);
  if (!mdEnabled()) return err("Cheia Claude (ANTHROPIC_API_KEY) nu este configurată.", 503);
  const b = await json(req);
  try {
    if (b.action === "sync") return Response.json({ ok: true, ...(await syncReadings(a.db)) });
    if (b.action === "pilot") {
      const limit = Math.min(50, Math.max(1, Number(b.limit) || 10));
      const r = await submitReading(a.db, a.user.id, { limit });
      if (!r.ok) return err(r.error);
      await audit(a.db, `user:${a.user.id}`, "settings.markdown", "settings", undefined, `${r.sent} rapoarte trimise la citire${r.skipped.length ? ` · sărite: ${r.skipped.join(", ")}` : ""}`);
      return Response.json(r);
    }
  } catch (e) {
    console.error("markdown", e);
    return err(`Serviciul Claude a răspuns cu o eroare: ${String((e as Error).message ?? e).slice(0, 200)}`, 502);
  }
  return err("Acțiune necunoscută.");
}
