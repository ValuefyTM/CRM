// The open tasks from the emails received (server component): the bank's logo, the request, how long it has waited
// (red after 2 hours), who opened it; a click opens it (a bank order: "Comandă nouă", filled in).
import { fileSrc } from "@/lib/files";
import { REMIND_HOURS, type OpenTask } from "@/lib/mail-rules";

const age = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 60 ? `de ${m} min` : m < 1440 ? `de ${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `de ${Math.floor(m / 1440)} ${Math.floor(m / 1440) === 1 ? "zi" : "zile"}`;
};

export function TaskList({ tasks, base, title }: { tasks: OpenTask[]; base: string; title?: string }) {
  return (
    <section className="card tkCard">
      {title && <div className="cardHead"><h2>{title}</h2><span className="pill pillErr"><i />{tasks.length} {tasks.length === 1 ? "urgent" : "urgente"}</span></div>}
      <ul className="tkList">
        {tasks.map((t) => {
          const late = Date.now() - Date.parse(t.created_at) >= REMIND_HOURS * 3600e3;
          const logo = fileSrc(t.bank_logo);
          return (
            <li key={t.id} className={late ? "late" : ""}>
              <a href={`${base}/emailuri/task/${t.id}`}>
                <span className="tkLogo">{logo ? <img src={logo} alt="" /> : <b>{(t.bank_code || t.bank_name || "✉").slice(0, 3)}</b>}</span>
                <span className="tkTxt"><b>{t.title}</b><small>{t.kind === "bank_order" ? "Procesare comandă" : "Task din email"} · primit {age(t.created_at)}{t.opened_name ? ` · deschis de ${t.opened_name}` : ""}</small></span>
                <span className="tkGo">{t.kind === "bank_order" ? "Procesează →" : "Deschide →"}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
