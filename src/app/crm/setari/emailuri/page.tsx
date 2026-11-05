import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { fmtDate, staffPage } from "@/lib/guard";
import { CrmShell } from "@/components/CrmShell";
import { INBOX_TABS, STATUS_LABEL, inboxList } from "@/lib/inbox";
import { openTasks } from "@/lib/mail-rules";
import { BankMailPaste } from "../../comenzi/BankMailPaste";
import { TaskList } from "../../emailuri/TaskList";
import { SettingsTabs } from "../SettingsTabs";

export const metadata: Metadata = { title: "Emailuri primite | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** Emailuri primite: every email received (or pasted), what the rules made of it, and the tasks still open. */
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const { db, user, base } = await staffPage();
  if (user.role !== "owner") redirect(base || "/");
  const sp = await searchParams;
  const tab = INBOX_TABS.some(([k]) => k === sp.tab) ? sp.tab! : "toate";
  const q = (sp.q ?? "").slice(0, 80);
  const [{ rows, counts }, tasks] = await Promise.all([inboxList(db, tab, q), openTasks(db, user, true)]);
  const href = (t: string) => `${base}/setari/emailuri${t === "toate" ? "" : `?tab=${t}`}`;
  return (
    <CrmShell user={user} base={base} active="settings" title="Setări"
      subtitle={`Emailuri primite: ${(counts.toate ?? 0).toLocaleString("ro-RO")} · ${tasks.length} ${tasks.length === 1 ? "task deschis" : "task-uri deschise"}`}
      actions={<><a className="btn btnGhost btnSm" href={`${base}/setari/emailuri/reguli`}>Reguli</a><BankMailPaste base={base} /></>}>
      <SettingsTabs base={base} active="emailuri" user={user} />
      {tasks.length > 0 && <TaskList tasks={tasks} base={base} title="Task-uri deschise" />}
      <nav className="tabs" aria-label="Emailuri">
        {INBOX_TABS.map(([k, label]) => <a key={k} href={href(k)} aria-current={tab === k ? "page" : undefined}>{label} <small>{(counts[k] ?? 0).toLocaleString("ro-RO")}</small></a>)}
      </nav>
      <form className="ibSearch" action={`${base}/setari/emailuri`}>
        {tab !== "toate" && <input type="hidden" name="tab" value={tab} />}
        <input className="input" name="q" defaultValue={q} placeholder="Caută: expeditor, subiect, nr. comandă, client, text…" aria-label="Caută în emailuri" />
      </form>
      <section className="card flush">
        {rows.length === 0 ? <p className="hint pad">{q ? "Niciun email găsit." : tab === "fara" ? "Toate emailurile au o regulă." : "Niciun email încă. Emailurile redirecționate la adresa de primire apar aici."}</p> : (
          <div className="tableWrap">
            <table className="table ibTable">
              <thead><tr><th>Primit</th><th>De la · subiect</th><th>Regula · ce a găsit</th><th>Rezultat</th></tr></thead>
              <tbody>{rows.map((m) => {
                const [label, cls] = STATUS_LABEL[m.status] ?? [m.status, ""];
                return (
                  <tr key={m.id}>
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>{fmtDate(m.received_at, true)}{m.via === "paste" ? <div>lipit în CRM</div> : null}</td>
                    <td><a className="rowLink" href={`${base}/setari/emailuri/${m.id}`}><b>{m.subject || "(fără subiect)"}</b></a><div className="muted">{m.mail_from ?? "—"}{m.files ? ` · 📎 ${m.files}` : ""}</div></td>
                    <td>{m.rule_name ? <><b>{m.rule_name}</b><div className="muted mono">{[m.bank_ref, m.client_name].filter(Boolean).join(" · ") || "—"}</div></> : <span className="muted">—</span>}</td>
                    <td>
                      <span className={`pill ${cls}`}><i />{label}</span>
                      {m.task_id && <div><a className="link" href={`${base}/emailuri/task/${m.task_id}`}>{m.task_status === "open" ? "deschide task-ul" : m.task_status === "done" ? "task rezolvat" : "task închis"}</a></div>}
                      {m.report_id ? <div><a className="link" href={`${base}/rapoarte/${m.report_id}`}>vezi raportul</a></div>
                        : m.order_id && <div><a className="link" href={`${base}/comenzi/${m.order_id}`}>vezi comanda</a></div>}
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </section>
    </CrmShell>
  );
}
