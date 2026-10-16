import { NextResponse } from "next/server";
import { audit } from "@/lib/auth";
import { purgeGlide, purgePlan } from "@/lib/glide/purge";
import { err, json, staffApi } from "@/lib/api";

async function owner() {
  const a = await staffApi("settings.E");
  if ("res" in a) return a;
  if (a.user.role !== "owner") return { res: err("Doar proprietarul poate șterge datele din Glide.", 403) };
  return a;
}

/** What deleting the Glide data would remove. */
export async function GET() {
  const a = await owner();
  if ("res" in a) return a.res;
  return NextResponse.json(await purgePlan(a.db));
}

/** Deletes the Glide data. The body must carry the confirmation word. */
export async function POST(req: Request) {
  const a = await owner();
  if ("res" in a) return a.res;
  if ((await json(req)).confirm !== "STERG") return err("Scrie STERG ca să confirmi.");
  try {
    // A row kept only for a CRM row that went with the Glide data is free on the next pass.
    let n = 0;
    for (let i = 0; i < 3; i++) { const d = await purgeGlide(a.db); n += d; if (!d) break; }
    await audit(a.db, `user:${a.user.id}`, "import.purge", "import", "glide", `${n} rânduri șterse`);
    return NextResponse.json({ ok: true, deleted: n });
  } catch (e) {
    console.error("[purge]", e);
    return err(`Ștergerea nu s-a făcut (nimic nu a fost modificat): ${e instanceof Error ? e.message : String(e)}`, 500);
  }
}
