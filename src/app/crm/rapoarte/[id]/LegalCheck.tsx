"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { Issue, LegalCheck as Check, LegalResult, Progress } from "@/lib/legal-check";
import { GROUPS, groupOf, isProblem, verdictOf, type IssueGroup } from "@/lib/legal-groups";

const ro = (s: string | null) => (s ? s.slice(0, 10).split("-").reverse().join(".") : "");
const when = (s: string) => new Date(s).toLocaleString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const LEVEL: Record<Issue["level"], [string, string]> = { critic: ["Problemă", "lcCrit"], atentie: ["De verificat", "lcWarn"], info: ["Notă", "lcInfo"] };
const ENC: Record<string, string> = { ipoteca: "ipotecă", sechestru: "sechestru", litigiu: "litigiu", interdictie: "interdicție", servitute: "servitute", uzufruct: "uzufruct" };
const VERDICT: Record<LegalResult["verdict"], [string, string]> = {
  ok: ["Acte în regulă", "lcOk"], incomplete: ["De verificat", "lcWarn"], problems: ["Probleme în acte", "lcCrit"],
};

/** „1. Extras de carte funciară pentru informare nr. 12345 din 14.09.2026, emis de OCPI Timiș” */
const opisText = (r: LegalResult) => r.opis.map((o) => `${o.n}. ${o.title}${o.number ? ` nr. ${o.number}` : ""}${o.date ? ` din ${ro(o.date)}` : ""}${o.issuer ? `, emis de ${o.issuer}` : ""}`).join("\n");

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn btnGhost btnSm" disabled={!text} onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); } catch { /* the text stays selectable */ }
    }}>{done ? "Copiat ✓" : label}</button>
  );
}

/**
 * Analiză juridică (Acte & livrare): run on demand per asset; shows the verdict, the issues (each can be marked solved
 * or accepted, with a note), the inventory of the documents and the description of the ownership right to copy into
 * the report, the chain of ownership, the agreement between the documents and the request to send to the client.
 */
