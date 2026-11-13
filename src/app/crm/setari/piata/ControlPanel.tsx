"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RunProgress } from "@/lib/market/crawler";

type SearchRow = { id: string; name: string; source: string; enabled: number; active: number };
const time = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("ro-RO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const RUN_STATUS: Record<string, string> = { running: "în desfășurare", done: "încheiată", stopped: "oprită" };

/** Start on demand (all searches or the ticked ones), live progress, stop. While the panel is open and a run is going,
 * the page itself moves the queue on every few seconds (the cron does it every 5 minutes otherwise). */
export function ControlPanel({ searches, initial, base }: { searches: SearchRow[]; initial: RunProgress; base: string }) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"" | "start" | "stop">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pump, setPump] = useState(true);
  const pumping = useRef(false);
  const running = p.run?.status === "running";

  const refresh = useCallback(async (drive: boolean) => {
    if (pumping.current) return;
    pumping.current = true;
    try {
      const r = await fetch("/api/crm/market/progress", { method: drive ? "POST" : "GET" });
      if (r.ok) setP(await r.json());
    } catch { /* network: next time */ } finally { pumping.current = false; }
  }, []);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") refresh(pump); }, 4000);
    refresh(pump);
    return () => clearInterval(t);
  }, [running, pump, refresh]);

  const start = async (ids?: string[]) => {
    setBusy("start"); setMsg(null);
    const r = await fetch("/api/crm/market", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ids?.length ? { searches: ids } : {}) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { searches?: number; error?: string };
    setBusy("");
    setMsg(r?.ok ? { ok: true, text: `Pornită pentru ${d.searches ?? 0} căutări.` } : { ok: false, text: d?.error ?? "Nu am putut porni rularea." });
    setPick(new Set());
    await refresh(false);
    router.refresh();
  };
  const stop = async () => {
    if (!confirm("Oprești rularea? Ce s-a descărcat rămâne; anunțurile din coadă se descarcă la rularea următoare.")) return;
    setBusy("stop");
    await fetch("/api/crm/market", { method: "DELETE" }).catch(() => null);
    setBusy("");
    await refresh(false);
    router.refresh();
  };
  const toggle = (id: string) => setPick((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const t = p.totals;
  const detTotal = t.det_done + t.det_open + t.det_err;
  return (
    <>
      <section className="card">
        <div className="cardHead">
          <h2>Rulare {p.run ? <small className="muted">· {RUN_STATUS[p.run.status] ?? p.run.status}</small> : null}</h2>
          <span className="actions">
            {running
              ? <button type="button" className="btn btnGhost btnSm" onClick={stop} disabled={!!busy}>{busy === "stop" ? "Se oprește…" : "Oprește rularea"}</button>
              : <button type="button" className="btn btnGold btnSm" onClick={() => start()} disabled={!!busy}>{busy === "start" ? "Se pornește…" : "Pornește acum (toate căutările active)"}</button>}
          </span>
        </div>
        {msg && <div role="status" className={msg.ok ? "okMsg" : "error"}>{msg.text}</div>}
        {!p.run ? <p className="hint">Încă nu a rulat nicio dată.</p> : (
          <>
            <div className="dbKpis" style={{ marginTop: 12 }}>
              <div className="dbKpi static">
                <span className="dbKpiLabel"><i style={{ background: "var(--ink)" }} />Pagini de rezultate</span>
                <b>{t.pages_done}</b>
                <span className="dbKpiFoot"><span className="dbDelta flat">{t.pages_open ? `${t.pages_open} în lucru` : "toate citite"}</span></span>
              </div>
              <div className="dbKpi static">
                <span className="dbKpiLabel"><i style={{ background: "var(--ok)" }} />Anunțuri descărcate</span>
                <b>{t.det_done}<small className="muted"> / {detTotal}</small></b>
                <span className="dbKpiFoot"><span className="rgBar"><i style={{ width: `${pct(t.det_done, detTotal)}%` }} /></span><span className="dbDelta flat">{pct(t.det_done, detTotal)}%</span></span>
              </div>
              <div className="dbKpi static">
                <span className="dbKpiLabel"><i style={{ background: "var(--acc)" }} />În coadă</span>
                <b>{t.det_open}</b>
                <span className="dbKpiFoot"><span className="dbDelta flat">{t.running} rulări Apify acum{t.det_err ? ` · ${t.det_err} eșuate` : ""}</span></span>
              </div>
              <div className="dbKpi static">
                <span className="dbKpiLabel"><i style={{ background: "var(--acc-text)" }} />Timp rămas</span>
                <b style={{ fontSize: 20 }}>{running ? (p.eta_min != null ? `~${p.eta_min} min` : "se calculează…") : "—"}</b>
                <span className="dbKpiFoot"><span className="dbDelta flat">pornită {time(p.run.started_at)}{p.run.finished_at ? ` · gata ${time(p.run.finished_at)}` : ""}</span></span>
              </div>
            </div>
            {running && (
              <label className="check" style={{ marginTop: 10 }}>
                <input type="checkbox" checked={pump} onChange={(e) => setPump(e.target.checked)} />
                Avansează rularea din această pagină cât e deschisă (mai repede; altfel o avansează cronul, la fiecare 5 minute)
              </label>
            )}
            <div className="tableWrap" style={{ marginTop: 12 }}>
              <table className="table">
                <thead><tr><th>Căutare</th><th className="r">Pagini</th><th className="r">Anunțuri văzute</th><th className="r">Descărcate</th><th className="r">În coadă</th><th className="r">Eșuate</th><th>Stare</th></tr></thead>
                <tbody>
                  {p.searches.map((s) => (
                    <tr key={s.id}>
                      <td><b>{s.name}</b><div className="muted">{s.source}</div></td>
                      <td className="r">{s.pages_done}{s.pages_open ? <span className="muted"> +{s.pages_open}</span> : null}</td>
                      <td className="r">{s.listings ?? 0}</td>
                      <td className="r">{s.det_done}</td>
                      <td className="r">{s.det_open}</td>
                      <td className="r">{s.det_err + s.pages_err || "—"}</td>
                      <td>{s.pages_open ? "citește paginile" : s.det_open ? "descarcă anunțurile" : s.complete === 1 ? "gata · toate paginile" : s.error ? <span style={{ color: "var(--err)" }}>{s.error}</span> : "gata"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {Object.keys(p.run.stats).length > 0 && (
              <p className="hint" style={{ marginTop: 10 }}>
                {[["anunturi_noi", "noi"], ["modificate", "modificate"], ["nemodificate", "nemodificate (sărite)"], ["expirate", "expirate"], ["devenite_inactive", "dispărute"], ["grupuri_duplicate", "grupuri de duplicate"], ["rulari_apify", "rulări Apify"]]
                  .filter(([k]) => p.run!.stats[k] != null).map(([k, l]) => `${p.run!.stats[k]} ${l}`).join(" · ")}
              </p>
            )}
          </>
        )}
      </section>

      {p.recent.length > 0 && (
        <section className="card">
          <h2>Ultimele procesate</h2>
          <ul className="mkFeed">
            {p.recent.map((r, i) => (
              <li key={i}>
                <span className="muted">{time(r.at)}</span>
                <span className={`pill ${r.status === "error" ? "pillErr" : r.status === "running" ? "pillWarn" : ""}`}>{r.status === "running" ? "în lucru" : r.status === "error" ? "eșuat" : r.kind === "list" ? "pagină" : "descărcat"}</span>
                <span>{r.listing_id ? <a href={`${base}/piata/${r.listing_id}`}>{r.title ?? "anunț"}</a> : r.kind === "list" ? "pagină de rezultate" : "—"} <small className="muted">{r.source}</small>{r.error ? <small style={{ color: "var(--err)" }}> · {r.error}</small> : null}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!running && (
        <section className="card">
          <div className="cardHead"><h2>Rulează doar anumite căutări</h2>
            <button type="button" className="btn btnNavy btnSm" disabled={!pick.size || !!busy} onClick={() => start([...pick])}>Pornește {pick.size ? `(${pick.size})` : ""}</button>
          </div>
          <ul className="mkSearches">
            {searches.map((s) => (
              <li key={s.id} className={s.enabled ? "" : "muted"}>
                <label className="check"><input type="checkbox" checked={pick.has(s.id)} onChange={() => toggle(s.id)} disabled={!s.enabled} />
                  <span><b>{s.name}</b> <span className="pill">{s.source}</span> <small className="muted">{s.active} active{s.enabled ? "" : " · oprită"}</small></span></label>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** The nightly run on / off and how many Apify runs in parallel. */
export function MarketSettingsForm({ initial }: { initial: { nightly: boolean; concurrency: number } }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async () => {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/crm/market/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }).catch(() => null);
    setBusy(false);
    setMsg(r?.ok ? { ok: true, text: "Setările au fost salvate." } : { ok: false, text: "Nu s-au putut salva." });
    router.refresh();
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label className="check"><input type="checkbox" checked={f.nightly} onChange={(e) => setF({ ...f, nightly: e.target.checked })} />Rulare automată în fiecare noapte (01:07)</label>
      <label className="field">Rulări Apify în paralel <small>(cât permite planul Apify; mai multe = mai repede, dar consumă mai multă memorie din cont)</small>
        <select className="input" value={f.concurrency} onChange={(e) => setF({ ...f, concurrency: Number(e.target.value) })}>
          {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <button type="button" className="btn btnNavy btnSm" style={{ alignSelf: "flex-start" }} onClick={save} disabled={busy}>{busy ? "Se salvează…" : "Salvează"}</button>
      {msg && <div role="status" className={msg.ok ? "okMsg" : "error"}>{msg.text}</div>}
    </div>
  );
}
