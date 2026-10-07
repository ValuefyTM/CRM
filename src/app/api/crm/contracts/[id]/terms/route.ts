import { err, json, staffApi } from "@/lib/api";
import { audit } from "@/lib/auth";
import { now } from "@/lib/db";
import { cleanTerms } from "@/lib/contract-terms";

/** Saves the terms of reference / payment terms of a contract (empty fields fall back to the defaults). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const { id } = await params;
  if (!(await a.db.prepare("SELECT 1 AS x FROM contracts WHERE id = ?").bind(id).first())) return err("Contractul nu există.", 404);
  const terms = cleanTerms(await json(req));
  const set = Object.fromEntries(Object.entries(terms).filter(([, v]) => v !== undefined));
  await a.db.prepare("UPDATE contracts SET terms = ?, updated_at = ? WHERE id = ?").bind(Object.keys(set).length ? JSON.stringify(set) : null, now(), id).run();
  await audit(a.db, `user:${a.user.id}`, "contract.terms", "contract", id, `${Object.keys(set).length} câmpuri personalizate`);
  return Response.json({ ok: true });
}
