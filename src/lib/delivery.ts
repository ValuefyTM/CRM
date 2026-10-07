// Server-only: progress of an order (timeline for the client and the team) and the delivery of the report:
// number and date, "done" on the report and the order, and the client's notice with the download link.
import { now } from "./db";
import { audit } from "./auth";
import { esc, layout, sendEmail } from "./email";
import { appUrl } from "./site";
import { bucket, getOrder, orderCode, type Order } from "./orders";
import { offerForOrder } from "./offers";
import { dueOf, stageOf, type Stage } from "./dossier";

export type Progress = {
  steps: { label: string; at: string | null }[];
  reached: number;                     // index of the current step (steps before it are done)
  report: { id: string; stage: Stage; delivered_at: string | null; due: string | null; final: string | null } | null;
  inspection: { status: string; scheduled_at: string | null; done_at: string | null } | null;
};

/** Where an order stands: received → offer accepted / confirmed → inspection → drafting → review → delivered. */
export async function orderProgress(db: D1Database, o: Order): Promise<Progress> {
  const contract = o.source === "bank" || o.source === "collab";
  const [offer, rep] = await Promise.all([
    contract ? null : offerForOrder(db, o.id),
    db.prepare("SELECT id, stage, delivered_at, status, due_on, term_days, created_at FROM reports WHERE order_id = ? ORDER BY created_at LIMIT 1").bind(o.id)
      .first<{ id: string; stage: string | null; delivered_at: string | null; status: string; due_on: string | null; term_days: number | null; created_at: string }>(),
  ]);
  const [insp, counts, final] = rep
    ? await Promise.all([
        db.prepare(`SELECT status, scheduled_at, done_at FROM inspections WHERE report_id = ? AND status <> 'cancelled' ORDER BY (status = 'done') ASC, created_at DESC LIMIT 1`)
          .bind(rep.id).first<{ status: string; scheduled_at: string | null; done_at: string | null }>(),
        db.prepare(`SELECT COUNT(*) AS total, SUM(status = 'done') AS done, MAX(done_at) AS last,
            (SELECT COUNT(*) FROM assets a WHERE a.report_id = ?1 AND a.no_inspection IS NOT NULL) AS none FROM inspections WHERE report_id = ?1 AND status <> 'cancelled'`)
          .bind(rep.id).first<{ total: number; done: number | null; last: string | null; none: number }>(),
        db.prepare("SELECT id FROM report_documents WHERE report_id = ? AND kind = 'final' AND status = 'uploaded' ORDER BY created_at DESC LIMIT 1").bind(rep.id).first<{ id: string }>(),
      ])
    : [null, null, null];
  const stage = rep ? stageOf(rep, { total: counts?.total ?? 0, done: counts?.done ?? 0, none: counts?.none ?? 0 }) : null;
  const confirmed = contract ? rep?.created_at ?? o.created_at : offer?.status === "accepted" ? offer.accepted_at : rep?.created_at ?? null;
  const steps = [
    { label: "Comandă primită", at: o.ordered_on ?? o.created_at },
    { label: contract ? "Comandă confirmată" : "Ofertă acceptată", at: confirmed },
    { label: "Inspecție programată", at: insp?.scheduled_at ?? null },
    { label: "Inspecție realizată", at: counts?.last ?? null },
    { label: "Raport în lucru", at: null },
    { label: "În verificare", at: null },
    { label: "Raport livrat", at: rep?.delivered_at ?? null },
  ];
  let reached = confirmed ? 2 : 1;
  if (o.status === "done" && !rep) reached = 7; // finished orders from Glide
  else if (stage === "delivered") reached = 7;
  else if (stage === "review") reached = 5;
  else if (stage === "drafting") reached = 4;
  else if (insp?.status === "scheduled") reached = 3;
  return {
    steps, reached,
    report: rep ? { id: rep.id, stage: stage!, delivered_at: rep.delivered_at, due: dueOf(rep, counts?.last?.slice(0, 10) ?? null), final: final?.id ?? null } : null,
    inspection: insp ?? null,
  };
}

/** Number to suggest for a new report: the highest numeric one of the year, plus one. */
export async function nextReportNumber(db: D1Database) {
  const year = new Date().getFullYear();
  const r = await db.prepare(`SELECT MAX(CAST(number AS INTEGER)) AS n FROM reports WHERE number GLOB '[0-9]*' AND COALESCE(reporting_year, CAST(substr(report_date, 1, 4) AS INTEGER)) = ?`)
    .bind(year).first<{ n: number | null }>();
  return r?.n ? String(r.n + 1) : "";
}

/** Who hears that the report is ready, and where they download it: the portal account, or the offer page (website orders). */
async function clientNotice(db: D1Database, o: Order) {
  if ((o.source === "client" || o.source === "partner") && o.creator_email) {
    return { to: o.creator_email, name: o.creator_name, link: await appUrl("portal", `/comenzi/${o.id}`), where: "în portal" };
  }
  const offer = await offerForOrder(db, o.id);
  const to = offer?.client_email ?? o.client_email;
  if (offer?.status === "accepted" && to) return { to, name: offer.accepted_name ?? o.client_name, link: await appUrl("portal", `/oferta/${offer.token}`), where: "pe pagina ofertei" };
  return null;
}

