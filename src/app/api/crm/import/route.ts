import { NextResponse } from "next/server";
import { audit } from "@/lib/auth";
import { importRows } from "@/lib/glide/import";
import type { Row } from "@/lib/glide/transform";
import { err, staffApi } from "@/lib/api";

/** One batch of the Glide import (owner only). The page sends the tables in order, 100 rows at a time. */
export async function POST(req: Request) {
  const a = await staffApi("admin");
  if ("res" in a) return a.res;
  if (a.user.role !== "owner") return err("Importul de date este disponibil doar proprietarului.", 403);
  const b = (await req.json().catch(() => null)) as { table?: string; rows?: Row[]; last?: boolean } | null;
  if (!b?.table || !Array.isArray(b.rows) || b.rows.length > 200) return err("Lot invalid.");
  try {
    const n = await importRows(a.db, b.table, b.rows, a.user.id);
    if (b.last) await audit(a.db, `user:${a.user.id}`, "import.glide", "import", b.table, `${b.table}`);
    return NextResponse.json({ ok: true, n });
  } catch (e) {
    console.error("[import]", b.table, e);
    return err(`Eroare la ${b.table}: ${e instanceof Error ? e.message : String(e)}`, 500);
  }
}
