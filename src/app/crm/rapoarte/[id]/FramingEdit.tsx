"use client";
// "Încadrare evaluare" corrected on the report's page (orders entered wrong): purpose, value type, kind, date, currency
// and the designated user (a bank, an IFN, a company…). The user is required unless only the client uses the report.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { fold } from "@/lib/places";

export type Party = { id: string; name: string; kind: string | null; logo: string | null };
export type Framing = {
  purpose: string; value_type: string; report_type: string; valuation_types: string; valuation_date: string; currency: string; bank_branch: string;
};

const KIND: Record<string, string> = { person: "Persoană fizică", company: "Persoană juridică", bank: "Bancă", ifn: "IFN", uat: "Instituție publică", anaf: "ANAF", broker: "Broker", other: "Altă entitate" };
const VAL_KINDS: [string, string][] = [["EPI", "EPI — proprietăți imobiliare"], ["EBM", "EBM — bunuri mobile"], ["EI", "EI — întreprinderi"], ["EIF", "EIF — instrumente financiare"]];
const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

function Logo({ p }: { p: Party }) {
  const [bad, setBad] = useState(false);
  return p.logo && !bad ? <img src={p.logo} alt="" className="rcLogo" onError={() => setBad(true)} /> : <i className="rcLogo">{initials(p.name)}</i>;
}

export function FramingEdit({ id, initial, client, recipient, parties, purposes, valueTypes, reportTypes }: {
  id: string; initial: Framing; client: Party | null; recipient: Party | null; parties: Party[];
  purposes: string[]; valueTypes: string[]; reportTypes: string[];
}) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(initial);
  const [onlyClient, setOnlyClient] = useState(!recipient);
  const [user, setUser] = useState<Party | null>(recipient);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Party[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const set = (k: keyof Framing) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  // Companies / persons found by name (the institutions are listed already).
  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) { setHits([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/crm/clients/search?q=${encodeURIComponent(s)}`, { signal: ctl.signal }).then((r) => r.json() as Promise<{ results?: { id: string; kind: string; name: string }[] }>)
        .then((d) => setHits((d.results ?? []).filter((h) => !parties.some((p) => p.id === h.id)).slice(0, 8).map((h) => ({ id: h.id, name: h.name, kind: h.kind, logo: null }))))
        .catch(() => {});
    }, 220);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, parties]);
  const list = useMemo(() => {
    const s = fold(q.trim());
    return [...(s ? parties.filter((p) => fold(p.name).includes(s)) : parties), ...hits];
  }, [q, parties, hits]);
  const missingUser = !onlyClient && !user;
  const reset = () => { setF(initial); setOnlyClient(!recipient); setUser(recipient); setQ(""); setMsg(""); };
  const save = async () => {
    if (missingUser) return setMsg("Alege utilizatorul desemnat sau bifează „Doar clientul”.");
    if (!f.purpose.trim()) return setMsg("Alege scopul evaluării.");
    setBusy(true); setMsg("");
    const r = await fetch(`/api/crm/reports/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ framing: { ...f, client_only: onlyClient, recipient_id: onlyClient ? null : user?.id } }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r?.ok) return setMsg(d.error ?? "Nu s-a salvat.");
    location.reload();
  };
  const opts = (xs: string[], cur: string) => [...new Set([...xs, ...(cur ? [cur] : [])])];
  return (
    <>
      <button type="button" className="btn btnGhost btnSm" onClick={() => { reset(); setOpen(true); }}>Editează</button>
      {open && createPortal(
        <div className="vfModal sheet" role="dialog" aria-modal="true" aria-labelledby="frTitle" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="vfModalBox frBox">
            <div className="cardHead"><h2 id="frTitle">Încadrare evaluare</h2><button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(false)} aria-label="Închide">×</button></div>
            <div className="frGrid">
              <label className="field">Scop
                <select className="select" value={f.purpose} onChange={set("purpose")} aria-invalid={!f.purpose || undefined}>
                  <option value="">— alege —</option>
                  {opts(purposes, f.purpose).map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </label>
              <label className="field">Tip valoare
                <select className="select" value={f.value_type} onChange={set("value_type")}>
                  <option value="">—</option>
                  {opts(valueTypes, f.value_type).map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </label>
              <label className="field">Tip raport
                <select className="select" value={f.report_type} onChange={set("report_type")}>
                  <option value="">—</option>
                  {opts(reportTypes, f.report_type).map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </label>
              <label className="field">Tip evaluare
                <select className="select" value={f.valuation_types} onChange={set("valuation_types")}>
                  <option value="">—</option>
                  {[...VAL_KINDS, ...(f.valuation_types && !VAL_KINDS.some(([k]) => k === f.valuation_types) ? [[f.valuation_types, f.valuation_types] as [string, string]] : [])]
                    .map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              <label className="field">Data evaluării<input className="input" type="date" value={f.valuation_date} onChange={set("valuation_date")} /></label>
              <label className="field">Monedă
                <select className="select" value={f.currency} onChange={set("currency")}><option value="RON">RON</option><option value="EUR">EUR</option></select>
              </label>
            </div>

            <div className="frUser">
              <span className="fLabel">Utilizator desemnat <small>(obligatoriu, dacă nu e doar clientul)</small></span>
              <label className="check frOnly">
                <input type="checkbox" checked={onlyClient} onChange={(e) => setOnlyClient(e.target.checked)} />
                <span>Doar clientul{client ? ` (${client.name})` : ""} folosește raportul</span>
              </label>
              {!onlyClient && (user ? (
                <div className="frPicked"><Logo p={user} /><span><b>{user.name}</b><small>{user.kind ? KIND[user.kind] ?? user.kind : ""}</small></span>
                  <button type="button" className="linkBtn" onClick={() => setUser(null)}>schimbă</button></div>
              ) : (
                <div className={`frPick${missingUser ? " invalid" : ""}`}>
                  <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută banca, IFN-ul sau firma…" aria-label="Caută utilizatorul" aria-invalid={missingUser || undefined} autoFocus />
                  <div className="frList" role="listbox" aria-label="Utilizatori">
                    {list.map((p) => (
                      <button key={p.id} type="button" role="option" aria-selected={false} className="frItem" onClick={() => { setUser(p); setQ(""); }}>
                        <Logo p={p} /><span><b>{p.name}</b><small>{p.kind ? KIND[p.kind] ?? p.kind : ""}</small></span>
                      </button>
                    ))}
                    {!list.length && <p className="hint" style={{ margin: 8 }}>Nimic găsit. Banca sau firma se adaugă din Clienți.</p>}
                  </div>
                </div>
              ))}
              {!onlyClient && (
                <label className="field">Agenție / sucursală <small>(opțional)</small><input className="input" value={f.bank_branch} onChange={set("bank_branch")} /></label>
              )}
            </div>
            {msg && <div role="alert" className="error">{msg}</div>}
            <div className="actions">
              <button type="button" className="btn btnNavy" disabled={busy || missingUser} onClick={save}>{busy ? "Se salvează…" : "Salvează"}</button>
              <button type="button" className="btn btnGhost" onClick={() => setOpen(false)}>Renunță</button>
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}
