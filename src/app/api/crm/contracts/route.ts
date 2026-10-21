import { err, json, staffApi } from "@/lib/api";
import { createDirectWork } from "@/lib/direct-work";
import { sendForSignature } from "@/lib/contract-sign";
import { createFrameworkContract } from "@/lib/contracts";
import { parseAssets } from "@/lib/process-order";
import { getQuote, markQuoteConverted } from "@/lib/quotes";

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
  const a = await staffApi("contracts.A", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  if (b.kind === "framework") {
    const bank = str(b.client_id, 80);
    if (!bank || !(await a.db.prepare("SELECT 1 AS x FROM entities WHERE id = ?").bind(bank).first())) return err("Alege banca.");
    const number = str(b.number, 40);
    if (!number) return err("Completează numărul contractului cadru.");
    const signed = /^\d{4}-\d{2}-\d{2}$/.test(str(b.signed_on, 10)) ? str(b.signed_on, 10) : null;
    if (!signed) return err("Completează data semnării.");
    const billing = ["per_order", "monthly", "none"].includes(str(b.billing_mode, 20)) ? str(b.billing_mode, 20) : null;
    if (!billing) return err("Alege modul de facturare: la raport sau lunar, pe borderou.");
    const id = await createFrameworkContract(a.db, a.user.id, {
      client_id: bank, number, signed_on: signed, fee: amount(b.fee), report_type: str(b.report_type, 120) || "Raport de evaluare",
      purpose: str(b.purpose, 120) || null, notes: str(b.notes, 2000) || null, billing_mode: billing,
    });
    return Response.json({ ok: true, contract: id });
  }
  // A new report on an existing contract may value only properties already in it (shared inspection).
  const onlyShared = Array.isArray(b.reports) && (!Array.isArray(b.assets) || b.assets.length === 0)
    && (b.reports as { shared?: unknown[] }[]).some((r) => Array.isArray(r.shared) && r.shared.length > 0);
  const assets = onlyShared ? { ok: true as const, assets: [] } : parseAssets(b.assets);
  if (!assets.ok) return err(assets.error);
  // From an offer (Oferte): the offer must still be open; it is marked converted below.
  const quoteId = str(b.quote_id, 80);
  const quote = quoteId ? await getQuote(a.db, quoteId) : null;
  if (quoteId && (!quote || quote.status === "converted")) return err(quote ? "Oferta e deja convertită în lucrare." : "Oferta nu există.");
  const r = await createDirectWork(a.db, { id: a.user.id, name: a.user.name }, b, assets.assets);
  if (!r.ok) return err(r.error);
  if (quote) await markQuoteConverted(a.db, a.user.id, quote.id, { mode: "direct", order: r.order, contract: r.contract?.id ?? null, report: r.report });
  // Accepted now: the contract can go straight to the client for online signing (to the address given, else the client's).
  let signSent = false;
  const sendTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(b.send_to, 160)) ? str(b.send_to, 160).toLowerCase() : r.client.email;
  if (b.send_contract === true && r.contract && sendTo) {
    const s = await sendForSignature(a.db, `user:${a.user.id}`, r.contract.id, sendTo);
    signSent = s.ok;
  }
  return Response.json({ ok: true, order: r.order, report: r.report, contract: r.contract, client: { id: r.client.id, name: r.client.name, reused: r.client.reused }, signSent });
}
