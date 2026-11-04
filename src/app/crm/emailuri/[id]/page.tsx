import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmtDate, staffPage } from "@/lib/guard";
import { CrmShell } from "@/components/CrmShell";
import { STATUS_LABEL, inboxEmail } from "@/lib/inbox";
import { isAdmin } from "@/lib/users";
import { EmailActions } from "./EmailActions";

export const metadata: Metadata = { title: "Email primit | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toLocaleString("ro-RO", { maximumFractionDigits: 1 })} MB`);

/** One email received: its text and attachments, the rule that took it and what it made; a rule can be made from it. */
export default async function InboxEmailPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, user, base } = await staffPage("orders");
  const { id } = await params;
  const e = await inboxEmail(db, id);
  if (!e) notFound();
  const [label, cls] = STATUS_LABEL[e.status] ?? [e.status, ""];
  return (
    <CrmShell back={{ href: `${base}/emailuri`, label: "Emailuri primite" }} user={user} base={base} active="inbox" title={e.subject || "(fără subiect)"}
      subtitle={`${e.mail_from ?? (e.via === "paste" ? `lipit în CRM${e.created_name ? ` de ${e.created_name}` : ""}` : "—")} · ${fmtDate(e.received_at, true)}`}>
      <div className="ibGrid">
        <section className="card">
          <div className="cardHead"><h2>Conținut</h2><span className="muted">{e.mail_to ? `către ${e.mail_to}` : ""}</span></div>
          <EmailActions email={e.id} body={e.body ?? ""} subject={e.subject ?? ""} from={e.mail_from ?? ""} base={base} admin={isAdmin(user)} />
          {e.files.length > 0 && (
            <div className="ibFiles">
              <b>Atașamente</b>
              <ul>{e.files.map((f) => <li key={f.id}><a className="link" href={`/api/crm/inbox/${e.id}?file=${f.id}`} target="_blank" rel="noreferrer">📎 {f.filename}</a> <span className="muted">{size(f.size_bytes)}</span></li>)}</ul>
            </div>
          )}
        </section>
        <aside className="card">
          <div className="cardHead"><h2>Ce s-a întâmplat</h2></div>
          <p><span className={`pill ${cls}`}><i />{label}</span></p>
          <dl className="dl">
            <div><dt>Regula</dt><dd>{e.rule_name ? (isAdmin(user) ? <a className="link" href={`${base}/emailuri/reguli?regula=${e.rule_id}`}>{e.rule_name}</a> : e.rule_name) : "niciuna nu s-a potrivit"}</dd></div>
            {e.bank_ref && <div><dt>Nr. comandă</dt><dd className="mono">{e.bank} {e.bank_ref}</dd></div>}
            {e.client_name && <div><dt>Client</dt><dd>{e.client_name}</dd></div>}
            {e.request_type && <div><dt>Tip cerere</dt><dd>{e.request_type}</dd></div>}
            {e.task && <div><dt>Task</dt><dd><a className="link" href={`${base}/emailuri/task/${e.task.id}`}>{e.task.title}</a><div className="muted">{e.task.status === "open" ? "deschis" : `${e.task.status === "done" ? "rezolvat" : "închis"}${e.task.done_name ? ` de ${e.task.done_name}` : ""} ${fmtDate(e.task.done_at, true)}${e.task.done_note ? ` · ${e.task.done_note}` : ""}`}</div></dd></div>}
            {e.order_id && <div><dt>Comanda</dt><dd><a className="link" href={`${base}/comenzi/${e.order_id}`}>deschide comanda</a></dd></div>}
          </dl>
          {e.status === "incomplete" && <div className="note">Regula s-a potrivit, dar nu a găsit numărul comenzii în email. Verifică tiparul „număr comandă” din regulă.</div>}
        </aside>
      </div>
    </CrmShell>
  );
}
