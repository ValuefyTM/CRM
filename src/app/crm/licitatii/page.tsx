import type { Metadata } from "next";
import { can } from "@/lib/perms";
import { staffPage, fmtDate } from "@/lib/guard";
import { getRules, lastRun, listTenders, TENDER_STATUS } from "@/lib/tenders";
import { CrmShell } from "@/components/CrmShell";
import { RulesForm, RunNow, TenderStatus } from "./TenderClient";

export const metadata: Metadata = { title: "Licitații SEAP | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const TABS: [string, string][] = [["open", "Active"], ["new", "Noi"], ["analyze", "De analizat"], ["bid", "Participăm"], ["skip", "Respinse"], ["all", "Toate"]];
const lei = (n: number | null) => (n == null ? null : `${Math.round(n).toLocaleString("ro-RO")} lei`);

/** Calls for bids on SEAP for valuations (town halls and other institutions), read every morning. */
export default async function TendersPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { db, user, base } = await staffPage("tenders");
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.s) ? sp.s! : "open";
  const [{ rows, counts }, rules, run] = await Promise.all([listTenders(db, tab), getRules(db), lastRun(db)]);
  const total = (k: string) => (k === "all" ? Object.values(counts).reduce((a, b) => a + b, 0) : k === "open" ? (counts.new ?? 0) + (counts.analyze ?? 0) + (counts.bid ?? 0) : counts[k] ?? 0);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <CrmShell user={user} base={base} active="tenders" title="Licitații SEAP" subtitle="Anunțuri de evaluare de la primării și alte instituții, citite în fiecare dimineață din e-licitatie.ro">
      <div className="cols">
        <section className="card" style={{ minWidth: 0 }}>
          <nav className="segment ibStates ordStates" aria-label="Status">
            {TABS.map(([k, l]) => <a key={k} href={`${base}/licitatii${k === "open" ? "" : `?s=${k}`}`} aria-current={tab === k ? "page" : undefined}>{l} <small>{total(k)}</small></a>)}
          </nav>
          {rows.length === 0 ? (
            <p className="hint">{total("all") ? "Nimic aici." : "Încă nu a fost găsit niciun anunț. Prima verificare rulează dimineața; o poți porni și acum cu „Verifică acum”."}</p>
          ) : (
            <ul className="tdList">
              {rows.map((t) => {
                const [label, cls] = TENDER_STATUS[t.status] ?? [t.status, ""];
                const dl = t.deadline_at?.slice(0, 10) ?? null;
                const days = dl ? Math.round((Date.parse(dl) - Date.parse(today)) / 864e5) : null;
                return (
                  <li key={t.id}>
                    <div className="tdHead">
                      <span className={`pill ${cls}`}><i />{label}</span>
                      {t.kind === "direct" && <span className="pill">Achiziție directă</span>}
                      {dl && <span className={`pill ${days != null && days < 0 ? "" : days != null && days <= 5 ? "pillErr" : "pillWarn"}`}>{days != null && days < 0 ? "Termen expirat" : `Termen ${fmtDate(dl)}${days != null ? ` · ${days} zile` : ""}`}</span>}
                    </div>
                    <a className="tdTitle" href={t.url ?? "#"} target="_blank" rel="noreferrer">{t.title} ↗</a>
                    <span className="tdMeta">{[t.authority, t.county].filter(Boolean).join(" · ")}</span>
                    <span className="tdMeta">{[lei(t.value_ron) && `valoare estimată ${lei(t.value_ron)}`, t.cpv, t.procedure, t.notice_no && `nr. ${t.notice_no}`, t.published_at && `publicat ${fmtDate(t.published_at.slice(0, 10))}`].filter(Boolean).join(" · ")}</span>
                    {t.match_reason && <small className="muted">Găsit după {t.match_reason}</small>}
                    <TenderStatus id={t.id} status={t.status} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <section className="card">
            <div className="cardHead"><h2>Verificare</h2>{can(user, "tenders:rules") && <RunNow />}</div>
            {run ? (
              <dl className="kv">
                <div><dt>Ultima verificare</dt><dd>{fmtDate(run.at, true)}</dd></div>
                <div><dt>Rezultat</dt><dd>{run.ok ? `${run.fetched} anunțuri citite · ${run.matched} potrivite · ${run.added} noi` : <span style={{ color: "var(--err)" }}>{run.error}</span>}</dd></div>
              </dl>
            ) : <p className="hint">Încă nu a rulat nicio verificare.</p>}
            {run?.sample && can(user, "tenders:rules") && (
              <details><summary className="hint">Exemplu de rând SEAP (pentru verificare tehnică)</summary><pre className="tdRaw">{run.sample}</pre></details>
            )}
          </section>
          <section className="card">
            <h2>Criterii</h2>
            <RulesForm initial={rules} edit={can(user, "tenders:rules")} />
          </section>
        </div>
      </div>
    </CrmShell>
  );
}
