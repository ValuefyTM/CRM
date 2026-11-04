// The lines of a statement (server component): what, from which report, the base and the rate, the amount; removed
// lines struck through, adjusted ones marked, each with its reason and who did it.
import { fmtDate } from "@/lib/guard";
import { SOURCE_LABEL, totalOf, type Line } from "@/lib/statement-labels";
import { LineActions } from "./LineActions";
import { AcceptAdjust } from "./AcceptAdjust";

export const lei2 = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lei`);
const day = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join(".") : "");

/**
 * `adjust`: the column of the firm's adjustments (amount and comment) — on a payout statement; `accept`: the
 * collaborator ticks each adjustment as accepted (their own statement); `locked`: issued.
 */
/** The distance tag of an inspection: green under 5 km, yellow 5–10 km, orange over 10 km (by road from the inspector's base address or the office). */
export function KmTag({ d }: { d: { km: number; road: boolean; from?: "base" | "office" } }) {
  const start = d.from === "base" ? "de la adresa inspectorului" : "de la sediu (adresa de corespondență)";
  const v = d.km.toLocaleString("ro-RO", { maximumFractionDigits: 1 });
  return <span className={`kmTag ${d.km < 5 ? "near" : d.km <= 10 ? "mid" : "far"}`}
    title={d.road ? `Distanța pe drum, cu mașina, ${start}` : `În linie dreaptă, ${start}: distanța pe drum se calculează la următoarea deschidere`}>{d.road ? "" : "≈ "}{v} km</span>;
}

export function LinesTable({ lines, base, statement, canEdit, print = false, adjust = false, accept = false, locked = false, banks, km, byKm = false }: {
  lines: Line[]; base: string; statement: string; canEdit: boolean; print?: boolean; adjust?: boolean; accept?: boolean; locked?: boolean;
  /** the designated user (bank / institution) of each report: the lines grouped by it, with subtotals */
  banks?: Record<string, string>;
  /** inspection → km from the office (the inspection lines show it as a coloured tag) */
  km?: Record<string, { km: number; road: boolean; from?: "base" | "office" }>;
  /** sorted by that distance, farthest first (one list, no grouping by bank) */
  byKm?: boolean;
}) {
  if (!lines.length) return <p className="hint pad">Nicio linie în această lună.</p>;
  const adjusted = lines.filter((l) => l.removed || l.changed_at);
  const col = adjust || adjusted.length > 0;
  const groupOf = (l: Line) => (l.report_id ? banks?.[l.report_id] || "Doar clientul (fără bancă)" : "Alte linii");
  // grouped: the banks by their total (biggest first), the other lines last
  const dist = (l: Line) => (l.inspection_id && km ? km[l.inspection_id] : undefined);
  const groups = byKm ? [{ g: "", lines: [...lines].sort((a, b) => (dist(b)?.km ?? -1) - (dist(a)?.km ?? -1)) }] : banks ? [...new Set(lines.map(groupOf))].map((g) => ({ g, lines: lines.filter((l) => groupOf(l) === g) }))
    .sort((a, b) => (a.g === "Alte linii" ? 1 : b.g === "Alte linii" ? -1 : totalOf(b.lines) - totalOf(a.lines))) : [{ g: "", lines }];
  const cols = 5 + (col ? 1 : 0) + (canEdit && !print ? 1 : 0);
  let n = 0;
  const diff = (l: Line) => {
    if (l.removed) return `− ${lei2(l.amount)} (scoasă)`;
    if (l.source === "manual") return `${l.amount >= 0 ? "+" : "−"} ${lei2(Math.abs(l.amount))} (adăugată)`;
    const d = Math.round((l.amount - (l.auto_amount ?? l.amount)) * 100) / 100;
    return d ? `${d > 0 ? "+" : "−"} ${lei2(Math.abs(d))}` : "modificată";
  };
  return (
    <div className={print ? "" : "tableWrap"}>
      <table className={`table stLines${print ? " stPrint" : ""}`}>
        <thead><tr><th>#</th><th>Ce</th><th>Data</th><th>Bază · cotă</th><th style={{ textAlign: "right" }}>Suma</th>{col && <th>Ajustare · comentariu</th>}{canEdit && !print && <th />}</tr></thead>
        {groups.map(({ g, lines: part }) => (
        <tbody key={g || "all"}>
          {g && <tr className="stBankHead"><td colSpan={cols}><b>{g}</b><span>{part.filter((l) => !l.removed).length} {part.filter((l) => !l.removed).length === 1 ? "linie" : "linii"} · <b className="mono">{lei2(totalOf(part))}</b></span></td></tr>}
          {part.map((l) => {
            const i = n++;
            const changed = !l.removed && l.changed_at && l.key;
            return (
              <tr key={l.id ?? l.key ?? i} className={l.removed ? "stRemoved" : changed || l.source === "manual" ? "stChanged" : ""}>
                <td className="muted">{i + 1}</td>
                <td>
                  <b>{l.report_id && !print ? <a className="link" href={`${base}/rapoarte/${l.report_id}`}>{l.label}</a> : l.label}</b>
                  {dist(l) && <> <KmTag d={dist(l)!} /></>}
                  <div className="muted">{[SOURCE_LABEL[l.source], l.detail].filter(Boolean).join(" · ")}</div>
                </td>
                <td style={{ whiteSpace: "nowrap" }}>{day(l.on_date)}</td>
                <td style={{ whiteSpace: "nowrap" }} className="muted">{[l.base != null ? lei2(l.base) : null, l.rate].filter(Boolean).join(" × ") || "—"}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }} className="mono">{l.removed ? <s>{lei2(l.amount)}</s> : <b>{lei2(l.amount)}</b>}</td>
                {col && (
                  <td className="stAdj">
                    {l.changed_at ? <>
                      <b className={`mono${l.removed || (l.amount < (l.auto_amount ?? l.amount)) ? " neg" : " pos"}`}>{diff(l)}</b>
                      {l.reason && <div>{l.reason}</div>}
                      <div className="muted">{l.changed_name ? `${l.changed_name} · ` : ""}{fmtDate(l.changed_at, true)}{!l.removed && l.auto_amount != null && l.source !== "manual" ? ` · calculat ${lei2(l.auto_amount)}` : ""}</div>
                      {accept && l.id && !print ? <AcceptAdjust statement={statement} line={l.id} accepted={!!l.accepted_at} locked={locked} />
                        : <div className={l.accepted_at ? "stAccepted" : "stPending"}>{l.accepted_at ? `✓ Acceptată ${fmtDate(l.accepted_at, true)}` : "Așteaptă acceptul colaboratorului"}</div>}
                    </> : <span className="muted">—</span>}
                  </td>
                )}
                {canEdit && !print && <td><LineActions statement={statement} line={l.id} lineKey={l.key} manual={!l.key} removed={!!l.removed} amount={l.amount} /></td>}
              </tr>
            );
          })}
        </tbody>
        ))}
        <tfoot>
          <tr><td colSpan={4} style={{ textAlign: "right" }}><b>Total</b>{adjusted.length > 0 && <span className="muted"> · {adjusted.length} {adjusted.length === 1 ? "ajustare" : "ajustări"}</span>}</td><td style={{ textAlign: "right" }} className="mono"><b>{lei2(totalOf(lines))}</b></td>{col && <td />}{canEdit && !print && <td />}</tr>
        </tfoot>
      </table>
    </div>
  );
}
