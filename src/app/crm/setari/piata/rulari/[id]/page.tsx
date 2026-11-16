import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { staffPage, fmtDate } from "@/lib/guard";
import { CrmShell } from "@/components/CrmShell";
import { runDetail } from "@/lib/market/search";
import { MarketChanges } from "@/components/MarketChanges";
import { SettingsTabs } from "../../../SettingsTabs";

export const metadata: Metadata = { title: "Rulare · Analize de piață | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const RUN_STATUS: Record<string, string> = { running: "în desfășurare", done: "încheiată", stopped: "oprită" };
const TABS: [key: string, label: string][] = [["nou", "Adăugate"], ["modificat", "Modificate"], ["expirat", "Expirate"], ["disparut", "Dispărute"], ["reaparut", "Reapărute"], ["erori", "Erori"], ["cautari", "Pe căutări"]];
const LIMIT = 300;

const money = (v: number | null, c: string | null) => (v == null ? "—" : `${v.toLocaleString("ro-RO")} ${c ?? ""}`.trim());
/** One run of the market crawler: its figures, and the listings it added, changed, found expired, lost or found again. */
export default async function MarketRunPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { db, user, base } = await staffPage("market:searches");
  const { id } = await params;
  const want = (await searchParams).tab ?? "";
  const tab = TABS.some(([k]) => k === want) ? want : "nou";
  const d = await runDetail(db, id, tab, LIMIT);
  if (!d) notFound();
  const { run, counts, events } = d;
  const st = run.stats as Record<string, number>;
  const det = run.detail;
  const mins = run.finished_at ? Math.round((Date.parse(run.finished_at) - Date.parse(run.started_at)) / 60_000) : null;
  const count = (k: string) => (k === "erori" ? det?.errors.length ?? (Number(st.pagini_esuate) || 0) + (Number(st.anunturi_esuate) || 0) : k === "cautari" ? det?.searches.length ?? 0 : counts[k] ?? 0);
  const kpi = (label: string, v: unknown, foot?: string) => (
    <div className="dbKpi static"><span className="dbKpiLabel">{label}</span><b>{(Number(v) || 0).toLocaleString("ro-RO")}</b>{foot ? <span className="dbKpiFoot"><span className="dbDelta flat">{foot}</span></span> : null}</div>
  );
  const href = (k: string) => `${base}/setari/piata/rulari/${run.id}?tab=${k}`;
  return (
    <CrmShell user={user} base={base} active="settings" title={`Rularea din ${fmtDate(run.started_at, true)}`}
      subtitle={`${run.trigger === "manual" ? "La cerere" : "Programată"} · ${RUN_STATUS[run.status] ?? run.status}${run.note ? ` (${run.note})` : ""}${mins != null ? ` · ${mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`}` : ""}`}>
      <SettingsTabs base={base} active="piata" user={user} />
      <p><a className="link" href={`${base}/setari/piata`}>← Analize de piață: stare și istoric</a></p>
      <div className="dbKpis">
        {kpi("Pagini citite", st.pagini, `${st.anunturi_vazute ?? 0} anunțuri văzute`)}
        {kpi("Adăugate", counts.nou ?? 0, `${st.anunturi_noi ?? 0} găsite în liste`)}
        {kpi("Modificate", counts.modificat ?? 0, `${st.nemodificate ?? 0} nemodificate, sărite`)}
        {kpi("Expirate", counts.expirat ?? 0)}
        {kpi("Dispărute", counts.disparut ?? 0, `${counts.reaparut ?? 0} reapărute`)}
        {kpi("Eșuate", (Number(st.pagini_esuate) || 0) + (Number(st.anunturi_esuate) || 0), `${st.pagini_esuate ?? 0} pagini · ${st.anunturi_esuate ?? 0} anunțuri`)}
        {kpi("Rulări Apify", st.rulari_apify, st.amanate ? `${st.amanate} anunțuri amânate` : st.ramase_in_coada ? `${st.ramase_in_coada} rămase în coadă` : undefined)}
      </div>
      <section className="card" style={{ marginTop: 18 }}>
        <nav className="tabs" aria-label="Ce a făcut rularea">
          {TABS.map(([k, l]) => <a key={k} href={href(k)} aria-current={k === tab ? "page" : undefined}>{l} <small>{count(k)}</small></a>)}
        </nav>
        {tab === "cautari" ? (
          !det ? <p className="hint" style={{ marginTop: 12 }}>Rezumatul pe căutări se păstrează la închiderea rulării (pentru rulările de dinaintea acestei versiuni nu există).</p> : (
            <div className="tableWrap" style={{ marginTop: 12 }}>
              <table className="table">
                <thead><tr><th>Căutare</th><th className="r">Pagini</th><th className="r">Pagini eșuate</th><th className="r">Anunțuri văzute</th><th className="r">Descărcate</th><th className="r">Eșuate</th><th className="r">Rămase</th><th>Rezultat</th></tr></thead>
                <tbody>
                  {det.searches.map((s) => (
                    <tr key={s.id}>
                      <td><b>{s.name}</b><div className="muted">{s.source}</div></td>
                      <td className="r">{s.pages}</td><td className="r">{s.pages_err || "—"}</td><td className="r">{s.listings ?? 0}</td><td className="r">{s.det_done}</td><td className="r">{s.det_err || "—"}</td><td className="r">{s.left || "—"}</td>
                      <td>{s.complete === 1 ? <span className="pill pillOk">toate paginile</span> : <span className="pill pillWarn">incompletă</span>}{s.error ? <div style={{ color: "var(--err)" }}>{s.error}</div> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : tab === "erori" ? (
          !det ? <p className="hint" style={{ marginTop: 12 }}>Lista erorilor se păstrează la închiderea rulării.</p> : det.errors.length === 0 ? <p className="hint" style={{ marginTop: 12 }}>Nicio pagină eșuată.</p> : (
            <div className="tableWrap" style={{ marginTop: 12 }}>
              <table className="table">
                <thead><tr><th>Ce</th><th>Căutare</th><th>Pagina</th><th className="r">Încercări</th><th>Eroare</th></tr></thead>
                <tbody>
                  {det.errors.map((e, i) => (
                    <tr key={i}>
                      <td>{e.kind === "list" ? `pagina ${e.page ?? ""} de rezultate` : "anunț"}</td>
                      <td>{e.search}<div className="muted">{e.source}</div></td>
                      <td style={{ maxWidth: 420, overflowWrap: "anywhere" }}>{e.listing_id ? <a className="link" href={`${base}/piata/${e.listing_id}`}>{e.title ?? "anunț"}</a> : null} <a className="muted" href={e.url} target="_blank" rel="noreferrer">{e.url} ↗</a></td>
                      <td className="r">{e.attempts}</td>
                      <td style={{ color: "var(--err)" }}>{e.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : events.length === 0 ? <p className="hint" style={{ marginTop: 12 }}>Niciun anunț în această rulare.</p> : (
          <>
            <div className="tableWrap" style={{ marginTop: 12 }}>
              <table className="table">
                <thead><tr><th>Ora</th><th>Anunț</th><th>Sursă</th><th>Localizare</th><th className="r">Preț</th><th className="r">Suprafață</th>{tab === "modificat" && <th>Ce s-a schimbat</th>}</tr></thead>
                <tbody>
                  {events.map((e, i) => (
                    <tr key={i}>
                      <td className="muted" style={{ whiteSpace: "nowrap" }}>{new Date(e.at).toLocaleTimeString("ro-RO", { timeZone: "Europe/Bucharest", hour: "2-digit", minute: "2-digit" })}</td>
                      <td style={{ maxWidth: 380 }}><a className="link" href={`${base}/piata/${e.listing_id}`}><b>{e.title ?? "anunț"}</b></a>
                        <div className="muted">{e.search ?? "—"} · <a href={e.url} target="_blank" rel="noreferrer">pe site ↗</a></div></td>
                      <td>{e.source}</td>
                      <td>{[e.zone, e.city].filter(Boolean).join(", ") || "—"}</td>
                      <td className="r" style={{ whiteSpace: "nowrap" }}>{money(e.price, e.currency)}</td>
                      <td className="r">{e.area ? `${e.area.toLocaleString("ro-RO")} m²` : "—"}</td>
                      {tab === "modificat" && <td><MarketChanges json={e.changes} /></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {count(tab) > events.length && <p className="hint">Primele {events.length} din {count(tab)}.</p>}
          </>
        )}
      </section>
    </CrmShell>
  );
}
