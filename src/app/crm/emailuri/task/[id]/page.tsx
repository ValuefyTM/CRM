import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { fmtDate, staffPage } from "@/lib/guard";
import { CrmShell } from "@/components/CrmShell";
import { can } from "@/lib/perms";
import { canSeeTask } from "@/lib/mail-rules";
import { TaskClose } from "../../TaskClose";

export const metadata: Metadata = { title: "Task din email | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** A task from an email: a bank order opens "Comandă nouă" filled in; a plain task shows the email and "Rezolvat". */
export default async function MailTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, user, base } = await staffPage();
  const { id } = await params;
  const t = await db.prepare(`SELECT t.*, b.subject, b.mail_from, substr(b.body, 1, 4000) AS body, COALESCE(NULLIF(d.name, ''), d.email) AS done_name
      FROM mail_tasks t LEFT JOIN bank_emails b ON b.id = t.email_id LEFT JOIN users d ON d.id = t.done_by WHERE t.id = ?`).bind(id)
    .first<{ id: string; kind: string; title: string; status: string; ref: string | null; client_name: string | null; email_id: string | null; created_at: string; opened_at: string | null;
      done_at: string | null; done_note: string | null; done_name: string | null; order_id: string | null; notify_roles: string | null; notify_users: string | null; subject: string | null; mail_from: string | null; body: string | null }>();
  if (!t) notFound();
  if (!can(user, "orders") && !(await canSeeTask(db, t, user))) redirect(base || "/");
  // who opened it first (shown to the others: "deschis de …")
  if (t.status === "open" && !t.opened_at) await db.prepare("UPDATE mail_tasks SET opened_at = ?, opened_by = ? WHERE id = ? AND opened_at IS NULL").bind(new Date().toISOString(), user.id, id).run();
  if (t.status === "open" && t.kind === "bank_order" && can(user, "orders.A")) redirect(`${base}/comenzi/noua?task=${encodeURIComponent(id)}`);
  return (
    <CrmShell back={{ href: base || "/", label: "Tablou de bord" }} user={user} base={base} active="home" title={t.title} subtitle={`Primit ${fmtDate(t.created_at, true)}`}>
      <section className="card">
        {t.status === "open"
          ? <div className="actions" style={{ justifyContent: "space-between" }}><span className="pill pillErr"><i />Deschis</span><TaskClose task={t.id} done base={base} /></div>
          : <p><span className="pill pillOk"><i />{t.status === "done" ? "Rezolvat" : "Închis"}</span> {t.done_name ? `de ${t.done_name}` : ""} {fmtDate(t.done_at, true)}{t.done_note ? ` · ${t.done_note}` : ""}
            {t.order_id && <> · <a className="link" href={`${base}/comenzi/${t.order_id}`}>vezi comanda</a></>}</p>}
        {t.kind === "bank_order" && t.status === "open" && !can(user, "orders.A") && <div className="note">Comanda o înregistrează cine poate adăuga comenzi: Secretariat, Administrator, sau cei agreați pe contractul cadru al băncii.</div>}
        <dl className="dl">
          {t.ref && <div><dt>Nr. comandă</dt><dd className="mono">{t.ref}</dd></div>}
          {t.client_name && <div><dt>Client</dt><dd>{t.client_name}</dd></div>}
          <div><dt>Email</dt><dd>{t.email_id && user.role === "owner" ? <a className="link" href={`${base}/setari/emailuri/${t.email_id}`}>{t.subject || "(fără subiect)"}</a> : t.subject || "—"}{t.mail_from ? ` · ${t.mail_from}` : ""}</dd></div>
        </dl>
        {t.body && <pre className="ibBody">{t.body}</pre>}
      </section>
    </CrmShell>
  );
}
