"use client";
// What can be done with an offer: mark it sent / accepted / declined, reopen, delete, and convert it into work
// (direct, with a classic contract, or an order under a collaboration), choosing the team.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PersonPicker, type PickPerson } from "@/components/PersonPicker";

type Collab = { id: string; firm: string; number: string | null };
const SENT_VIA: [string, string][] = [["email", "Email"], ["whatsapp", "WhatsApp"], ["phone", "Telefon"], ["meeting", "La birou / întâlnire"]];

async function patch(id: string, body: Record<string, unknown>) {
  const r = await fetch(`/api/crm/quotes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const d = (await r?.json().catch(() => ({}))) as { error?: string };
  return r?.ok ? null : d.error ?? "Nu am putut salva.";
}

export function QuoteActions({ id, status, base, canEdit, canDelete, canConvert, collabs, evaluators, me, channel, collaborationId, hasEmail, email, hasFee, publicLink }: {
  id: string; status: string; base: string; canEdit: boolean; canDelete: boolean; canConvert: boolean; collabs: Collab[]; evaluators: PickPerson[]; me: string;
  channel: string | null; collaborationId: string | null; hasEmail: boolean; email: string; hasFee: boolean;
  /** the public page, once the offer was sent by email */
  publicLink: string | null;
}) {
  const [sendBox, setSendBox] = useState(false);
  const [to, setTo] = useState(email);
  const [message, setMessage] = useState("");
  const [sentLink, setSentLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copy = async (link: string) => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { prompt("Copiază linkul:", link); } };
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg("");
    const r = await fetch(`/api/crm/quotes/${id}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, message }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string; link?: string; emailed?: boolean };
    setBusy(false);
    if (!r?.ok) return setMsg(d.error ?? "Nu am putut trimite oferta.");
    setSentLink(d.link ?? null);
    if (d.emailed === false) setMsg("Oferta e marcată trimisă, dar emailul nu a plecat (emailul nu e configurat). Trimite-i clientului linkul de mai jos.");
  };
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [sentBox, setSentBox] = useState(false);
  const [via, setVia] = useState("email");
  const [conv, setConv] = useState(false);
  const [c, setC] = useState({ mode: channel === "collab" ? "collab" : "direct", collaboration_id: collaborationId ?? "", evaluator_id: evaluators.some((e) => e.id === me) ? me : "", verifier_id: "", due_on: "", send_contract: true });
  useEffect(() => {
    if (!conv && !sentBox && !sendBox) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { setConv(false); setSentBox(false); setSendBox(false); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [conv, sentBox, sendBox]);
  const run = async (body: Record<string, unknown>) => {
    setBusy(true); setMsg("");
    const e = await patch(id, body);
    setBusy(false);
    if (e) return setMsg(e);
    location.reload();
  };
  const decline = async () => {
    const reason = prompt("Motivul refuzului (opțional):") ?? null;
    if (reason === null) return;
    await run({ status: "declined", reason });
  };
  const remove = async () => {
    if (!confirm("Ștergi oferta? Nu se poate anula.")) return;
    setBusy(true);
    const r = await fetch(`/api/crm/quotes/${id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setMsg("Nu am putut șterge oferta.");
    location.href = `${base}/oferte`;
  };
  const convert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!c.evaluator_id) return setMsg("Alege evaluatorul principal.");
    if (c.mode === "collab" && !c.collaboration_id) return setMsg("Alege firma colaboratoare.");
    setBusy(true); setMsg("");
    const r = await fetch(`/api/crm/quotes/${id}/convert`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string; report?: string | null; order?: string };
    setBusy(false);
    if (!r?.ok) return setMsg(d.error ?? "Nu am putut converti oferta.");
    location.href = d.report ? `${base}/rapoarte/${d.report}?tab=inspectii&alocare=1` : `${base}/comenzi/${d.order}`;
  };
  const open = status === "draft" || status === "sent" || status === "accepted";
  return (
    <div className="qtActions">
      {(status === "draft" || status === "sent") && canEdit && <button type="button" className="btn btnNavy btnSm" disabled={busy || !hasFee} title={hasFee ? undefined : "Completează întâi onorariul"} onClick={() => { setSentLink(null); setSendBox(true); }}>{status === "sent" ? "Retrimite pe email" : "Trimite clientului"}</button>}
      {status === "draft" && canEdit && <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={() => setSentBox(true)}>Marchează trimisă</button>}
      {publicLink && <button type="button" className="btn btnGhost btnSm" onClick={() => copy(publicLink)}>{copied ? "Link copiat ✓" : "Copiază linkul public"}</button>}
      {publicLink && <a className="btn btnGhost btnSm" href={publicLink} target="_blank" rel="noopener">Vezi pagina clientului ↗</a>}
      {(status === "draft" || status === "sent") && canEdit && <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={() => run({ status: "accepted" })}>✓ Acceptată</button>}
      {(status === "draft" || status === "sent") && canEdit && <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={decline}>✕ Refuzată</button>}
      {open && canConvert && <button type="button" className="btn btnGold btnSm" disabled={busy} onClick={() => setConv(true)}>Convertește în lucrare →</button>}
      {status === "declined" && canEdit && <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={() => run({ status: "draft" })}>Redeschide</button>}
      {status !== "converted" && canEdit && <a className="btn btnGhost btnSm" href={`${base}/oferte/${id}/editare`}>Modifică</a>}
      {status !== "converted" && canDelete && <button type="button" className="btn btnGhost btnSm qtDel" disabled={busy} onClick={remove}>Șterge</button>}
      {msg && <div role="alert" className="error" style={{ width: "100%" }}>{msg}</div>}

      {sendBox && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="qtSendT" onClick={(e) => { if (e.target === e.currentTarget) setSendBox(false); }}>
          <form className="vfModalBox" style={{ maxWidth: 520 }} onSubmit={send} noValidate>
            <h2 id="qtSendT">Trimite oferta clientului</h2>
            {sentLink ? (
              <>
                <div className="note">Oferta a fost trimisă. Clientul o citește, o acceptă și o semnează pe pagina ei publică.</div>
                <label className="field">Linkul public<span style={{ display: "flex", gap: 8 }}><input className="input mono" readOnly value={sentLink} onFocus={(e) => e.currentTarget.select()} /><button type="button" className="btn btnNavy" onClick={() => copy(sentLink)}>{copied ? "Copiat ✓" : "Copiază"}</button></span></label>
                {msg && <div className="error">{msg}</div>}
                <div className="actions"><button type="button" className="btn btnGold" onClick={() => location.reload()}>Gata</button></div>
              </>
            ) : (
              <>
                <p className="hint" style={{ margin: 0 }}>Clientul primește un email cu rezumatul și linkul către pagina ofertei (ca ofertele din portal): o citește, o acceptă și o semnează online. Linkul îl poți trimite și pe WhatsApp.</p>
                <label className="field">Emailul clientului<input className="input" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="nume@exemplu.ro" /></label>
                <label className="field">Un rând personal <small>(opțional · apare în email și pe pagină)</small><textarea className="textarea" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="ex. Mulțumim pentru discuția de azi; mai jos oferta pentru apartamentul din Giroc." /></label>
                {msg && <div role="alert" className="error">{msg}</div>}
                <div className="actions"><button type="submit" className="btn btnGold" disabled={busy}>{busy ? "Se trimite…" : "Trimite oferta"}</button><button type="button" className="btn btnGhost" onClick={() => setSendBox(false)}>Renunță</button></div>
              </>
            )}
          </form>
        </div>, document.body)}

      {sentBox && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) setSentBox(false); }}>
          <form className="vfModalBox" style={{ maxWidth: 420 }} onSubmit={(e) => { e.preventDefault(); run({ status: "sent", sent_via: via }); }}>
            <h2>Oferta a fost transmisă</h2>
            <label className="field">Prin
              <select className="select" value={via} onChange={(e) => setVia(e.target.value)}>{SENT_VIA.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
            <div className="actions"><button type="submit" className="btn btnNavy" disabled={busy}>Salvează</button><button type="button" className="btn btnGhost" onClick={() => setSentBox(false)}>Renunță</button></div>
          </form>
        </div>, document.body)}

      {conv && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="qtConvT" onClick={(e) => { if (e.target === e.currentTarget) setConv(false); }}>
          <form className="vfModalBox" style={{ maxWidth: 560 }} onSubmit={convert} noValidate>
            <h2 id="qtConvT">Convertește oferta în lucrare</h2>
            <p className="hint" style={{ margin: 0 }}>Comanda și raportul se creează cu datele din ofertă (client, bunuri, onorariu); clientul nou se adaugă în CRM. Apoi aloci inspecțiile.</p>
            <div className="ctKindPick ctModePick" role="group" aria-label="Cum merge lucrarea">
              <button type="button" aria-pressed={c.mode === "direct"} onClick={() => setC({ ...c, mode: "direct" })}>
                <b>Direct · contract clasic</b><span>Lucrare VALUEFY pentru client: alegi detaliile raportului, contractul se completează automat și pleacă la semnat pe email.</span>
              </button>
              <button type="button" aria-pressed={c.mode === "collab"} onClick={() => setC({ ...c, mode: "collab" })}>
                <b>Pe colaborare</b><span>Comandă CO-… pe o firmă colaboratoare, cu cota ei; raportul se emite pe firma aceea.</span>
              </button>
            </div>
            {c.mode === "direct" ? (
              <>
                <p className="hint" style={{ margin: 0 }}>Pe pagina următoare verifici detaliile raportului și echipa, vezi sumarul contractului (completat automat din ofertă) și alegi emailul la care pleacă la semnat.</p>
                {msg && <div role="alert" className="error">{msg}</div>}
                <div className="actions">
                  <a className="btn btnGold" href={`${base}/contracte/nou?oferta=${id}`}>Continuă la raport și contract →</a>
                  <button type="button" className="btn btnGhost" onClick={() => setConv(false)}>Renunță</button>
                </div>
              </>
            ) : null}
            {c.mode === "collab" && (
              <label className="field">Firma colaboratoare
                <select className="select" value={c.collaboration_id} onChange={(e) => setC({ ...c, collaboration_id: e.target.value })}>
                  <option value="">Alege…</option>
                  {collabs.map((x) => <option key={x.id} value={x.id}>{x.firm}{x.number ? ` · ${x.number}` : ""}</option>)}
                </select>
              </label>
            )}
            {c.mode === "collab" && (
              <>
                <div className="formRow">
                  <div className="field">Evaluator principal
                    <PersonPicker label="Evaluator principal" value={c.evaluator_id} onChange={(v) => setC({ ...c, evaluator_id: v })} people={evaluators} me={me} />
                  </div>
                  <div className="field">Verificator <small>(opțional)</small>
                    <PersonPicker label="Verificator" value={c.verifier_id} onChange={(v) => setC({ ...c, verifier_id: v })} people={evaluators.filter((x) => x.id !== c.evaluator_id)} me={me}
                      extras={[{ value: "", label: "Mai târziu", hint: "se alege după creare" }]} placeholder="Mai târziu" />
                  </div>
                </div>
                <label className="field">Termen predare <small>(opțional)</small><input className="input" type="date" value={c.due_on} onChange={(e) => setC({ ...c, due_on: e.target.value })} /></label>
                {msg && <div role="alert" className="error">{msg}</div>}
                <div className="actions">
                  <button type="submit" className="btn btnGold" disabled={busy}>{busy ? "Se creează…" : "Creează comanda și raportul"}</button>
                  <button type="button" className="btn btnGhost" onClick={() => setConv(false)}>Renunță</button>
                </div>
              </>
            )}
          </form>
        </div>, document.body)}
    </div>
  );
}
