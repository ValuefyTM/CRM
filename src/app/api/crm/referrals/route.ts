import { err, json, reportApi, staffApi } from "@/lib/api";
import { audit } from "@/lib/auth";
import { now } from "@/lib/db";
import { can } from "@/lib/perms";
import { referralOf, referralPeople } from "@/lib/contract-orders";

/** The collaborators' accounts (Utilizatori → Colaboratori) for "Recomandată de": `?q=` name, email, phone or firm. */
export async function GET(req: Request) {
  const a = await staffApi("any");
  if ("res" in a) return a.res;
  return Response.json({ results: await referralPeople(a.db, new URL(req.url).searchParams.get("q") ?? "") });
}

/**
 * Sets who recommended the work: `{ order, user }` (the order and its reports) or `{ report, user }` (the report and its
 * order). `user` empty clears it.
 */
export async function PATCH(req: Request) {
  const b = await json(req);
  const raw = typeof b.user === "string" ? b.user : "";
  const reportId = typeof b.report === "string" ? b.report : "";
  let orderId = typeof b.order === "string" ? b.order : "";
  let db: D1Database, actor: string;
  if (reportId) {
    const a = await reportApi(reportId, "edit", true);
    if ("res" in a) return a.res;
    db = a.db; actor = a.user.id;
    orderId = (await db.prepare("SELECT order_id FROM reports WHERE id = ?").bind(reportId).first<{ order_id: string | null }>())?.order_id ?? "";
  } else {
    const a = await staffApi("orders", true);
    if ("res" in a) return a.res;
    if (!can(a.user, "orders.E")) return err("Nu ai drepturi pentru această acțiune.", 403);
    db = a.db; actor = a.user.id;
  }
  const user = raw ? await referralOf(db, raw) : null;
  if (raw && !user) return err("Alege un colaborator din listă.");
  const t = now();
  const writes = [
    ...(orderId ? [db.prepare("UPDATE orders SET referral_user_id = ?, updated_at = ? WHERE id = ?").bind(user, t, orderId),
      db.prepare("UPDATE reports SET referral_user_id = ?, updated_at = ? WHERE order_id = ?").bind(user, t, orderId)] : []),
    ...(reportId ? [db.prepare("UPDATE reports SET referral_user_id = ?, updated_at = ? WHERE id = ?").bind(user, t, reportId)] : []),
  ];
  if (!writes.length) return err("Alege comanda sau raportul.");
  await db.batch(writes);
  const name = user ? (await db.prepare("SELECT COALESCE(NULLIF(name, ''), email) AS n FROM users WHERE id = ?").bind(user).first<{ n: string }>())?.n ?? "" : "";
  await audit(db, `user:${actor}`, "referral.set", reportId ? "report" : "order", reportId || orderId, user ? `recomandată de ${name}` : "fără recomandare");
  return Response.json({ ok: true });
}
