import type { Metadata } from "next";
import { staffPage } from "@/lib/guard";
import { isAdmin } from "@/lib/users";
import { dashboard, type Alert } from "@/lib/dashboard";
import { STAGE_LABEL } from "@/lib/dossier";
import { niceName } from "@/lib/labels";
import { CrmShell } from "@/components/CrmShell";
import { Avatar } from "@/components/Avatar";
import { TrendChart } from "./acasa/TrendChart";

export const metadata: Metadata = { title: "Acasă | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const P = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
const I = {
  plus: <svg {...P}><path d="M12 5v14M5 12h14" /></svg>,
  mail: <svg {...P}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>,
  user: <svg {...P}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>,
  inbox: <svg {...P}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" /></svg>,
  doc: <svg {...P}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>,
  team: <svg {...P}><circle cx="9" cy="8" r="3.5" /><path d="M2 20a7 7 0 0 1 14 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M22 20a7 7 0 0 0-4-6.3" /></svg>,
  clock: <svg {...P}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  alert: <svg {...P}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>,
  calendar: <svg {...P}><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M8 2v4M16 2v4M3 10h18" /></svg>,
  pin: <svg {...P}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>,
  arrow: <svg {...P}><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  check: <svg {...P}><path d="M20 6L9 17l-5-5" /></svg>,
};

const lei = (v: number) => `${Math.round(v).toLocaleString("ro-RO")}`;
const pct = (cur: number, prev: number) => (prev ? Math.round(((cur - prev) / prev) * 100) : null);
const SOURCE: Record<string, string> = { bank: "Bănci", collab: "Colaborări", partner: "Brokeri", client: "Portal clienți", site: "Site" };
const DONUT = ["#111111", "#f2a93b", "#1fa971", "#9a5f00", "#b3261e", "#a39d8f", "#e0931a", "#5a5a5a"];

function Delta({ cur, prev, unit = "%", invert = false, label }: { cur: number | null; prev: number | null; unit?: string; invert?: boolean; label: string }) {
  if (cur == null || prev == null) return <span className="dbDelta flat">— {label}</span>;
  const d = unit === "%" ? pct(cur, prev) : Math.round((cur - prev) * 10) / 10;
  if (d == null) return <span className="dbDelta flat">nou {label}</span>;
  const good = invert ? d <= 0 : d >= 0;
  return <span className={`dbDelta ${d === 0 ? "flat" : good ? "up" : "down"}`}>{d > 0 ? "↑" : d < 0 ? "↓" : "="} {Math.abs(d)}{unit === "%" ? "%" : ` ${unit}`} {label}</span>;
}

function Spark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <span className="dbSpark" aria-hidden>
      {values.map((v, i) => <i key={i} style={{ height: `${Math.max(6, (v / max) * 100)}%` }} className={i === values.length - 1 ? "now" : ""} />)}
    </span>
  );
}

function Donut({ parts }: { parts: { label: string; n: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.n, 0);
  const R = 52, C = 2 * Math.PI * R;
  let off = 0;
  return (
    <div className="dbDonut">
      <svg viewBox="0 0 140 140" role="img" aria-label={`Lucrări pe surse: ${parts.map((p) => `${p.label} ${p.n}`).join(", ")}`}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--cream-2)" strokeWidth="18" />
        {total > 0 && parts.map((p) => {
          const len = (p.n / total) * C;
          const el = <circle key={p.label} cx="70" cy="70" r={R} fill="none" stroke={p.color} strokeWidth="18" strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-off} transform="rotate(-90 70 70)" />;
          off += len;
          return el;
        })}
        <text x="70" y="68" textAnchor="middle" className="dbDonutN">{total}</text>
        <text x="70" y="86" textAnchor="middle" className="dbDonutL">lucrări</text>
      </svg>
      <ul>
        {parts.map((p) => (
          <li key={p.label}><i style={{ background: p.color }} /><span>{p.label}</span><b>{p.n}</b><small>{total ? Math.round((p.n / total) * 100) : 0}%</small></li>
        ))}
      </ul>
    </div>
  );
}

