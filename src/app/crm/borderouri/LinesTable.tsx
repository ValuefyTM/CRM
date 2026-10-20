// The lines of a statement (server component): what, from which report, the base and the rate, the amount; removed
// lines struck through, adjusted ones marked, each with its reason and who did it.
import { fmtDate } from "@/lib/guard";
import { SOURCE_LABEL, totalOf, type Line } from "@/lib/statement-labels";
import { LineActions } from "./LineActions";

export const lei2 = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lei`);
const day = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join(".") : "");

export function LinesTable({ lines, base, statement, canEdit, print = false }: { lines: Line[]; base: string; statement: string; canEdit: boolean; print?: boolean }) {
  if (!lines.length) return <p className="hint pad">Nicio linie: nimic nu intră în această lună după criteriile regulii.</p>;
  const adjusted = lines.filter((l) => l.removed || l.changed_at);
  return (
    <div className={print ? "" : "tableWrap"}>
      <table className={`table stLines${print ? " stPrint" : ""}`}>
        <thead><tr><th>#</th><th>Ce</th><th>Data</th><th>Bază · cotă</th><th style={{ textAlign: "right" }}>Suma</th>{canEdit && !print && <th />}</tr></thead>
        <tbody>
          {lines.map((l, i) => {
            const changed = !l.removed && l.changed_at && l.key;
            return (
              <tr key={l.id ?? l.key ?? i} className={l.removed ? "stRemoved" : changed || l.source === "manual" ? "stChanged" : ""}>
                <td className="muted">{i + 1}</td>
                <td>
                  <b>{l.report_id && !print ? <a className="link" href={`${base}/rapoarte/${l.report_id}`}>{l.label}</a> : l.label}</b>
                  <div className="muted">{[SOURCE_LABEL[l.source], l.detail].filter(Boolean).join(" · ")}</div>
                  {(l.reason || l.changed_at) && (
                    <div className={`stReason${l.removed ? " off" : ""}`}>
                      {l.removed ? "Scoasă" : l.source === "manual" ? "Adăugată" : `Modificată${l.auto_amount != null ? ` (calculat ${lei2(l.auto_amount)})` : ""}`}
                      {l.changed_name ? ` de ${l.changed_name}` : ""}{l.changed_at ? ` · ${fmtDate(l.changed_at, true)}` : ""}{l.reason ? `: ${l.reason}` : ""}
                    </div>
                  )}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>{day(l.on_date)}</td>
                <td style={{ whiteSpace: "nowrap" }} className="muted">{[l.base != null ? lei2(l.base) : null, l.rate].filter(Boolean).join(" × ") || "—"}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }} className="mono">{l.removed ? <s>{lei2(l.amount)}</s> : <b>{lei2(l.amount)}</b>}</td>
                {canEdit && !print && <td><LineActions statement={statement} line={l.id} lineKey={l.key} manual={!l.key} removed={!!l.removed} amount={l.amount} /></td>}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr><td colSpan={4} style={{ textAlign: "right" }}><b>Total</b>{adjusted.length > 0 && <span className="muted"> · {adjusted.length} {adjusted.length === 1 ? "ajustare" : "ajustări"}</span>}</td><td style={{ textAlign: "right" }} className="mono"><b>{lei2(totalOf(lines))}</b></td>{canEdit && !print && <td />}</tr>
        </tfoot>
      </table>
    </div>
  );
}
