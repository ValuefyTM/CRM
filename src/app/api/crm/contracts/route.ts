import { err, json, staffApi } from "@/lib/api";
import { createDirectWork } from "@/lib/direct-work";
import { createFrameworkContract } from "@/lib/contracts";
import { parseAssets } from "@/lib/process-order";

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const amount = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n < 1e7 ? Math.round(n * 100) / 100 : null;
};

/**
 * New contract. Classic (direct work): the client, the assets and the team; `mode: 'accepted'` opens the report and the
 * contract at once, `mode: 'offer'` keeps it as an order until the client accepts the offer. Framework: the agreement
 * signed with a bank (its orders are added afterwards, from the contract's page).
 */
export async function POST(req: Request) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const b = await json(req);
  if (b.kind === "framework") {
    const bank = str(b.client_id, 80);
    if (!bank || !(await a.db.prepare("SELECT 1 AS x FROM entities WHERE id = ?").bind(bank).first())) return err("Alege banca.");
    const number = str(b.number, 40);
    if (!number) return err("Completează numărul contractului cadru.");
    const signed = /^\d{4}-\d{2}-\d{2}$/.test(str(b.signed_on, 10)) ? str(b.signed_on, 10) : null;
    if (!signed) return err("Completează data semnării.");
    const id = await createFrameworkContract(a.db, a.user.id, {
      client_id: bank, number, signed_on: signed, fee: amount(b.fee), report_type: str(b.report_type, 120) || "Raport de evaluare",
      purpose: str(b.purpose, 120) || null, notes: str(b.notes, 2000) || null,
    });
    return Response.json({ ok: true, contract: id });
  }
  const assets = parseAssets(b.assets);
  if (!assets.ok) return err(assets.error);
  const r = await createDirectWork(a.db, { id: a.user.id, name: a.user.name }, b, assets.assets);
  if (!r.ok) return err(r.error);
  return Response.json({ ok: true, order: r.order, report: r.report, contract: r.contract, client: { name: r.client.name, reused: r.client.reused } });
}
