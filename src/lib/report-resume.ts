// Server-only: a rule of Emailuri primite acting on a report — the bank says the information asked for was provided:
// the suspended report goes back in work (its pause ends), the email is noted in its messages and its team hears of it
// by push and by email. Runs in the worker's email handler too: no request APIs (links from CRM_URL there).
import { setPause, pushTeam } from "./report-pause";
import { esc, layout, sendEmail } from "./email";

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const crmLink = (path: string) => `${(process.env.CRM_URL || "https://crm.valuefy.ro").replace(/\/$/, "")}${path}`;

export type ResumeResult = { status: "resumed" | "noted" | "no_report"; reportId: string | null; orderId: string | null };

/** The report of a bank request (by the order's number at the bank), the newest. */
export async function reportOfRef(db: D1Database, ref: string, bankId: string | null) {
  return db.prepare(`SELECT r.id, r.status, r.number, r.order_id FROM reports r JOIN orders o ON o.id = r.order_id
      WHERE upper(o.bank_ref) = ? AND (? IS NULL OR o.bank_id = ? OR o.bank_id IS NULL) AND r.status <> 'cancelled' ORDER BY r.created_at DESC LIMIT 1`)
    .bind(ref.toUpperCase(), bankId, bankId).first<{ id: string; status: string; number: string | null; order_id: string | null }>();
}

export async function resumeFromEmail(db: D1Database, ref: string, bank: { id: string | null; name: string }, ruleName: string, subject: string | null): Promise<ResumeResult> {
  const r = await reportOfRef(db, ref, bank.id);
  if (!r) return { status: "no_report", reportId: null, orderId: null };
  const resume = r.status === "suspended";
  if (resume) {
    await db.prepare("UPDATE reports SET status = 'in_progress', suspend_reason = NULL, updated_at = ? WHERE id = ?").bind(now(), r.id).run();
    const pause = await setPause(db, r.id, "suspended", "in_progress");
    await db.prepare("INSERT INTO audit_log (actor, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)")
      .bind("email:rule", "report.status", "report", r.id, `Suspendat → În lucru (${ruleName}: ${ref})${pause ? ` · pauză ${pause} zile lucrătoare` : ""}`).run();
  }
  const who = `${bank.name} (email)`;
  const body = `${bank.name} a trimis informațiile / documentele solicitate pentru cererea ${ref}${subject ? ` („${subject.slice(0, 120)}”)` : ""}.${resume ? " Raportul a fost reluat în lucru." : ""} Detaliile sunt în aplicația băncii.`;
  await db.prepare("INSERT INTO messages (id, entity, entity_id, author_id, author_name, author_email, body, created_at, shared) VALUES (?, 'report', ?, NULL, ?, NULL, ?, ?, 0)")
    .bind(uuid(), r.id, who, body, now()).run().catch((e) => console.error("resume message", e));
  // the team: push (as when a person resumes it) and email
  const href = crmLink(`/rapoarte/${r.id}`);
  await pushTeam(db, r.id, { id: "", name: who, email: "" }, null, href, resume ? undefined : `Informații primite de la ${bank.name}: ${ref}`).catch((e) => console.error("resume push", e));
  const { results } = await db.prepare("SELECT DISTINCT u.email, u.name FROM report_members m JOIN users u ON u.id = m.user_id WHERE m.report_id = ? AND u.status = 'active' AND u.email IS NOT NULL").bind(r.id)
    .all<{ email: string; name: string | null }>().catch(() => ({ results: [] as { email: string; name: string | null }[] }));
  const name = r.number ? `Raportul nr. ${r.number}` : "Raportul";
  for (const m of results) await sendEmail({
    to: m.email,
    subject: `${resume ? "Reluat în lucru" : "Informații primite"}: ${name} · ${bank.name} ${ref}`,
    text: `${body}\n\nDeschide raportul: ${href}`,
    html: layout({ eyebrow: `${bank.name} · ${ref}`, title: resume ? `${name} a fost reluat în lucru` : `Informații primite pentru ${name.toLowerCase()}`,
      body: `<p style="margin:0;font-size:15px;line-height:1.65;color:#4A4A4A">${esc(body)}</p>`, button: { label: "Deschide raportul →", url: href },
      foot: resume ? "Timpul raportului curge din nou de azi." : "Raportul nu era suspendat: doar s-a notat în mesajele lui." }),
  }).catch((e) => console.error("resume mail", e));
  return { status: resume ? "resumed" : "noted", reportId: r.id, orderId: r.order_id };
}
