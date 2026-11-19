import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { staffPage, fmtDate } from "@/lib/guard";
import { CrmShell } from "@/components/CrmShell";
import { DONE_STAGE, STAGES, feeDue, isExpert, listCases, stagePill } from "@/lib/expert-cases";

export const metadata: Metadata = { title: "Expertize judiciare | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const FILTERS: [string, string][] = [["active", "Active"], ["apropiat", "Termen apropiat"], ["finalizate", "Finalizate"], ["toate", "Toate"]];

/** Expertize judiciare: the signed-in expert's own court cases (nobody else sees them). */
export default async function ExpertCasesPage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const { db, user, base } = await staffPage();
  if (!isExpert(user)) redirect(`${base}/?fara-acces=1`);
  const sp = await searchParams;
  const all = await listCases(db, user.id);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });
  const left = (d: string | null) => (d ? Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 864e5) : null);
  const active = all.filter((c) => c.stage < DONE_STAGE);
  const soon = active.filter((c) => { const k = left(c.next_on); return k != null && k <= 7; });
  const f = FILTERS.some(([k]) => k === sp.f) ? sp.f! : "active";
  const q = (sp.q ?? "").trim().toLowerCase();
  const rows = (f === "toate" ? all : f === "finalizate" ? all.filter((c) => c.stage === DONE_STAGE) : f === "apropiat" ? soon : active)
    .filter((c) => !q || [c.number, c.court, c.object, c.claimant, c.defendant].some((x) => (x ?? "").toLowerCase().includes(q)));
  const count: Record<string, number> = { active: active.length, apropiat: soon.length, finalizate: all.length - active.length, toate: all.length };
  const owed = all.filter((c) => c.stage >= 4).reduce((t, c) => t + feeDue(c), 0);
  const lei = (n: number) => `${Math.round(n).toLocaleString("ro-RO")} lei`;
  return (
    <CrmShell user={user} base={base} active="expert" title="Expertize judiciare" subtitle="Dosarele tale de expert tehnic judiciar · le vezi doar tu"
      actions={<><a className="btn btnGhost btnSm" href={`${base}/expertize/setari`}>Alerte și setări</a><a className="btn btnGold btnSm" href={`${base}/expertize/nou`}>+ Dosar nou</a></>}>
      <div className="dbKpis">
        <div className="dbKpi static"><span className="dbKpiLabel">Dosare active</span><b>{active.length}</b><span className="dbKpiFoot"><span className="dbDelta flat">din {all.length} în evidență</span></span></div>
        <div className="dbKpi static"><span className="dbKpiLabel">Termene în 7 zile</span><b style={soon.length ? { color: "var(--err)" } : undefined}>{soon.length}</b><span className="dbKpiFoot"><span className="dbDelta flat">judecată, depunere, răspuns</span></span></div>
        <div className="dbKpi static"><span className="dbKpiLabel">Rapoarte de depus</span><b>{active.filter((c) => c.stage < 4).length}</b><span className="dbKpiFoot"><span className="dbDelta flat">dosare înainte de depunere</span></span></div>
        <div className="dbKpi static"><span className="dbKpiLabel">Onorarii de încasat</span><b>{lei(owed)}</b><span className="dbKpiFoot"><span className="dbDelta flat">după depunerea raportului</span></span></div>
      </div>
      <section className="card" style={{ marginTop: 16 }}>
        <form className="xjBar" action={`${base}/expertize`}>
          {FILTERS.map(([k, l]) => <a key={k} className="xjChip" aria-current={f === k ? "true" : undefined} href={`${base}/expertize?f=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`}>{l} · {count[k]}</a>)}
          <input type="hidden" name="f" value={f} />
          <input className="xjSearch" name="q" defaultValue={sp.q ?? ""} placeholder="Caută după număr de dosar, instanță, parte…" aria-label="Caută" />
        </form>
        {rows.length === 0 ? <p className="hint">{all.length ? "Niciun dosar pentru filtrul ales." : "Încă nu ai niciun dosar. Adaugă primul din „+ Dosar nou”."}</p> : (
          <div className="tableWrap">
            <table className="table">
              <thead><tr><th>Dosar</th><th>Instanța</th><th>Obiect · părți</th><th>Stadiu</th><th>Următorul termen</th></tr></thead>
              <tbody>
                {rows.map((c) => {
                  const k = left(c.next_on);
                  return (
                    <tr key={c.id}>
                      <td><a className="link" href={`${base}/expertize/${c.id}`}><b className="mono">{c.number}</b></a><div className="muted">{c.appointed_on ? `numit ${fmtDate(c.appointed_on)}` : "fără dată de numire"}</div></td>
                      <td>{c.court ?? "—"}<div className="muted">{c.section}</div></td>
                      <td><b>{c.object ?? "—"}</b><div className="muted">{[c.claimant, c.defendant].filter(Boolean).join(" c. ") || "părți necompletate"}</div></td>
                      <td><span className={`pill ${stagePill(c.stage)}`}>{STAGES[c.stage]}</span></td>
                      <td>{c.next_on && k != null ? <><b style={{ color: k < 0 ? "var(--err)" : k <= 7 ? "var(--acc-text)" : undefined, whiteSpace: "nowrap" }}>{fmtDate(c.next_on)}</b>
                        <div className="muted">{c.next_title} · {k < 0 ? `depășit cu ${-k} ${k === -1 ? "zi" : "zile"}` : k === 0 ? "astăzi" : k === 1 ? "mâine" : `în ${k} zile`}</div></> : <span className="muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint">Dosarele sunt personale: fiecare expert judiciar le vede doar pe ale lui. Nici proprietarul, nici administratorii CRM-ului nu văd dosarele altui expert.</p>
      </section>
    </CrmShell>
  );
}
