// Compact list of reports (order page, report history of a property).
import { fmtDate } from "@/lib/guard";
import { cap, lei, REPORT_STATUS, type ReportRow } from "@/lib/reports";

export function ReportList({ reports, base, title, empty }: { reports: ReportRow[]; base: string; title: string; empty?: string }) {
  if (!reports.length && !empty) return null;
  return (
    <section className="card">
      <h2>{title}</h2>
      {reports.length === 0 ? <p className="hint">{empty}</p> : (
        <ul className="people">
          {reports.map((r) => {
            const [label, cls] = REPORT_STATUS[r.status] ?? [r.status, ""];
            const [type, address] = (r.asset ?? "|").split("|");
            return (
              <li key={r.id}>
                <span className="who">
                  <a className="rowLink" href={`${base}/rapoarte/${r.id}`}>{r.label ?? `Raport ${r.number ?? ""}`}</a>
                  <span className="muted">{[r.report_type, cap(type), address].filter(Boolean).join(" · ")}</span>
                  <span className="muted">{fmtDate(r.report_date)} · {r.evaluator ?? "—"} · {lei(r.result_value)}</span>
                </span>
                <span className={`pill ${cls}`}><i />{label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
