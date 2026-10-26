"use client";

import { Fragment, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { Issue, LegalCheck as Check, LegalResult } from "@/lib/legal-check";

const ro = (s: string | null) => (s ? s.slice(0, 10).split("-").reverse().join(".") : "");
const when = (s: string) => new Date(s).toLocaleString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const LEVEL: Record<Issue["level"], [string, string]> = { critic: ["Critic", "lcCrit"], atentie: ["Atenție", "lcWarn"], info: ["Informativ", "lcInfo"] };
const VERDICT: Record<LegalResult["verdict"], [string, string]> = {
  ok: ["Dosar în regulă", "lcOk"], incomplete: ["De completat", "lcWarn"], problems: ["Probleme de rezolvat", "lcCrit"],
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

  const run = async () => {
    setBusy(true); setMsg("");
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

  const open = r ? r.issues.filter((i) => !check!.resolved[i.key]) : [];
  const count = (l: Issue["level"]) => open.filter((i) => i.level === l).length;
  const verdict: LegalResult["verdict"] | null = r ? (count("critic") ? "problems" : count("atentie") ? "incomplete" : "ok") : null;
  const rightText = r ? right[check!.id] ?? r.rightText : "";

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
            {busy && <p className="lcBusy">Citesc actele noi și verific dosarul din nou…</p>}
            {msg && <p className="errTxt">{msg}</p>}
            <div className="lcScroll">
      {r && check && (
        <div className="lcBody">
          <div className="lcTop">
            <div>
              <span className="lcEyebrow">Analiză din {when(check.created_at)}{check.created_by_name ? ` · ${check.created_by_name}` : ""} · {check.docs_count} acte · data de referință {ro(r.refDate)}</span>
              <b className={`lcVerdict ${VERDICT[verdict!][1]}`}>{VERDICT[verdict!][0]}</b>
            </div>
            <span className="lcPills">
              {count("critic") > 0 && <span className="lcPill lcCrit">{count("critic")} {count("critic") === 1 ? "critică" : "critice"}</span>}
              {count("atentie") > 0 && <span className="lcPill lcWarn">{count("atentie")} atenție</span>}
              {count("info") > 0 && <span className="lcPill lcInfo">{count("info")} informativ{count("info") === 1 ? "" : "e"}</span>}
              {r.issues.length - open.length > 0 && <span className="lcPill lcOk">{r.issues.length - open.length} închise</span>}
            </span>
          </div>

          {r.issues.length === 0 ? <p className="lcNone">Nicio problemă găsită în actele citite.</p> : (
            <ul className="lcIssues">
              {r.issues.map((i) => {
                const done = check.resolved[i.key];
                const [l, c] = LEVEL[i.level];
                return (
                  <li key={i.key} className={`${c}${done ? " lcDone" : ""}`}>
                    <span className="lcLvl">{done ? done.state === "rezolvat" ? "Rezolvat" : "Acceptat" : l}</span>
                    <span className="lcTxt"><b>{i.title}</b><span>{i.detail}</span>
                      {done && <small>{done.by}, {when(done.at)}{done.note ? ` · ${done.note}` : ""}</small>}
                      {note?.key === i.key && (
                        <span className="lcNote">
                          <input autoFocus placeholder={note.state === "rezolvat" ? "Cum s-a rezolvat (opțional)" : "De ce se acceptă (opțional)"} value={note.text} onChange={(e) => setNote({ ...note, text: e.target.value })}
                            onKeyDown={(e) => { if (e.key === "Enter") mark(i.key, note.state, note.text); if (e.key === "Escape") setNote(null); }} />
                          <button type="button" className="btn btnPrimary btnSm" onClick={() => mark(i.key, note.state, note.text)}>Salvează</button>
                          <button type="button" className="btn btnGhost btnSm" onClick={() => setNote(null)}>Renunță</button>
                        </span>
                      )}
                    </span>
                    <span className="lcSrc">
                      <small>{i.source}</small>
                      {canRun && (done
                        ? <button type="button" className="linkBtn" onClick={() => mark(i.key, null, null)}>Redeschide</button>
                        : note?.key !== i.key && <span className="lcMarks">
                          <button type="button" className="linkBtn" onClick={() => setNote({ key: i.key, state: "rezolvat", text: "" })}>Rezolvat</button>
                          <button type="button" className="linkBtn" onClick={() => setNote({ key: i.key, state: "acceptat", text: "" })}>Acceptat</button>
                        </span>)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="lcGrid">
            <div className="lcBox">
              <div className="lcBoxHead"><b>Opis acte</b><Copy text={opisText(r)} label="Copiază opisul" /></div>
              {r.opis.length ? <ol className="lcOpis">{r.opis.map((o) => <li key={o.ref}><b>{o.title}</b>{o.number ? ` nr. ${o.number}` : ""}{o.date ? ` din ${ro(o.date)}` : ""}{o.issuer ? <span className="muted">, emis de {o.issuer}</span> : null}</li>)}</ol>
                : <p className="hint">Niciun act citit.</p>}
            </div>
            <div className="lcBox">
              <div className="lcBoxHead"><b>Descrierea dreptului de proprietate</b><Copy text={rightText} label="Copiază textul" /></div>
              <textarea className="lcRight" rows={7} value={rightText} onChange={(e) => setRight({ ...right, [check.id]: e.target.value })} aria-label="Descrierea dreptului de proprietate" />
              <small className="muted">Generat din actele citite; îl poți corecta aici înainte de copiere.</small>
            </div>
          </div>

          <div className="lcBox">
            <div className="lcBoxHead"><b>Fluxul de proprietate</b><span className="muted">din CF partea a II-a și actele de transmisiune</span></div>
            {r.chain.length === 0 && r.owners.length === 0 ? <p className="hint">Actele citite nu descriu transmisiuni de proprietate.</p> : (
              <div className="lcChain">
                {r.chain.map((st, k) => (
                  <Fragment key={k}>
                    {k === 0 && st.from.length > 0 && <span className="lcNode lcPast"><b>{st.from.join(", ")}</b><small>proprietar anterior</small></span>}
                    <span className={`lcArrow${st.broken || !st.registered ? " bad" : ""}`}>
                      <small>{st.act}{st.number ? ` nr. ${st.number}` : ""}{st.date ? ` / ${st.date.slice(0, 4)}` : ""}</small>
                      <i aria-hidden="true" />
                      {(st.broken || !st.registered) && <small className="lcBad">{st.broken ? "lanț întrerupt" : "neintabulat"}</small>}
                    </span>
                    <span className={`lcNode${k === r.chain.length - 1 ? " lcNow" : st.broken ? " lcBroken" : ""}`}>
                      <b>{st.to.map((p) => p.name).join(", ") || "—"}</b>
                      <small>{st.to.map((p) => p.share).filter(Boolean).join(", ") || "cotă nescrisă"}{st.date ? ` · ${ro(st.date)}` : ""}</small>
                      {k === r.chain.length - 1 && <small className="lcNowTag">proprietar actual</small>}
                    </span>
                  </Fragment>
                ))}
                {r.chain.length === 0 && r.owners.length > 0 && <span className="lcNode lcNow"><b>{r.owners.map((o) => o.name).join(", ")}</b><small>{r.owners.map((o) => o.share).filter(Boolean).join(", ")}</small><small className="lcNowTag">proprietar actual (CF)</small></span>}
              </div>
            )}
            {r.encumbrances.length > 0 && (
              <ul className="lcEnc">{r.encumbrances.map((e, k) => <li key={k}><b>{e.kind === "ipoteca" ? "Ipotecă" : e.kind === "sechestru" ? "Sechestru" : e.kind === "litigiu" ? "Litigiu" : e.kind === "interdictie" ? "Interdicție" : e.kind === "servitute" ? "Servitute" : e.kind === "uzufruct" ? "Uzufruct" : "Sarcină"}</b>{e.beneficiary ? ` · ${e.beneficiary}` : ""}{e.date ? ` · ${ro(e.date)}` : ""}<small>{e.detail}</small></li>)}</ul>
            )}
          </div>

          <div className="lcBox">
            <div className="lcBoxHead"><b>Concordanța între acte</b><span className="muted">roșu: diferă de celelalte</span></div>
            <div className="tableWrap">
              <table className="table lcTable">
                <thead><tr><th>Date</th>{r.concordance[0]?.values.map((v) => <th key={v.doc}>{v.doc}</th>)}</tr></thead>
                <tbody>{r.concordance.filter((row) => row.values.some((v) => v.value)).map((row) => (
                  <tr key={row.field}><td><b>{row.field}</b></td>{row.values.map((v, k) => <td key={k} className={v.off ? "lcOff" : ""}>{v.value ?? <span className="muted">—</span>}{v.off ? " ≠" : ""}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
          </div>

          <div className="lcGrid">
            {r.clientRequest && (
              <div className="lcBox">
                <div className="lcBoxHead"><b>Cerere către client</b><Copy text={r.clientRequest} label="Copiază cererea" /></div>
                <pre className="lcPre">{r.clientRequest}</pre>
              </div>
            )}
            <details className="lcBox lcDocs">
              <summary><b>Actele citite ({r.docs.length})</b></summary>
              <ul>{r.docs.map((d) => <li key={d.ref} className={d.ok ? "" : "lcDocBad"}><b>{d.title ?? d.name}</b><small>{d.ok ? [d.type, d.number && `nr. ${d.number}`, d.date && ro(d.date), d.issuer].filter(Boolean).join(" · ") : d.error}</small><small className="muted">{d.name}</small></li>)}</ul>
            </details>
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
