import { err, json, staffApi } from "@/lib/api";
import { audit } from "@/lib/auth";
import { now } from "@/lib/db";
import { cleanTerms, PAYMENT_FIELDS, REPORT_FIELDS } from "@/lib/contract-terms";

/** Saves the terms of reference / payment terms of a contract (empty fields fall back to the defaults). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const { id } = await params;
  if (!(await a.db.prepare("SELECT 1 AS x FROM contracts WHERE id = ?").bind(id).first())) return err("Contractul nu există.", 404);
  // A signed contract is changed only by an addendum.
  if (await a.db.prepare("SELECT 1 AS x FROM contracts WHERE id = ? AND signed_at IS NOT NULL").bind(id).first()) return err("Contractul este semnat de client: modificările se fac prin act adițional.", 409);
  const b = await json(req);
  const report = typeof b.report === "string" ? b.report : null;
  // Per report: its terms of reference (Annex 1.N). Without a report: the contract's payment terms (Annex 2).
  const keys: readonly string[] = report ? REPORT_FIELDS : PAYMENT_FIELDS;
  const set = Object.fromEntries(Object.entries(cleanTerms(b)).filter(([k, v]) => v !== undefined && keys.includes(k)));
  const value = Object.keys(set).length ? JSON.stringify(set) : null;
  if (report) {
    const r = await a.db.prepare("SELECT id, label FROM reports WHERE id = ? AND contract_id = ?").bind(report, id).first<{ id: string; label: string | null }>();
    if (!r) return err("Raportul nu aparține acestui contract.");
    // A single-report contract may hold report fields on the contract (older saves): they move to the report.
    const old = await a.db.prepare("SELECT terms FROM contracts WHERE id = ?").bind(id).first<{ terms: string | null }>();
    const kept = old?.terms ? Object.fromEntries(Object.entries(cleanTerms(JSON.parse(old.terms))).filter(([k, v]) => v !== undefined && (PAYMENT_FIELDS as readonly string[]).includes(k))) : {};
    await a.db.batch([
      a.db.prepare("UPDATE reports SET terms = ?, updated_at = ? WHERE id = ?").bind(value, now(), report),
      a.db.prepare("UPDATE contracts SET terms = ?, updated_at = ? WHERE id = ?").bind(Object.keys(kept).length ? JSON.stringify(kept) : null, now(), id),
    ]);
    await audit(a.db, `user:${a.user.id}`, "contract.terms", "contract", id, `termeni de referință · ${r.label ?? "raport"}`);
  } else {
    const old = await a.db.prepare("SELECT terms FROM contracts WHERE id = ?").bind(id).first<{ terms: string | null }>();
    const kept = old?.terms ? Object.fromEntries(Object.entries(cleanTerms(JSON.parse(old.terms))).filter(([k, v]) => v !== undefined && !(PAYMENT_FIELDS as readonly string[]).includes(k))) : {};
    const merged = { ...kept, ...set };
    await a.db.prepare("UPDATE contracts SET terms = ?, updated_at = ? WHERE id = ?").bind(Object.keys(merged).length ? JSON.stringify(merged) : null, now(), id).run();
    await audit(a.db, `user:${a.user.id}`, "contract.terms", "contract", id, "condiții de plată");
  }
  return Response.json({ ok: true });
}
