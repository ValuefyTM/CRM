import { err, json } from "@/lib/api";
import { getDb } from "@/lib/db";
import { contractByToken, saveBilling, signContract } from "@/lib/contract-sign";

/**
 * Public: the client completes its billing details and signs the contract from the link received by email. The
 * secret token in the link is the authorisation. `{ action: "billing", … }` or `{ action: "sign", name, signature, agree }`.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const db = await getDb();
  if (!db) return err("Serviciul nu este disponibil momentan.", 503);
  const k = await contractByToken(db, (await params).token);
  if (!k) return err("Contractul nu există.", 404);
  if (k.signed_at) return err("Contractul este deja semnat.", 409);
  const b = await json(req);
  if (b.action === "billing") {
    const r = await saveBilling(db, k, b);
    return r.ok ? Response.json({ ok: true }) : err(r.error);
  }
  if (b.action !== "sign") return err("Acțiune necunoscută.");
  const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ").slice(0, 120) : "";
  if (name.length < 3 || !name.includes(" ")) return err("Scrie numele și prenumele complet.");
  const sig = typeof b.signature === "string" ? b.signature : "";
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length < 1500) return err("Semnează în chenar înainte de a trimite.");
  if (sig.length > 400_000) return err("Semnătura este prea mare. Șterge-o și semnează din nou.");
  if (b.agree !== true) return err("Bifează că ai citit și accepți contractul.");
  const r = await signContract(db, k, { name, signature: sig }, req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? null, req.headers.get("user-agent") ?? "");
  return r.ok ? Response.json({ ok: true }) : err(r.error, 409);
}
