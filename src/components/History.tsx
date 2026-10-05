import { fmtDate } from "@/lib/guard";
import { ACTION_LABEL, type LogEntry } from "@/lib/history";

export function History({ log }: { log: LogEntry[] }) {
  return (
    <section className="card">
      <h2>Istoric</h2>
      {log.length === 0 ? <p className="hint">Nicio activitate încă.</p> : (
        <ul className="log">
          {log.map((l, i) => (
            <li key={i}>
              <time>{fmtDate(l.at, true)}</time>
              <span>
                <b>{ACTION_LABEL[l.action] ?? l.action}</b>
                {l.details && ` · ${l.details}`}
                {l.actor_name && <span className="muted"> · {l.actor_name}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
