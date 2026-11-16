import type { Metadata } from "next";
import { staffPage, fmtDate } from "@/lib/guard";
import { CrmShell } from "@/components/CrmShell";
import { apifyConfigured } from "@/lib/market/apify";
import { runProgress } from "@/lib/market/crawler";
import { marketStatus, sourceHealth } from "@/lib/market/search";
import { getMarketSettings, nextSlot } from "@/lib/market/settings";
import { SettingsTabs } from "../SettingsTabs";
import { ControlPanel, MarketSettingsForm } from "./ControlPanel";
import { Searches } from "../../piata/MarketClient";
import { CAT_LABEL } from "@/lib/registry-labels";
import { SOURCES } from "@/lib/market/sites";

export const metadata: Metadata = { title: "Setări · Analize de piață | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const RUN_STATUS: Record<string, string> = { running: "în desfășurare", done: "încheiată", stopped: "oprită" };

/** Control panel of the market listings: the state per site, run on demand, live progress, stop; the schedule; the history of runs. */
export default async function MarketSettingsPage() {
  const { db, user, base } = await staffPage("market:searches");
  const [progress, status, settings, health] = await Promise.all([runProgress(db), marketStatus(db), getMarketSettings(db), sourceHealth(db)]);
  const next = nextSlot(settings);
  const dueNext = status.searches.filter((s) => s.enabled && s.every_days > 0).length;
  const dur = (a: string, b: string | null) => { if (!b) return "—"; const m = Math.round((Date.parse(b) - Date.parse(a)) / 60_000); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
  const n = (v: unknown) => (Number(v) ? Number(v).toLocaleString("ro-RO") : "—");
  return (
    <CrmShell user={user} base={base} active="settings" title="Setări · Analize de piață" subtitle="Căutările pe portaluri și rulările: pornire la cerere, progres, oprire">
      <SettingsTabs base={base} active="piata" user={user} />
      {!apifyConfigured() && <div className="note">Lipsește secretul <b>APIFY_TOKEN</b> (Cloudflare → Workers → crm → Settings → Variables and Secrets): rulările nu pot porni.</div>}
      <section className="card">
        <div className="cardHead"><h2>Stare</h2>
          <span className="muted">{next ? <>Următoarea rulare programată: <b>{fmtDate(next.toISOString(), true)}</b> · {dueNext} căutări programate</> : "Rulările programate sunt oprite"}
            {" · "}luna aceasta: <b>{n(health.month.apify)}</b> rulări Apify în {health.month.runs} rulări</span>
        </div>
        <div className="tableWrap">
          <table className="table">
            <thead><tr><th>Sursă</th><th className="r">Căutări active</th><th className="r">Anunțuri active</th><th className="r">Noi (7 zile)</th><th className="r">Modificate (7 zile)</th><th className="r">Ieșite (7 zile)</th>
              <th className="r">Inactive</th><th className="r">Descărcări eșuate</th><th>Ultima rulare</th><th>Stare</th></tr></thead>
            <tbody>
              {health.sources.map((x) => (
                <tr key={x.source}>
                  <td><b>{x.source}</b></td>
                  <td className="r">{x.enabled}<span className="muted"> / {x.n}</span></td>
                  <td className="r"><b>{n(x.active)}</b></td><td className="r">{n(x.new7)}</td><td className="r">{n(x.changed7)}</td><td className="r">{n(x.out7)}</td>
                  <td className="r">{n(x.gone)}</td><td className="r">{n(x.failed)}</td>
                  <td>{x.last_run ? fmtDate(x.last_run, true) : "—"}</td>
                  <td>{!x.enabled ? <span className="pill">fără căutări active</span> : !x.last_run ? <span className="pill pillWarn">nerulată încă</span>
                    : x.errors ? <span className="pill pillErr mkTip" tabIndex={0}>{x.errors === 1 ? "o căutare cu probleme" : `${x.errors} căutări cu probleme`}
                      <span role="tooltip">{status.searches.filter((q) => q.source === x.source && q.enabled && q.last_error).map((q) => <span key={q.id}><b>{q.name}</b>{q.last_error}</span>)}</span></span> : <span className="pill pillOk">în regulă</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="cols" style={{ marginTop: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <ControlPanel searches={status.searches} initial={progress} base={base} />
          <section className="card">
            <h2>Căutări</h2>
            <p className="hint">Fiecare căutare e o pagină de rezultate de pe un site, copiată din browser cu filtrele dorite (zonă, tip, preț), plus categoria din CRM și tranzacția. Paginile se parcurg automat până la ultima; anunțurile apar în <a className="link" href={`${base}/piata`}>Analize de piață</a>.</p>
            <Searches rows={status.searches} sources={SOURCES} categories={Object.entries(CAT_LABEL)} edit />
          </section>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <section className="card">
            <h2>Setări</h2>
            <MarketSettingsForm initial={settings} />
          </section>
        </div>
      </div>
      <section className="card" style={{ marginTop: 18 }}>
        <h2>Istoric rulări</h2>
        {status.runs.length === 0 ? <p className="hint">Niciuna încă.</p> : (
          <div className="tableWrap">
            <table className="table">
              <thead><tr><th>Pornită</th><th>Tip</th><th>Stare</th><th className="r">Durată</th><th className="r">Pagini</th><th className="r">Văzute</th><th className="r">Noi</th><th className="r">Modificate</th>
                <th className="r">Expirate</th><th className="r">Dispărute</th><th className="r">Reapărute</th><th className="r">Eșuate</th><th className="r">Apify</th><th /></tr></thead>
              <tbody>
                {status.runs.map((r) => (
                  <tr key={r.id}>
                    <td><a className="link" href={`${base}/setari/piata/rulari/${r.id}`}><b>{fmtDate(r.started_at, true)}</b></a></td>
                    <td>{r.trigger === "manual" ? "la cerere" : "programată"}</td>
                    <td><span className={`pill ${r.status === "done" ? "pillOk" : r.status === "running" ? "pillWarn" : "pillErr"}`}>{RUN_STATUS[r.status] ?? r.status}</span>{r.note ? <div className="muted">{r.note}</div> : null}</td>
                    <td className="r">{dur(r.started_at, r.finished_at)}</td>
                    <td className="r">{n(r.stats.pagini)}</td><td className="r">{n(r.stats.anunturi_vazute)}</td><td className="r"><b>{n(r.stats.anunturi_noi)}</b></td><td className="r"><b>{n(r.stats.modificate)}</b></td>
                    <td className="r">{n(r.stats.expirate)}</td><td className="r">{n(r.stats.devenite_inactive)}</td><td className="r">{n(r.stats.reaparute)}</td>
                    <td className="r">{n((Number(r.stats.pagini_esuate) || 0) + (Number(r.stats.anunturi_esuate) || 0))}</td><td className="r">{n(r.stats.rulari_apify)}</td>
                    <td><a className="btn btnGhost btnSm" href={`${base}/setari/piata/rulari/${r.id}`}>Detalii</a></td>
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