export function LegalCheck({ report, assets, checks, canRun, enabled }: {
  report: string; assets: { id: string; label: string; hasDocs: boolean }[]; checks: Check[]; canRun: boolean; enabled: boolean;
}) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [asset, setAsset] = useState(assets.find((a) => a.hasDocs)?.id ?? assets[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [right, setRight] = useState<Record<string, string>>({});
  const [note, setNote] = useState<{ key: string; state: "rezolvat" | "acceptat"; text: string } | null>(null);
  const check = checks.find((c) => c.asset_id === asset) ?? null;
  const r = check?.result ?? null;

  // while it runs: a status window, fed by the server's progress (asked every 1.5 s) and the time passed
  const [progress, setProgress] = useState<Progress | null>(null);
  const [started, setStarted] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!busy) return;
    let alive = true;
    const poll = async () => {
      const d = await fetch(`/api/crm/reports/${encodeURIComponent(report)}/legal?progress=${encodeURIComponent(asset)}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null) as { progress?: Progress | null } | null;
      if (alive && d?.progress) setProgress(d.progress);
    };
    poll();
    const a = setInterval(poll, 1500), b = setInterval(() => tick((x) => x + 1), 1000);
    return () => { alive = false; clearInterval(a); clearInterval(b); };
  }, [busy, report, asset]);

  const run = async () => {
    setBusy(true); setMsg(""); setProgress(null); setStarted(Date.now());
    const res = await fetch(`/api/crm/reports/${encodeURIComponent(report)}/legal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asset }) }).catch(() => null);
    const d = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    setBusy(false);
    if (!res?.ok) return setMsg(d?.error ?? "Analiza nu a putut rula. Încearcă din nou.");
    router.refresh();
    setShow(true);
  };
  useEffect(() => {
    if (!show) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !note) setShow(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [show, note]);
  const mark = async (key: string, state: "rezolvat" | "acceptat" | null, text: string | null) => {
    if (!check) return;
    await fetch(`/api/crm/reports/${encodeURIComponent(report)}/legal`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ check: check.id, key, state, note: text }) }).catch(() => null);
    setNote(null);
    router.refresh();
  };

  // a mortgage or another encumbrance is not a finding (older checks listed them): only mentioned, in the summary
  const issues = r ? r.issues.filter((i) => groupOf(i.key) !== "sarcini") : [];
  const open = check ? issues.filter((i) => !check.resolved[i.key]) : [];
  const verdict: LegalResult["verdict"] | null = r ? verdictOf(open) : null;
  const rightText = r ? right[check!.id] ?? r.rightText : "";
  const inGroup = (g: IssueGroup) => issues.filter((i) => groupOf(i.key) === g);
  // every finding about the chain marked solved / accepted: its breaks show as checked, not as problems
  const chainOk = !open.some((i) => groupOf(i.key) === "lant");
  const openIn = (g: IssueGroup) => open.filter((i) => groupOf(i.key) === g && (g === "dosar" || isProblem(i))).length;

  // the findings of a section: what is wrong, where it comes from, and the evaluator's mark (solved / accepted)
  const findings = (list: Issue[], none?: string) => !list.length ? (none ? <p className="lcNone">{none}</p> : null) : (
    <ul className="lcFind">
      {list.map((i) => {
        const done = check?.resolved[i.key];
        // the file's completeness is a note (older checks rated it higher)
        const [l, c] = LEVEL[groupOf(i.key) === "dosar" && !i.key.startsWith("read:") ? "info" : i.level];
        return (
          <li key={i.key} className={`${c}${done ? " lcDone" : ""}`}>
            <span className="lcDot" aria-hidden="true" />
            <span className="lcTxt">
              <b>{i.title}</b>
              <span>{i.detail}</span>
              <small>{done ? `${done.state === "rezolvat" ? "Rezolvat" : "Acceptat"} · ${done.by}, ${when(done.at)}${done.note ? ` · ${done.note}` : ""}` : `${l} · ${i.source}`}</small>
              {note?.key === i.key && (
                <span className="lcNote">
                  <input autoFocus placeholder={note.state === "rezolvat" ? "Cum s-a rezolvat (opțional)" : "De ce se acceptă (opțional)"} value={note.text} onChange={(e) => setNote({ ...note, text: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") mark(i.key, note.state, note.text); if (e.key === "Escape") setNote(null); }} />
                  <button type="button" className="btn btnPrimary btnSm" onClick={() => mark(i.key, note.state, note.text)}>Salvează</button>
                  <button type="button" className="btn btnGhost btnSm" onClick={() => setNote(null)}>Renunță</button>
                </span>
              )}
            </span>
            {canRun && (done
              ? <button type="button" className="linkBtn" onClick={() => mark(i.key, null, null)}>Redeschide</button>
              : note?.key !== i.key && <span className="lcMarks">
                <button type="button" className="linkBtn" onClick={() => setNote({ key: i.key, state: "rezolvat", text: "" })}>Rezolvat</button>
                <button type="button" className="linkBtn" onClick={() => setNote({ key: i.key, state: "acceptat", text: "" })}>Acceptat</button>
              </span>)}
          </li>
        );
      })}
    </ul>
  );

  const runOrOpen = () => (check ? setShow(true) : run());
  return (
    <>
      <div className="lcLaunch">
        {assets.length > 1 && (
          <select value={asset} onChange={(e) => setAsset(e.target.value)} aria-label="Bunul analizat">
            {assets.map((a) => <option key={a.id} value={a.id}>{a.label}{a.hasDocs ? "" : " (fără acte)"}</option>)}
          </select>
        )}
        <button type="button" className={`lcBtn${check ? " done" : ""}`} onClick={runOrOpen} disabled={busy || (!check && (!canRun || !enabled || !asset))}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v18M5 7h14M7 7l-3 7a3 3 0 0 0 6 0L7 7zm10 0-3 7a3 3 0 0 0 6 0l-3-7zM8 21h8" /></svg>
          <span><b>{busy ? "Se citesc actele…" : check ? "Analiză juridică ✓" : "Rulează analiza juridică"}</b>
            <small>{busy ? "de obicei sub un minut" : check && verdict ? `${VERDICT[verdict][0]} · ${when(check.created_at)}` : !enabled ? "citirea automată nu e configurată" : "dosar, termene, concordanță, lanț de proprietate"}</small></span>
        </button>
        {msg && !show && <p className="errTxt lcMsg">{msg}</p>}
      </div>
      {busy && createPortal(
        <div className="vfModal lcRunWrap" role="dialog" aria-modal="true" aria-labelledby="lcRunT" aria-busy="true">
          <div className="vfModalBox lcRun">
            <div className="lcRunHead">
              <span className="spinner" aria-hidden="true" />
              <span>
                <h2 id="lcRunT">Analiza juridică rulează</h2>
                <small role="status">{!progress ? "Pornesc…" : progress.step === "rules" ? "Verific lanțul de proprietate și concordanța actelor…" : `Citesc actele: ${progress.docs.filter((d) => d.state === "done" || d.state === "error").length} din ${progress.docs.length}`}
                  {" · "}{Math.floor((Date.now() - started) / 1000)} s</small>
              </span>
            </div>
            {progress && (
              <>
                <span className="lcRunBar"><i style={{ width: `${Math.round(((progress.docs.filter((d) => d.state === "done" || d.state === "error").length + (progress.step === "rules" ? 1 : 0)) / (progress.docs.length + 1)) * 100)}%` }} /></span>
                <ul className="lcRunDocs">
                  {progress.docs.map((d, k) => (
                    <li key={k} className={d.state}>
                      <span className="lcRunIco" aria-hidden="true">{d.state === "done" ? "✓" : d.state === "error" ? "!" : d.state === "read" ? <i /> : "·"}</span>
                      <span>{d.name}</span>
                      <small>{d.state === "done" ? "citit" : d.state === "error" ? "nu s-a putut citi" : d.state === "read" ? "se citește" : "în așteptare"}</small>
                    </li>
                  ))}
                  <li className={progress.step === "rules" ? "read" : "wait"}>
                    <span className="lcRunIco" aria-hidden="true">{progress.step === "rules" ? <i /> : "·"}</span>
                    <span>Lanț de proprietate, concordanță, greșeli</span>
                    <small>{progress.step === "rules" ? "se verifică" : "la final"}</small>
                  </li>
                </ul>
              </>
            )}
            <p className="hint">Actele citite o dată rămân citite: o nouă rulare durează doar cât actele noi.</p>
          </div>
        </div>,
        document.body,
      )}
      {show && r && check && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="lcT" onClick={(e) => { if (e.target === e.currentTarget) setShow(false); }}>
          <div className="vfModalBox lcBox0">
            <div className="lcModalHead">
              <h2 id="lcT">Analiză juridică</h2>
              <span className="lcHeadActs">
                {assets.length > 1 && (
                  <select value={asset} onChange={(e) => setAsset(e.target.value)} aria-label="Bunul analizat">
                    {assets.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </select>
                )}
                {canRun && enabled && <button type="button" className="btn btnGhost btnSm" onClick={run} disabled={busy}>{busy ? "Se citesc actele…" : "Rulează din nou"}</button>}
                <button type="button" className="btn btnGhost btnSm" onClick={() => setShow(false)} aria-label="Închide">✕</button>
              </span>
            </div>
            {msg && <p className="errTxt">{msg}</p>}
            <div className="lcScroll">
      {r && check && (
        <div className="lcBody lc2">
          <div className="lcSum">
            <div className="lcSumHead">
              <b className={`lcVerdict ${VERDICT[verdict!][1]}`}>{VERDICT[verdict!][0]}</b>
              <span className="lcEyebrow">{when(check.created_at)}{check.created_by_name ? ` · ${check.created_by_name}` : ""} · {check.docs_count} acte · referință {ro(r.refDate)}</span>
            </div>
            <div className="lcTiles">
              {GROUPS.map(([g, label]) => {
                const n = openIn(g), all = inGroup(g).length;
                const bad = g !== "dosar" && open.some((i) => groupOf(i.key) === g && i.level === "critic");
                return (
                  <a key={g} href={`#lc-${g}`} className={`lcTile${bad ? " bad" : n ? " note" : " ok"}`}>
                    <small>{label}</small>
                    <b>{n ? `${n} ${g === "dosar" ? "de completat" : n === 1 ? "problemă" : "probleme"}` : all ? "rezolvat" : "în regulă"}</b>
                  </a>
                );
              })}
            </div>
            <p className="lcFacts">
              <span><em>Proprietar</em>{r.owners.length ? r.owners.map((o) => `${o.name}${o.share ? ` (${o.share})` : ""}`).join(", ") : "—"}</span>
              <span><em>Sarcini</em>{r.encumbrances.length ? r.encumbrances.map((e) => `${ENC[e.kind] ?? "sarcină"}${e.beneficiary ? ` ${e.beneficiary}` : ""}${e.date ? ` (${e.date.slice(0, 4)})` : ""}`).join("; ") : "niciuna"}
                {r.encumbrances.length > 0 && <small> · se menționează în raport, nu e o problemă</small>}</span>
            </p>
          </div>

          <div className="lcCols">
            <div className="lcMain">
              <section id="lc-lant" className="lcSec">
                <h3>Lanțul de proprietate</h3>
                {r.chain.length === 0 ? <p className="hint">{r.owners.length ? `Actele citite nu descriu transmisiuni; proprietar actual în CF: ${r.owners.map((o) => o.name).join(", ")}.` : "Actele citite nu descriu transmisiuni de proprietate."}</p> : (
                  <ol className="lcTimeline">
                    {r.chain.map((st, k) => (
                      <li key={k} className={st.broken && !chainOk ? "broken" : st.broken || !st.registered ? "unreg" : ""}>
                        <span className="lcWhen">{st.date ? ro(st.date) : "fără dată"}</span>
                        <span className="lcStep">
                          <b>{st.from.length ? `${st.from.join(", ")} → ` : ""}{st.to.map((p) => `${p.name}${p.share ? ` (${p.share})` : ""}`).join(", ") || "—"}</b>
                          <small>{st.act}{st.number ? ` nr. ${st.number}` : ""}{st.issuer ? ` · ${st.issuer}` : ""}</small>
                        </span>
                        <span className={`lcTag ${st.broken && !chainOk ? "bad" : st.broken || !st.registered ? "warn" : "ok"}`}>{st.broken ? (chainOk ? "întrerupt · verificat" : "lanț întrerupt") : !st.registered ? "neintabulat" : "intabulat"}</span>
                      </li>
                    ))}
                  </ol>
                )}
                {findings(inGroup("lant"))}
              </section>

              <section id="lc-concordanta" className="lcSec">
                <h3>Concordanța între acte</h3>
                <div className="tableWrap">
                  <table className="table lcTable">
                    <thead><tr><th>Date</th>{r.concordance[0]?.values.map((v) => <th key={v.doc}>{v.doc}</th>)}</tr></thead>
                    <tbody>{r.concordance.filter((row) => row.values.some((v) => v.value)).map((row) => (
                      <tr key={row.field}><td><b>{row.field}</b></td>{row.values.map((v, k) => <td key={k} className={v.off ? "lcOff" : ""}>{v.value ?? <span className="muted">—</span>}</td>)}</tr>
                    ))}</tbody>
                  </table>
                </div>
                {findings(inGroup("concordanta"))}
              </section>

              <section id="lc-erori" className="lcSec">
                <h3>Greșeli în acte</h3>
                {findings(inGroup("erori"), "Nicio greșeală găsită în actele citite.")}
              </section>

              <section id="lc-dosar" className="lcSec lcMinor">
                <h3>De completat la dosar <small>nu blochează analiza</small></h3>
                {findings(inGroup("dosar"), "Dosarul e complet.")}
              </section>
            </div>

            <aside className="lcSide">
              <div className="lcBox">
                <div className="lcBoxHead"><b>Dreptul de proprietate</b><Copy text={rightText} label="Copiază" /></div>
                <textarea className="lcRight" rows={8} value={rightText} onChange={(e) => setRight({ ...right, [check.id]: e.target.value })} aria-label="Descrierea dreptului de proprietate" />
                <small className="muted">Îl poți corecta aici înainte de copiere.</small>
              </div>
              <div className="lcBox">
                <div className="lcBoxHead"><b>Opis acte</b><Copy text={opisText(r)} label="Copiază" /></div>
                {r.opis.length ? <ol className="lcOpis">{r.opis.map((o) => <li key={o.ref}><b>{o.title}</b>{o.number ? ` nr. ${o.number}` : ""}{o.date ? ` din ${ro(o.date)}` : ""}{o.issuer ? <span className="muted">, {o.issuer}</span> : null}</li>)}</ol>
                  : <p className="hint">Niciun act citit.</p>}
              </div>
              {r.clientRequest && (
                <div className="lcBox">
                  <div className="lcBoxHead"><b>Cerere către client</b><Copy text={r.clientRequest} label="Copiază" /></div>
                  <pre className="lcPre">{r.clientRequest}</pre>
                </div>
              )}
              <details className="lcBox lcDocs">
                <summary><b>Actele citite ({r.docs.length})</b></summary>
                <ul>{r.docs.map((d) => <li key={d.ref} className={d.ok ? "" : "lcDocBad"}><b>{d.title ?? d.name}</b><small>{d.ok ? [d.type, d.number && `nr. ${d.number}`, d.date && ro(d.date), d.issuer].filter(Boolean).join(" · ") : d.error}</small><small className="muted">{d.name}</small></li>)}</ul>
              </details>
            </aside>
          </div>
          <p className="hint lcFoot">Verificare asistată de AI pe actele încărcate, nu aviz juridic. Fiecare constatare arată actul din care provine; decizia îți aparține.</p>
        </div>
      )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