export default async function CrmHome() {
  const { db, user, base } = await staffPage();
  const d = await dashboard(db, base);
  const money = isAdmin(user);
  const first = user.name ? user.name.split(" ")[0] : "";
  const hour = Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/Bucharest" }));
  const hello = hour < 11 ? "Bună dimineața" : hour < 18 ? "Bună ziua" : "Bună seara";
  const dateLabel = new Date(`${d.today}T12:00:00Z`).toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const monthLabel = new Date(`${d.today}T12:00:00Z`).toLocaleDateString("ro-RO", { month: "long", timeZone: "UTC" });
  const alerts = d.alerts.filter((a) => a.count > 0);
  const urgent = alerts.filter((a) => a.tone === "err").reduce((s, a) => s + a.count, 0);
  const visitsToday = d.visits.filter((v) => !v.tomorrow).length;
  const spark = (k: "n" | "fees") => d.months.slice(-6).map((m) => m[k]);
  const maxLoad = Math.max(1, ...d.team.map((t) => t.open + t.inspections));
  const year = d.today.slice(0, 4);
  const sources = d.sources.map((s, i) => ({ label: SOURCE[s.k] ?? s.k, n: s.n, color: DONUT[i % DONUT.length] }));
  const quick: [string, string, React.ReactNode, string?][] = [
    ["Lucrare nouă", `${base}/comenzi/noua`, I.plus, "bancă sau colaborare"],
    ["Email bancă", `${base}/comenzi?tab=banci`, I.mail, "lipește comanda"],
    ["Comenzi", `${base}/comenzi`, I.inbox, d.newOrders.n ? `${d.newOrders.n} luna aceasta` : undefined],
    ["Rapoarte în lucru", `${base}/rapoarte?status=deschise`, I.doc, `${d.openCount} deschise`],
    ["Client nou", `${base}/clienti/nou`, I.user],
    ["Echipa", `${base}/utilizatori`, I.team],
  ];

  return (
    <CrmShell user={user} base={base} active="home" title="Acasă" subtitle={`Tablou de bord · ${dateLabel}`}>
      <section className="dbHello">
        <div className="dbHelloText">
          <span className="eyebrow">{dateLabel}</span>
          <h2>{hello}{first ? `, ${first}` : ""}.</h2>
          <p>
            Ai <a href={`${base}/rapoarte?status=deschise`}><b>{d.openCount}</b> rapoarte deschise</a>
            {d.late > 0 ? <>, dintre care <a href={`${base}/rapoarte?termen=depasit`} className="hot"><b>{d.late}</b> cu termenul depășit</a></> : ", toate în termen"}
            {visitsToday > 0 ? <>, și <b>{visitsToday}</b> {visitsToday === 1 ? "inspecție programată" : "inspecții programate"} azi.</> : ". Nicio inspecție programată azi."}
          </p>
        </div>
        <nav className="dbQuick" aria-label="Acțiuni rapide">
          {quick.map(([label, href, icon, sub]) => (
            <a key={label} href={href}><span className="ic">{icon}</span><span><b>{label}</b>{sub && <small>{sub}</small>}</span></a>
          ))}
        </nav>
      </section>

      <div className="dbKpis">
        <a className="dbKpi" href={`${base}/rapoarte?status=done&year=${year}`}>
          <span className="dbKpiLabel"><i style={{ background: "var(--ok)" }} />Rapoarte predate · {monthLabel}</span>
          <b>{d.delivered.n}</b>
          <span className="dbKpiFoot"><Delta cur={d.delivered.n} prev={d.delivered.pn} label="față de luna trecută" /><Spark values={spark("n")} /></span>
        </a>
        {money ? (
          <a className="dbKpi" href={`${base}/rapoarte?status=done&year=${year}&sort=fee`}>
            <span className="dbKpiLabel"><i style={{ background: "var(--acc)" }} />Onorarii predate · {monthLabel}</span>
            <b>{lei(d.delivered.fees)} <small>lei</small></b>
            <span className="dbKpiFoot"><Delta cur={d.delivered.fees} prev={d.delivered.pfees} label="față de luna trecută" /><Spark values={spark("fees")} /></span>
          </a>
        ) : (
          <a className="dbKpi" href={`${base}/rapoarte?status=deschise`}>
            <span className="dbKpiLabel"><i style={{ background: "var(--acc)" }} />Rapoarte deschise</span>
            <b>{d.openCount}</b>
            <span className="dbKpiFoot"><span className={`dbDelta ${d.late ? "down" : "up"}`}>{d.late ? `${d.late} întârziate` : "toate în termen"}</span></span>
          </a>
        )}
        <a className="dbKpi" href={`${base}/comenzi`}>
          <span className="dbKpiLabel"><i style={{ background: "var(--ink)" }} />Comenzi noi · {monthLabel}</span>
          <b>{d.newOrders.n}</b>
          <span className="dbKpiFoot"><Delta cur={d.newOrders.n} prev={d.newOrders.pn} label="față de luna trecută" /></span>
          {d.newOrders.split.length > 0 && <span className="dbSplit">{d.newOrders.split.map((s) => <span key={s.k}>{SOURCE[s.k]} <b>{s.n}</b></span>)}</span>}
        </a>
        <a className="dbKpi" href={`${base}/rapoarte?status=done&year=${year}`}>
          <span className="dbKpiLabel"><i style={{ background: "var(--acc-text)" }} />Timp mediu până la predare</span>
          <b>{d.turnaround.cur != null ? Math.round(d.turnaround.cur * 10) / 10 : "—"} <small>zile</small></b>
          <span className="dbKpiFoot"><Delta cur={d.turnaround.cur != null ? Math.round(d.turnaround.cur * 10) / 10 : null} prev={d.turnaround.prev != null ? Math.round(d.turnaround.prev * 10) / 10 : null} unit="zile" invert label="față de luna trecută" /></span>
        </a>
      </div>

      <div className="dbGrid">
        <section className="card">
          <div className="cardHead">
            <h2>De rezolvat {urgent > 0 && <span className="dbBadge err">{urgent} urgente</span>}</h2>
            <span className="muted">{alerts.length ? `${alerts.reduce((s, a) => s + a.count, 0)} lucruri în așteptare` : ""}</span>
          </div>
          {alerts.length === 0 ? (
            <div className="dbAllGood"><span>{I.check}</span><b>Totul e la zi.</b><small>Nicio întârziere, nicio comandă sau inspecție în așteptare.</small></div>
          ) : (
            <ul className="dbAlerts">
              {alerts.map((a: Alert) => (
                <li key={a.key} className={a.tone}>
                  <a className="dbAlertHead" href={a.href}>
                    <span className="ic">{a.tone === "err" ? I.alert : a.key === "alloc" || a.key === "stale" ? I.calendar : a.key === "docs" ? I.doc : a.key === "bank" ? I.mail : I.clock}</span>
                    <span className="t"><b>{a.title}</b><small>{a.hint}</small></span>
                    <span className="n">{a.count}</span>
                    <span className="go">{I.arrow}</span>
                  </a>
                  {a.items.length > 0 && (
                    <div className="dbAlertItems">
                      {a.items.slice(0, 3).map((it, i) => <a key={i} href={it.href}><b>{niceName(it.label)}</b>{it.sub && <small>{it.sub}</small>}</a>)}
                      {a.count > 3 && <a href={a.href} className="more">+{a.count - 3}</a>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="dbStack">
          <section className="card">
            <div className="cardHead"><h2>Flux rapoarte</h2><a className="link" href={`${base}/rapoarte?status=deschise`}>{d.openCount} deschise</a></div>
            <div className="dbFlow">
              {d.pipeline.map((p, i) => (
                <a key={p.stage} href={`${base}/rapoarte?etapa=${["inspectie", "redactare", "verificare"][i]}`} className="dbFlowStep">
                  <span className="k">{i + 1}</span>
                  <span className="l">{STAGE_LABEL[p.stage]}</span>
                  <b>{p.n}</b>
                  {p.late > 0 ? <small className="late">{p.late} întârziate</small> : <small>în termen</small>}
                  <span className="bar"><i style={{ width: `${d.openCount ? (p.n / d.openCount) * 100 : 0}%` }} /></span>
                </a>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="cardHead"><h2>Inspecții azi și mâine</h2><a className="link" href={`${base}/agenda-inspectii?vezi=calendar`}>Agenda inspecțiilor →</a></div>
            {d.visits.length === 0 ? <p className="hint">Nicio inspecție programată azi sau mâine.</p> : (
              <ul className="dbVisits">
                {d.visits.map((v) => (
                  <li key={v.id}>
                    <a href={v.report_id ? `${base}/rapoarte/${v.report_id}?tab=inspectii` : `${base}/rapoarte`}>
                      <span className={`dbTime${v.tomorrow ? " tm" : ""}`}><b>{v.scheduled_at.slice(11, 16)}</b><small>{v.tomorrow ? "mâine" : "azi"}</small></span>
                      <span className="t"><b>{v.type ? v.type.charAt(0) + v.type.slice(1).toLowerCase() : "Inspecție"}</b><small>{I.pin}{v.address ?? "—"}</small></span>
                      {v.inspector && v.inspector_id && <span className="who"><Avatar id={v.inspector_id} name={v.inspector} size={28} presence={v.presence} photo={v.photo} title={`${v.inspector} · ${v.seen}`} /></span>}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section className="card">
        <div className="cardHead"><h2>Evoluție pe 12 luni</h2><a className="link" href={`${base}/rapoarte?status=done`}>Toate rapoartele predate</a></div>
        <TrendChart months={d.months} money={money} base={base} />
      </section>

      <div className="dbGrid team">
        <section className="card flush">
          <div className="cardHead"><h2>Echipa</h2><a className="link" href={`${base}/utilizatori`}>{d.team.filter((t) => t.presence === "online").length} online acum</a></div>
          {d.team.length === 0 ? <p className="hint pad">Niciun evaluator sau inspector activ.</p> : (
            <div className="tableWrap">
              <table className="table dbTeam">
                <thead><tr><th>Membru</th><th>Încărcare</th><th className="r">În lucru</th><th className="r">Întârziate</th><th className="r">Predate</th><th className="r">Inspecții</th></tr></thead>
                <tbody>
                  {d.team.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <a className="dbMember" href={`${base}/utilizatori/${t.id}`}>
                          <Avatar id={t.id} name={t.name} size={36} presence={t.presence} photo={t.photo} title={`${t.name} · ${t.seen}`} />
                          <span><b>{t.name}</b><small>{t.role} · <span className={`pSeen ${t.presence}`}>{t.seen}</span></small></span>
                        </a>
                      </td>
                      <td><span className="dbLoad"><i style={{ width: `${((t.open + t.inspections) / maxLoad) * 100}%` }} className={t.late ? "hot" : ""} /></span></td>
                      <td className="r"><a className="dbNum" href={`${base}/rapoarte?evaluator=${t.id}&status=in_progress`}>{t.open}</a></td>
                      <td className="r">{t.late ? <a className="dbNum err" href={`${base}/rapoarte?evaluator=${t.id}&termen=depasit`}>{t.late}</a> : <span className="muted">0</span>}</td>
                      <td className="r"><a className="dbNum" href={`${base}/rapoarte?evaluator=${t.id}&status=done&year=${year}`}>{t.delivered}</a></td>
                      <td className="r">{t.inspections ? <span className="dbNum plain">{t.inspections}</span> : <span className="muted">0</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <div className="cardHead"><h2>Surse de lucru</h2><span className="muted">ultimele 90 de zile</span></div>
          {sources.length === 0 ? <p className="hint">Nicio comandă în ultimele 90 de zile.</p> : <Donut parts={sources} />}
          <a className="link" href={`${base}/comenzi`}>Vezi comenzile →</a>
        </section>
      </div>
    </CrmShell>
  );
}