/**
 * Hands over the report: number and date, "Finalizat", the order done, and — for portal and website orders — an email
 * to the client with the download link. `notify: false` keeps it quiet (e.g. delivered by hand).
 */
export async function deliverReport(db: D1Database, user: { id: string }, reportId: string, b: { number?: unknown; report_date?: unknown; notify?: unknown }) {
  const r = await db.prepare("SELECT id, number, report_date, order_id, delivered_at FROM reports WHERE id = ?").bind(reportId)
    .first<{ id: string; number: string | null; report_date: string | null; order_id: string | null; delivered_at: string | null }>();
  if (!r) return { ok: false as const, error: "Raportul nu există." };
  const final = await db.prepare("SELECT id FROM report_documents WHERE report_id = ? AND kind = 'final' AND status = 'uploaded' LIMIT 1").bind(reportId).first();
  if (!final) return { ok: false as const, error: "Încarcă întâi fișierul final al raportului (PDF semnat)." };
  const number = typeof b.number === "string" ? b.number.trim().slice(0, 30) : "";
  const date = typeof b.report_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.report_date) ? b.report_date : null;
  if (!r.number && !number) return { ok: false as const, error: "Completează numărul raportului." };
  const t = now();
  await db.batch([
    db.prepare(`UPDATE reports SET number = COALESCE(NULLIF(?, ''), number), report_date = COALESCE(?, report_date, ?), delivered_at = ?, delivered_by = ?, status = 'done', stage = NULL,
      reporting_year = COALESCE(reporting_year, CAST(substr(COALESCE(?, report_date, ?), 1, 4) AS INTEGER)), updated_at = ? WHERE id = ?`)
      .bind(number, date, t.slice(0, 10), t, user.id, date, t.slice(0, 10), t, reportId),
    ...(r.order_id ? [db.prepare("UPDATE orders SET status = 'done', updated_at = ? WHERE id = ? AND status <> 'cancelled'").bind(t, r.order_id)] : []),
  ]);
  await audit(db, `user:${user.id}`, "report.delivered", "report", reportId, number ? `nr. ${number}` : undefined);

  let notified: string | null = null;
  const o = r.order_id && b.notify !== false ? await getOrder(db, r.order_id) : null;
  const to = o ? await clientNotice(db, o) : null;
  if (o && to) {
    const code = orderCode(o);
    const ok = await sendEmail({
      to: to.to,
      subject: `Raportul de evaluare este gata · ${code}`,
      text: `Bună ziua${to.name ? `, ${to.name}` : ""}!\nRaportul de evaluare pentru comanda ${code} (${[o.address, o.city].filter(Boolean).join(", ")}) este gata. Îl descarci ${to.where}: ${to.link}\nMulțumim că ai ales VALUEFY.`,
      html: layout({
        eyebrow: "VALUEFY · Raport de evaluare",
        title: "Raportul tău este gata",
        body: `<p style="margin:0 0 10px;font-size:15px;line-height:1.65;color:#4A4A66">Bună ziua${to.name ? `, ${esc(to.name)}` : ""}! Raportul de evaluare pentru comanda <strong style="color:#17173A">${esc(code)}</strong>${o.address ? ` (${esc([o.address, o.city].filter(Boolean).join(", "))})` : ""} este gata.</p>
<p style="margin:0;font-size:15px;line-height:1.65;color:#4A4A66">Îl descarci ${esc(to.where)}, oricând ai nevoie de el.</p>`,
        button: { label: "Descarcă raportul →", url: to.link },
        foot: "Mulțumim că ai ales VALUEFY. Pentru întrebări, răspunde la acest email.",
      }),
    });
    if (ok) {
      notified = to.to;
      await db.prepare("UPDATE reports SET client_notified_at = ? WHERE id = ?").bind(t, reportId).run();
      await audit(db, `user:${user.id}`, "report.client_notified", "report", reportId, to.to);
    }
  }
  return { ok: true as const, notified };
}

/** The signed report PDF of an order, once delivered (portal and offer page downloads). */
export async function deliveredFile(db: D1Database, orderId: string) {
  const d = await db.prepare(`SELECT d.filename, d.content_type, d.r2_key FROM reports r JOIN report_documents d ON d.report_id = r.id
      WHERE r.order_id = ? AND r.delivered_at IS NOT NULL AND d.kind = 'final' AND d.status = 'uploaded' ORDER BY d.created_at DESC LIMIT 1`)
    .bind(orderId).first<{ filename: string; content_type: string | null; r2_key: string | null }>();
  const obj = d?.r2_key ? await (await bucket())?.get(d.r2_key) : null;
  if (!d || !obj) return new Response("Raportul nu este disponibil.", { status: 404 });
  return new Response(obj.body, {
    headers: {
      "Content-Type": d.content_type || "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(d.filename)}`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Email that would get the "report ready" notice for an order (shown before delivering), or null. */
export async function noticeTarget(db: D1Database, orderId: string | null) {
  if (!orderId) return null;
  const o = await getOrder(db, orderId);
  return o ? (await clientNotice(db, o))?.to ?? null : null;
}
