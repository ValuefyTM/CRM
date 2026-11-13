import type { Metadata } from "next";
import { staffPage, fmtDate } from "@/lib/guard";
import { CrmShell } from "@/components/CrmShell";
import { apifyConfigured } from "@/lib/market/apify";
import { runProgress } from "@/lib/market/crawler";
import { marketStatus } from "@/lib/market/search";
import { getMarketSettings } from "@/lib/market/settings";
import { SettingsTabs } from "../SettingsTabs";
import { ControlPanel, MarketSettingsForm } from "./ControlPanel";
import { Searches } from "../../piata/MarketClient";
import { CAT_LABEL } from "@/lib/registry-labels";
import { SOURCES } from "@/lib/market/sites";

export const metadata: Metadata = { title: "Setări · Analize de piață | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const RUN_STATUS: Record<string, string> = { running: "în desfășurare", done: "încheiată", stopped: "oprită" };

/** Control panel of the market listings: run on demand, live progress, stop; nightly run and parallel runs. */
export default async function MarketSettingsPage() {
  const { db, user, base } = await staffPage("market:searches");
  const [progress, status, settings] = await Promise.all([runProgress(db), marketStatus(db), getMarketSettings(db)]);
  return (
    <CrmShell user={user} base={base} active="settings" title="Setări · Analize de piață" subtitle="Căutările pe portaluri și rulările: pornire la cerere, progres, oprire">
      <SettingsTabs base={base} active="piata" user={user} />
      {!apifyConfigured() && <div className="note">Lipsește secretul <b>APIFY_TOKEN</b> (Cloudflare → Workers → crm → Settings → Variables and Secrets): rulările nu pot porni.</div>}
      <div className="cols">
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
          <section className="card">
            <h2>Rulări anterioare</h2>
            {status.runs.length === 0 ? <p className="hint">Niciuna încă.</p> : (
              <dl className="kv">
                {status.runs.map((r) => (
                  <div key={r.id}>
                    <dt>{fmtDate(r.started_at, true)}<div className="muted">{r.trigger === "manual" ? "la cerere" : "noaptea"} · {RUN_STATUS[r.status] ?? r.status}</div></dt>
                    <dd>{r.stats.anunturi_noi ?? 0} noi · {r.stats.modificate ?? 0} modificate<div className="muted">{r.stats.rulari_apify ?? 0} rulări Apify</div></dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        </div>
      </div>
    </CrmShell>
  );
}
