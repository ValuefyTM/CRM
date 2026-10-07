import { err, json, staffApi } from "@/lib/api";
import { ingestBankEmail } from "@/lib/bank-mail";

/** A bank notice pasted in the CRM (subject + text of the email): creates the bank order, like the intake address. */
export async function POST(req: Request) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const b = await json(req);
  const text = typeof b.text === "string" ? b.text.slice(0, 20000) : "";
  if (text.trim().length < 20) return err("Lipește textul emailului de la bancă (subiect și conținut).");
  const r = await ingestBankEmail(a.db, { subject: typeof b.subject === "string" ? b.subject : null, text, from: null }, "paste", a.user.id);
  if (r.status === "unrecognised") return err("Nu am recunoscut emailul. Funcționează cu notificările BCR („ID de cerere: EV…”) și BRD („evaluari REV…, client …”).");
  return Response.json({ ok: true, status: r.status, order: r.orderId, bank: r.notice?.bank, ref: r.notice?.ref, client: r.notice?.client });
}
