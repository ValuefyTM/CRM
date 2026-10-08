import { err, json, staffApi } from "@/lib/api";
import { cancelInvoice, markPaid, storePdf } from "@/lib/billing";
import { bucharestDay } from "@/lib/db";

/** { action: "paid", type, document, date } · { action: "cancel" } · { action: "pdf" } (fetch the PDF copy again). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("admin");
  if ("res" in a) return a.res;
  const { id } = await params;
  const b = await json(req);
  const s = (k: string) => (typeof b[k] === "string" ? (b[k] as string).trim().slice(0, 80) : "");
  if (b.action === "paid") {
    const r = await markPaid(a.db, a.user.id, id, { type: s("type") || "Ordin de plata", document: s("document"), date: /^\d{4}-\d{2}-\d{2}$/.test(s("date")) ? s("date") : bucharestDay() });
    return r.ok ? Response.json({ ok: true }) : err(r.error, 502);
  }
  if (b.action === "cancel") {
    const r = await cancelInvoice(a.db, a.user.id, id);
    return r.ok ? Response.json({ ok: true }) : err(r.error, 502);
  }
  if (b.action === "pdf") {
    const inv = await a.db.prepare("SELECT oblio_link FROM invoices WHERE id = ?").bind(id).first<{ oblio_link: string | null }>();
    return (await storePdf(a.db, id, inv?.oblio_link)) ? Response.json({ ok: true }) : err("Nu am putut descărca PDF-ul din Oblio.", 502);
  }
  return err("Acțiune necunoscută.");
}
