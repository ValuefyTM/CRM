import { NextResponse } from "next/server";
import { audit } from "@/lib/auth";
import { bucket } from "@/lib/orders";
import { FILE_COLUMNS, GLIDE_URL, moveToR2 } from "@/lib/files";
import { err, staffApi } from "@/lib/api";

const BATCH = 8; // a few downloads per request keeps every request well inside the Workers limits

async function counts(db: D1Database) {
  const out = { pending: 0, moved: 0, lost: 0 };
  for (const [t, c] of FILE_COLUMNS) {
    const r = await db
      .prepare(`SELECT SUM(${c} LIKE ?) AS pending, SUM(${c} LIKE 'r2:%') AS moved, SUM(${c} LIKE 'lost:%') AS lost FROM ${t}`)
      .bind(GLIDE_URL)
      .first<{ pending: number | null; moved: number | null; lost: number | null }>();
    out.pending += r?.pending ?? 0; out.moved += r?.moved ?? 0; out.lost += r?.lost ?? 0;
  }
  return out;
}

async function owner() {
  const a = await staffApi("admin");
  if ("res" in a) return a;
  if (a.user.role !== "owner") return { res: err("Doar proprietarul poate muta fișierele.", 403) };
  return a;
}

/** How many Glide files are left to move. */
export async function GET() {
  const a = await owner();
  if ("res" in a) return a.res;
  return NextResponse.json(await counts(a.db));
}

/** Moves the next few Glide files into R2 (the page calls this until nothing is left). */
export async function POST() {
  const a = await owner();
  if ("res" in a) return a.res;
  const r2 = await bucket();
  if (!r2) return err("Spațiul de stocare R2 nu este configurat.", 503);
  let moved = 0, lost = 0;
  for (const [t, c] of FILE_COLUMNS) {
    if (moved + lost >= BATCH) break;
    const { results } = await a.db.prepare(`SELECT id, ${c} AS url FROM ${t} WHERE ${c} LIKE ? LIMIT ?`).bind(GLIDE_URL, BATCH - moved - lost).all<{ id: string; url: string }>();
    for (const row of results) {
      const value = await moveToR2(r2, row.url, `glide/${t}/${row.id}-${c}`);
      if (!value) continue;
      await a.db.prepare(`UPDATE ${t} SET ${c} = ? WHERE id = ?`).bind(value, row.id).run();
      value.startsWith("r2:") ? moved++ : lost++;
    }
  }
  const left = await counts(a.db);
  if (left.pending === 0 && moved + lost > 0) await audit(a.db, `user:${a.user.id}`, "import.files", "import", "glide", `${left.moved} fișiere în R2`);
  return NextResponse.json({ ...left, batchMoved: moved, batchLost: lost });
}
