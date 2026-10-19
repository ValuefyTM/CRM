import type { Metadata } from "next";
import { fmtDate, staffPage } from "@/lib/guard";
import { niceName } from "@/lib/labels";
import { anevarReports, anevarYears, getFreezes, getMarks, LINES, SPECS, totalsOf, type AnevarReport } from "@/lib/anevar";
import { CrmShell } from "@/components/CrmShell";
import { ClickRow } from "@/components/ClickRow";
import { AnevarCharts } from "./AnevarCharts";
import { MarkControls } from "./MarkControls";
import { FreezeControls } from "./FreezeControls";

export const metadata: Metadata = { title: "Monitorizare ANEVAR | CRM VALUEFY" };
export const dynamic = "force-dynamic";

type SP = { an?: string; f?: string; linie?: string; spec?: string; q?: string };
const FILTERS: [string, string][] = [["", "Toate declarate"], ["carried", "Reportate din anul anterior"], ["public", "Instituții publice"], ["check", "De verificat"], ["excluded", "Excluse"]];
const MAX_ROWS = 400;
const lei = (v: number) => `${Math.round(v).toLocaleString("ro-RO")} lei`;
const n = (v: number) => v.toLocaleString("ro-RO");

/** The yearly ANEVAR activity report (Anexa 4), live: the numbers, the charts, and every report behind them. */
export default async function AnevarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { db, user, base } = await staffPage("anevar");
  const sp = await searchParams;
  const [years, marks, freezes] = await Promise.all([anevarYears(db), getMarks(db), getFreezes(db)]);
  const thisYear = new Date().getFullYear();
  const choices = [...new Set([thisYear, ...years, ...freezes.keys()])].sort((a, b) => b - a);
  const year = choices.includes(Number(sp.an)) ? Number(sp.an) : thisYear;
  const pre = { marks, freezes };
  const [list, prev] = await Promise.all([anevarReports(db, year, pre), anevarReports(db, year - 1, pre)]);
  const t = totalsOf(list), tp = totalsOf(prev);
  const frozen = freezes.get(year) ?? null;
  const declared = list.filter((r) => !r.excluded);

  // charts
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, "0");
    const cur = declared.filter((r) => r.report_date.slice(5, 7) === m), old = prev.filter((r) => !r.excluded && r.report_date.slice(5, 7) === m);
    return { m: i + 1, n: cur.length, fee: cur.reduce((s, r) => s + (r.fee ?? 0), 0), prevN: old.length, prevFee: old.reduce((s, r) => s + (r.fee ?? 0), 0) };
  });
  const group = (key: (r: AnevarReport) => string | null, label = (k: string) => k) => {
    const m = new Map<string, { label: string; n: number; fee: number }>();
    for (const r of declared) {
      const k = key(r) ?? "—";
      const g = m.get(k) ?? { label: label(k), n: 0, fee: 0 };
      g.n++; g.fee += r.fee ?? 0; m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  };
  const top = (rows: { label: string; n: number; fee: number }[], max: number, other = "Altele") => {
    if (rows.length <= max) return rows;
    const rest = rows.slice(max - 1);
    return [...rows.slice(0, max - 1), { label: `${other} (${rest.length})`, n: rest.reduce((s, r) => s + r.n, 0), fee: rest.reduce((s, r) => s + r.fee, 0) }];
  };
  const banks = top(group((r) => r.bank, (k) => (k === "—" ? "Fără bancă / destinatar" : k)), 8);
  const evaluators = group((r) => r.evaluator_id, (k) => declared.find((r) => r.evaluator_id === k)?.evaluator ?? "Fără evaluator");
  const linesChart = LINES.map(([no, label]) => ({ label: `${no}. ${label}`, short: label.replace(/^Evaluare (pentru |de |în )?/, ""), n: t.lines[no].n, fee: t.lines[no].fee }));
  const specsChart = SPECS.map(([no, code, label]) => ({ label: `${code} · ${label}`, n: t.specs[no].n, fee: t.specs[no].fee }));

  // the evaluators of the year (question 6) with their ANEVAR numbers
  const team = new Map<string, { name: string; anevar: string | null; n: number; fee: number }>();
  for (const r of declared) {
    if (!r.evaluator_id) continue;
    const e = team.get(r.evaluator_id) ?? { name: r.evaluator ?? "", anevar: r.anevar_no, n: 0, fee: 0 };
    e.n++; e.fee += r.fee ?? 0; team.set(r.evaluator_id, e);
  }

  // the table
  const f = FILTERS.some(([k]) => k === sp.f) ? sp.f! : "";
  const line = Number(sp.linie) || null, spec = Number(sp.spec) || null;
  const q = sp.q?.trim().toLowerCase() ?? "";
  const rows = list.filter((r) => {
    if (f === "excluded") { if (!r.excluded) return false; } else if (r.excluded) return false;
    if (f === "carried" && !r.carried) return false;
    if (f === "public" && !r.publicClient) return false;
    if (f === "check" && !r.issues.length) return false;
    if (line && r.line !== line) return false;
    if (spec && r.spec !== spec) return false;
    if (q && !`${r.number ?? ""} ${r.label ?? ""} ${r.client ?? ""} ${r.purpose ?? ""} ${r.bank ?? ""} ${r.evaluator ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const checks = list.filter((r) => !r.excluded && r.issues.length).length;
  const link = (c: Partial<SP>) => {
    const next = { an: String(year), f, linie: sp.linie, spec: sp.spec, q: sp.q, ...c };
    const qs = Object.entries(next).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join("&");
    return `${base}/anevar${qs ? `?${qs}` : ""}`;
  };
  const only = (c: Partial<SP>) => link({ f: "", linie: undefined, spec: undefined, q: undefined, ...c });
  const title = f === "excluded" ? "Rapoarte excluse din raportare" : line ? `Linia ${line} · ${LINES.find(([k]) => k === line)?.[1]}` : spec ? `Specializarea ${spec} · ${SPECS.find(([k]) => k === spec)?.[2]}` : FILTERS.find(([k]) => k === f)?.[1] ?? "Rapoarte declarate";
  const delta = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null);
  const d = (v: number | null) => (v == null ? null : <span className={`dbDelta ${v >= 0 ? "up" : "down"}`}>{v >= 0 ? "↑" : "↓"} {Math.abs(v)}% față de {year - 1}</span>);

  return (
    <CrmShell user={user} base={base} active="anevar" title="Monitorizare ANEVAR" subtitle={`Raportul anual de activitate (Anexa 4) pe ${year}, calculat în timp real din rapoartele finalizate emise de VALUEFY`}
      actions={<FreezeControls year={year} frozen={frozen ? { at: frozen.frozen_at, by: frozen.frozen_by_name, note: frozen.note } : null} owner={user.role === "owner"} n={t.total.n} fee={t.total.fee} />}>
      <div className="anvTop">
        <nav className="segment anvYears" aria-label="Anul raportat">
          {choices.map((y) => <a key={y} href={only({ an: String(y) })} aria-current={y === year ? "page" : undefined}>{y}{freezes.has(y) && <small title="raportat și înghețat">🔒</small>}</a>)}
        </nav>
        {frozen ? (
          <p className="anvNote frozen"><b>Anul {year} este raportat și înghețat</b> din {fmtDate(frozen.frozen_at)}{frozen.frozen_by_name && ` de ${frozen.frozen_by_name}`}: s-au declarat {n(frozen.ids.size)} rapoarte.
            Rapoartele din {year} finalizate după aceea intră în raportarea pe {year + 1}.{frozen.note && <> · <i>{frozen.note}</i></>}</p>
        ) : (
          <p className="anvNote">Situația e vie: intră rapoartele <b>finalizate</b> cu data raportului în {year}{freezes.has(year - 1) && <>, plus cele din {year - 1} finalizate după înghețarea acelui an</>}. Când ai trimis raportul la ANEVAR, îngheață anul: ce se finalizează după aceea se raportează pe {year + 1}.</p>
        )}
      </div>

      <div className="dbKpis anvKpis">
        <a className="dbKpi" href={only({})}><span className="dbKpiLabel"><i style={{ background: "var(--ink)" }} />Rapoarte declarate</span><b>{n(t.total.n)}</b><small className="ctKpiFoot">emise de VALUEFY, în nume propriu {d(delta(t.total.n, tp.total.n))}</small></a>
        <a className="dbKpi" href={only({})}><span className="dbKpiLabel"><i style={{ background: "var(--acc)" }} />Cifra de afaceri</span><b className="ctKpiMoney">{lei(t.total.fee)}</b><small className="ctKpiFoot">onorarii fără TVA {d(delta(t.total.fee, tp.total.fee))}</small></a>
        <a className="dbKpi" href={only({ f: "carried" })}><span className="dbKpiLabel"><i style={{ background: "#2a5fb4" }} />Reportate din {year - 1}</span><b>{n(t.carried.n)}</b><small className="ctKpiFoot">{t.carried.n ? `${lei(t.carried.fee)} · finalizate după înghețarea anului ${year - 1}` : freezes.has(year - 1) ? "niciun raport finalizat după înghețare" : `anul ${year - 1} nu e înghețat încă`}</small></a>
        <a className="dbKpi" href={only({ f: "public" })}><span className="dbKpiLabel"><i style={{ background: "#1a8a60" }} />Instituții publice</span><b>{t.publicShare.n}% <small style={{ fontSize: 14 }}>/ {t.publicShare.fee}%</small></b><small className="ctKpiFoot">din lucrări / din cifra de afaceri (pct. 9)</small></a>
        <a className="dbKpi" href={only({})}><span className="dbKpiLabel"><i style={{ background: t.topClient && t.topClient.share > 30 ? "var(--err)" : "#8d4fd0" }} />Cel mai mare client</span><b>{t.topClient ? `${t.topClient.share}%` : "—"}</b><small className="ctKpiFoot">{t.topClient ? `${niceName(t.topClient.name)} · ${lei(t.topClient.fee)} (pct. 18: peste 30%?)` : "fără rapoarte"}</small></a>
        <a className="dbKpi" href={only({ f: checks ? "check" : "excluded" })}><span className="dbKpiLabel"><i style={{ background: checks ? "var(--err)" : "var(--ok)" }} />De verificat · excluse</span><b>{n(checks)} <small style={{ fontSize: 14 }}>/ {n(t.excluded.n)}</small></b><small className="ctKpiFoot">{checks ? "rapoarte fără tip, scop, onorariu sau evaluator" : "toate rapoartele sunt clasificate"} · {n(t.excluded.n)} scoase din raport</small></a>
      </div>

      <AnevarCharts year={year} months={months} lines={linesChart} specs={specsChart} banks={banks} evaluators={evaluators.slice(0, 8)} />

      <div className="anvForms">
        <section className="card">
          <div className="cardHead"><h2>Pe specializări</h2><span className="muted">Anexa 4, pct. 3 · rânduri 1–6</span></div>
          <div className="tableWrap"><table className="table anvForm">
            <thead><tr><th>Specializare</th><th style={{ textAlign: "right" }}>Rapoarte</th><th style={{ textAlign: "right" }}>Onorarii</th></tr></thead>
            <tbody>
              {SPECS.map(([no, code, label]) => (
                <ClickRow key={no} href={only({ spec: String(no) })} className={spec === no ? "sel" : t.specs[no].n ? "" : "dim"}>
                  <td><span className="anvNo">{no}</span> <a className="rowLink" href={only({ spec: String(no) })}>{label}</a> <small className="muted">{code}</small></td>
                  <td className="mono num" style={{ textAlign: "right" }}>{n(t.specs[no].n)}</td>
                  <td className="mono num" style={{ textAlign: "right" }}>{lei(t.specs[no].fee)}</td>
                </ClickRow>
              ))}
              <tr className="anvTotal"><td><span className="anvNo">6</span> Total (1+2+3+4+5)</td><td className="mono num" style={{ textAlign: "right" }}>{n(t.total.n)}</td><td className="mono num" style={{ textAlign: "right" }}>{lei(t.total.fee)}</td></tr>
            </tbody>
          </table></div>
        </section>
        <section className="card">
          <div className="cardHead"><h2>Pe tipuri de lucrări</h2><span className="muted">Anexa 4, pct. 3 · rânduri 7–18</span></div>
          <div className="tableWrap"><table className="table anvForm">
            <thead><tr><th>Tip de lucrare</th><th style={{ textAlign: "right" }}>Rapoarte</th><th style={{ textAlign: "right" }}>Onorarii</th></tr></thead>
            <tbody>
              {LINES.map(([no, label]) => (
                <ClickRow key={no} href={only({ linie: String(no) })} className={line === no ? "sel" : t.lines[no].n ? "" : "dim"}>
                  <td><span className="anvNo">{no}</span> <a className="rowLink" href={only({ linie: String(no) })}>{label}</a></td>
                  <td className="mono num" style={{ textAlign: "right" }}>{n(t.lines[no].n)}</td>
                  <td className="mono num" style={{ textAlign: "right" }}>{lei(t.lines[no].fee)}</td>
                </ClickRow>
              ))}
              <tr className="anvTotal"><td><span className="anvNo">18</span> Total (7…17)</td><td className="mono num" style={{ textAlign: "right" }}>{n(t.total.n)}</td><td className="mono num" style={{ textAlign: "right" }}>{lei(t.total.fee)}</td></tr>
            </tbody>
          </table></div>
        </section>
      </div>

      <div className="anvForms">
        <section className="card">
          <div className="cardHead"><h2>Evaluatorii anului</h2><span className="muted">pct. 5–6: personalul și colaboratorii, membri titulari ANEVAR</span></div>
          {team.size === 0 ? <div className="empty">Niciun raport cu evaluator principal.</div> : (
            <div className="tableWrap"><table className="table anvForm">
              <thead><tr><th>Evaluator</th><th>Nr. legitimație</th><th style={{ textAlign: "right" }}>Rapoarte</th><th style={{ textAlign: "right" }}>Onorarii</th></tr></thead>
              <tbody>
                {[...team.entries()].sort((a, b) => b[1].n - a[1].n).map(([id, e]) => (
                  <tr key={id}>
                    <td><a className="rowLink" href={`${base}/utilizatori/${id}`}><b>{e.name}</b></a></td>
                    <td className="mono">{e.anevar ?? <span className="errTxt">lipsă</span>}</td>
                    <td className="mono num" style={{ textAlign: "right" }}>{n(e.n)}</td>
                    <td className="mono num" style={{ textAlign: "right" }}>{lei(e.fee)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section>
        <section className="card anvHow">
          <div className="cardHead"><h2>Cum se calculează</h2></div>
          <ul className="anvRules">
            <li><b>Intră</b> rapoartele cu status „Finalizat” și data raportului în anul ales. Rapoartele anulate, suspendate sau în lucru nu se numără.</li>
            <li><b>Doar rapoartele emise de VALUEFY</b>, în nume propriu. Cele emise de firmele partenere (colaborări) nu se numără: le declară ele. Onorariul e cel fără TVA al raportului.</li>
            <li><b>Specializarea</b> vine din tipul de evaluare (EPI, EBM, EI, EIF, VE); fără tip se pune la proprietăți imobiliare și apare la „De verificat”.</li>
            <li><b>Tipul de lucrare</b> vine din scop: garantare → 8, impozitare → 11, raportare financiară → 7, expertiză / litigiu → 9, insolvență → 13, eșalonare datorii → 15, client instituție publică (UAT, ANAF) → 14, restul → 17.</li>
            <li>Orice raport poate fi <b>exclus</b> sau <b>mutat</b> pe altă linie din tabelul de mai jos; alegerea rămâne și după înghețare.</li>
            <li><b>Instituții publice</b> (pct. 9): clienți UAT / ANAF, fără impozitare, instanțe și garantări pentru CEC.</li>
          </ul>
        </section>
      </div>

      <section className="card" id="rapoarte">
        <div className="cardHead"><h2>{title}</h2><span className="muted">{n(rows.length)} rapoarte{rows.length > MAX_ROWS && ` · se arată primele ${MAX_ROWS}`}</span></div>
        <form className="filterBar" method="get" action={`${base}/anevar`}>
          <input type="hidden" name="an" value={year} />
          {sp.linie && <input type="hidden" name="linie" value={sp.linie} />}
          {sp.spec && <input type="hidden" name="spec" value={sp.spec} />}
          <span className="pillTabs anvFilters">
            {FILTERS.map(([k, l]) => <a key={k} href={link({ f: k })} aria-current={f === k ? "page" : undefined}>{l}</a>)}
          </span>
          <input className="search" name="q" defaultValue={sp.q ?? ""} placeholder="Caută nr. raport, client, bancă, evaluator… ↵" aria-label="Caută" />
          {(sp.linie || sp.spec || sp.q || f) && <a className="btn btnGhost btnSm" href={only({})}>✕ Toate</a>}
        </form>
        {rows.length === 0 ? <div className="empty">Niciun raport aici.</div> : (
          <div className="tableWrap">
            <table className="table anvRows">
              <thead><tr><th>Raport</th><th>Client · bancă</th><th>Scop · tip</th><th style={{ textAlign: "right" }}>Onorariu</th><th>Evaluator</th><th>În raportare</th></tr></thead>
              <tbody>
                {rows.slice(0, MAX_ROWS).map((r) => (
                  <tr key={r.id} className={r.excluded ? "anvOut" : r.issues.length ? "anvWarn" : undefined}>
                    <td><a className="ref rowLink" href={`${base}/rapoarte/${r.id}`}>{r.number ? `Nr. ${r.number}` : r.label ?? "fără număr"}</a>
                      <div className="muted">{fmtDate(r.report_date)}{r.carried && <> · <span className="pill pillInfo"><i />reportat din {r.year}</span></>}</div></td>
                    <td><b>{niceName(r.client) || "—"}</b><div className="muted">{[r.bank, r.publicClient && "instituție publică"].filter(Boolean).join(" · ")}</div></td>
                    <td>{r.purpose ?? <span className="errTxt">fără scop</span>}<div className="muted">{r.valuation_types ?? <span className="errTxt">fără tip</span>}</div>
                      {r.issues.length > 0 && <div className="anvIssue">{r.issues.join(" · ")}</div>}</td>
                    <td className="mono num" style={{ textAlign: "right" }}>{r.fee ? lei(r.fee) : <span className="errTxt">—</span>}</td>
                    <td>{r.evaluator ?? <span className="errTxt">—</span>}</td>
                    <td><MarkControls report={r.id} excluded={r.excluded} line={r.mark?.line ?? null} spec={r.mark?.spec ?? null} autoLine={r.autoLine} autoSpec={r.autoSpec} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </CrmShell>
  );
}
