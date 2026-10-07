import { err, json, staffApi } from "@/lib/api";
import { updateContract } from "@/lib/contracts";

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const amount = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n < 1e7 ? Math.round(n * 100) / 100 : null;
};

/** Edits a contract's details: number, date, fee, report type, purpose, notes. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const { id } = await params;
  const k = await a.db.prepare("SELECT id, kind FROM contracts WHERE id = ?").bind(id).first<{ id: string; kind: string }>();
  if (!k) return err("Contractul nu există.", 404);
  // A signed contract is changed only by an addendum.
  if (await a.db.prepare("SELECT 1 AS x FROM contracts WHERE id = ? AND signed_at IS NOT NULL").bind(id).first()) return err("Contractul este semnat de client: modificările se fac prin act adițional.", 409);
  const b = await json(req);
  const number = str(b.number, 40);
  if (!number) return err("Completează numărul contractului.");
  if (k.kind === "classic" && await a.db.prepare("SELECT 1 AS x FROM contracts WHERE kind = 'classic' AND number = ? AND id <> ?").bind(number, id).first())
    return err(`Există deja un contract clasic cu nr. ${number}.`);
  await updateContract(a.db, a.user.id, id, {
    number, signed_on: /^\d{4}-\d{2}-\d{2}$/.test(str(b.signed_on, 10)) ? str(b.signed_on, 10) : null, fee: amount(b.fee),
    report_type: str(b.report_type, 120) || null, purpose: str(b.purpose, 120) || null, notes: str(b.notes, 2000) || null,
  });
  return Response.json({ ok: true });
}
