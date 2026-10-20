import { niceName } from "@/lib/labels";
import { fmtDate } from "@/lib/guard";
import { cap, REPORT_STATUS, ROLE_LABEL, rowMembers, type ReportRow } from "@/lib/reports";
import { Avatar } from "@/components/Avatar";
import { fileSrc } from "@/lib/files";
import { SafeImg } from "./[id]/ReportActions";
import { issuerColor } from "@/lib/issuer-color";
import { daysOf, SEGMENTS, segmentsOf } from "@/lib/report-stage";
import { StageHelp } from "./StageHelp";
import { ClickRow } from "@/components/ClickRow";
import { HoverThumb } from "@/components/HoverThumb";

const SEG_LABEL = { done: "făcut", now: "în lucru", late: "întârziat", todo: "urmează" } as const;

/**
 * The reports table (the list, and the evaluator's dashboard). `sort` + `sortHref`: sortable headers;
 * `scope: false` leaves out the "Scop · tip valoare" column.
 */
export function ReportTable({ rows, base, today, sort, sortHref, scope = true }: {
  rows: ReportRow[]; base: string; today: string; sort?: string; sortHref?: (sort: string | undefined) => string; scope?: boolean;
}) {
  // A click on a column header sorts by it, first one way then the other (see COLUMN_SORTS).
  const Th = ({ k, label, children }: { k: string; label: string; children?: React.ReactNode }) => {
    if (!sortHref) return <th data-label={label}>{label}{children}</th>;
    const dir = sort === k ? "desc" : sort === `${k}-asc` ? "asc" : null;
    return (
      <th aria-sort={dir === "desc" ? "descending" : dir === "asc" ? "ascending" : "none"} data-label={label}>
        <a className={`thSort${dir ? " on" : ""}`} href={sortHref(dir === "desc" ? `${k}-asc` : dir === "asc" ? undefined : k)} title="Sortează după această coloană">
          {label}<i aria-hidden>{dir === "asc" ? "▲" : "▼"}</i>
        </a>
        {children}
      </th>
    );
  };
  return (
          <div className="tableWrap">
            <table className={`table repTable${scope ? "" : " noScope"}`}>
              <thead><tr>
                <Th k="nr" label="Raport" /><Th k="client" label="Client · utilizator" /><Th k="prop" label="Proprietate" />{scope && <Th k="scop" label="Scop · tip valoare" />}<Th k="echipa" label="Echipa" />
                <Th k="etapa" label="Etapă"><StageHelp /></Th>
                <Th k="status" label="Status" /><Th k="zile" label="Zile" />
              </tr></thead>
              <tbody>
                {rows.map((r) => {
                  const [label, cls] = REPORT_STATUS[r.status] ?? [r.status, ""];
                  const [type, address] = (r.asset ?? "|").split("|");
                  const own = /valuefy/i.test(r.issuer_name ?? "");
                  const logo = fileSrc(r.issuer_logo);
                  const short = (r.issuer_short ?? r.issuer_name ?? "?").slice(0, 2).toUpperCase();
                  const kind = !r.report_type || /^raport de evaluare$/i.test(r.report_type) ? "Raport" : r.report_type;
                  const team = rowMembers(r);
                  // The designated user (the bank): its logo, else its code; without one, the client's initials.
                  const bankLogo = fileSrc(r.bank_logo);
                  const bankShort = r.bank_name ? (r.bank_code ?? r.bank_name).slice(0, 3).toUpperCase() : (r.client_name ?? "—").split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase() || "—";
                  const { seg, caption } = segmentsOf(r, today);
                  const d = daysOf(r, today);
                  return (
                    <ClickRow key={r.id} href={`${base}/rapoarte/${r.id}`}>
                      <td style={{ borderLeft: `4px solid ${issuerColor(r.issuer_name, r.issuer_color)}`, "--stripe": issuerColor(r.issuer_name, r.issuer_color) } as React.CSSProperties}>
                        <a className="repCell rowLink" href={`${base}/rapoarte/${r.id}`} title={r.issuer_name ?? undefined}>
                          {logo ? <SafeImg src={logo} className="repLogo" fallback={<i className="repLogo" aria-hidden>{short}</i>} /> : <i className={`repLogo${own ? " own" : ""}`} aria-hidden>{short}</i>}
                          <span className="repText">
                            <small className={`repKind${kind === "Raport" ? "" : " isNote"}`}>{kind}</small>
                            <span className="repNo">{r.number ? <b className="mono">{r.number}</b> : <b className="muted">fără număr</b>}
                            {r.status !== "cancelled" && <i className={`paidDot${r.collected ? " on" : ""}`} title={r.collected ? `Achitat${r.collected_at ? ` · ${fmtDate(r.collected_at)}` : ""}` : "Neachitat"} aria-label={r.collected ? "Achitat" : "Neachitat"} role="img" />}</span>
                          </span>
                        </a>
                      </td>
                      <td>
                        <span className="repCell">
                          {bankLogo ? <SafeImg src={bankLogo} className="repLogo" fallback={<i className="repLogo" aria-hidden>{bankShort}</i>} /> : <i className="repLogo" aria-hidden>{bankShort}</i>}
                          <span className="two"><b>{niceName(r.client_name) || "—"}</b><small>{niceName(r.bank_name) || "fără utilizator desemnat"}</small></span>
                        </span>
                      </td>
                      <td style={{ minWidth: 160 }}>{(() => {
                        const ph = fileSrc(r.asset_photo);
                        const text = <div className="two"><b>{cap(type) || "—"}</b><small>{address}</small></div>;
                        return ph ? <div className="repAsset"><HoverThumb src={ph} alt={cap(type) || "Bun"} />{text}</div> : text;
                      })()}</td>
                      {scope && <td><div className="two nowrap"><b>{r.purpose || "—"}</b><small>{r.value_type || ""}</small></div></td>}
                      <td>
                        {team.length === 0 ? <span className="muted">—</span> : (
                          <span className="pStack" aria-label={team.map((m) => `${m.name} (${ROLE_LABEL[m.role] ?? m.role})`).join(", ")}>
                            {team.slice(0, 5).map((m) => <Avatar key={m.id + m.role} id={m.id} name={m.name} size={26} photo={m.photo} title={`${m.name} · ${(ROLE_LABEL[m.role] ?? m.role).toLowerCase()}`} />)}
                            {team.length > 5 && <i className="pMore">+{team.length - 5}</i>}
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="two">
                          <span className="steps" aria-label={seg.map((x, k) => `${SEGMENTS[k]}: ${SEG_LABEL[x]}`).join(", ")}>{seg.map((x, k) => <i key={k} className={x} />)}</span>
                          <small>{caption}</small>
                        </div>
                      </td>
                      <td>
                        <div className="two">
                          <span className={`pill ${cls}`}><i />{label}</span>
                          {r.status === "done" && r.report_date && <small className="repDate">raport din {fmtDate(r.report_date)}</small>}
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span className={`days${d.delivered ? " done" : d.late ? " late" : ""}`}>
                          <b>{d.days}</b>
                          <small>{d.delivered ? (d.late ? `predat cu +${d.over} ${d.over === 1 ? "zi" : "zile"}` : "predat în termen") : `din ${d.term} zile${d.late ? ` · +${d.over}` : ""}`}</small>
                        </span>
                      </td>
                    </ClickRow>
                  );
                })}
              </tbody>
            </table>
          </div>
  );
}
