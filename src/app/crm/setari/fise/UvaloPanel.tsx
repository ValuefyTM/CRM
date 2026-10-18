"use client";
// Setări → Fișe de inspecție, one band: where the inspections are done — in UVALO (the inspectors' phone app on app.uvalo.ro, by
// their ANEVAR card) or in the CRM's own app (the fallback) — and whether the link with UVALO works (details folded). The state of
// each sheet in UVALO is in the list of sheets.
import { useEffect, useState } from "react";

type State = {
  configured: boolean; webhook_secret: boolean; channel: "uvalo" | "app";
  ping: { ok: boolean; org?: string | null; key?: string; error?: string } | null;
  templates: Record<string, { at: string; error?: string }>;
};

export function UvaloPanel({ edit, webhook }: { edit: boolean; webhook: string }) {
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const load = () => fetch("/api/crm/uvalo").then((r) => r.json() as Promise<State>).then(setS).catch(() => setS(null));
  useEffect(() => { void load(); }, []);
  const post = async (body: object, ok: string) => {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/crm/uvalo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    setMsg(r?.ok ? { ok: true, t: ok } : { ok: false, t: d?.error ?? "Nu am putut salva." });
    await load();
  };
  if (!s) return <section className="card uvMini"><span className="hint">Se verifică legătura cu UVALO…</span></section>;
  const ready = s.configured && !!s.ping?.ok;
  const status = !s.configured ? { ok: false, t: "UVALO neconfigurat" } : s.ping?.ok ? { ok: true, t: `UVALO conectat${s.ping.org ? ` · ${s.ping.org}` : ""}` } : { ok: false, t: s.ping?.error ?? "UVALO nu răspunde" };
  return (
    <section className="card uvMini">
      <div className="uvMiniRow">
        <b>Inspecțiile se fac în</b>
        <div className="uvSeg" role="radiogroup" aria-label="Aplicația de inspecții">
          <button type="button" role="radio" aria-checked={s.channel === "uvalo"} disabled={!edit || busy || !ready}
            title="Inspectorul primește inspecția în UVALO (după legitimația ANEVAR); fișa finalizată vine înapoi în raport."
            onClick={() => post({ action: "channel", value: "uvalo" }, "Inspecțiile noi se trimit în UVALO; fișele au fost trimise acolo.")}>UVALO</button>
          <button type="button" role="radio" aria-checked={s.channel === "app"} disabled={!edit || busy}
            title="Aplicația proprie de inspecții (rezerva). Inspecțiile deja trimise în UVALO rămân acolo."
            onClick={() => post({ action: "channel", value: "app" }, "Inspecțiile noi se fac în aplicația CRM.")}>Aplicația CRM</button>
        </div>
        <span className={`uvDot ${status.ok ? "ok" : "bad"}`}>{status.t}</span>
        {!s.webhook_secret && <span className="uvDot bad">fără webhook</span>}
        <span className="uvGrow" />
        {edit && ready && <button type="button" className="linkBtn" disabled={busy} onClick={() => post({ action: "sync" }, "Fișele au fost trimise în UVALO.")}>Trimite fișele în UVALO</button>}
        {edit && ready && s.channel === "uvalo" && <button type="button" className="linkBtn" disabled={busy} title="Inspecțiile deschise primesc din nou datele bunului, contactul și actele; fișele începute își păstrează răspunsurile."
          onClick={() => post({ action: "resend" }, "Inspecțiile deschise au fost retrimise în UVALO, cu datele bunurilor.")}>Retrimite inspecțiile deschise</button>}
        <details className="uvMore">
          <summary>Detalii</summary>
          <dl className="kv uvKv">
            <div><dt>Cheia UVALO</dt><dd><span>{!s.configured ? <span className="errTxt">lipsește — secretul <code>UVALO_API_KEY</code> în Cloudflare</span>
              : s.ping?.ok ? <>funcționează · cheia „{s.ping.key}”</> : <span className="errTxt">{s.ping?.error ?? "nu răspunde"}</span>}</span></dd></div>
            <div><dt>Webhook</dt><dd>{s.webhook_secret ? <span>secretul e setat</span> : <span className="errTxt">lipsește secretul <code>UVALO_WEBHOOK_SECRET</code></span>}
              <small className="uvUrl">În UVALO → Firma mea → Integrare, la cheie: <code>{webhook}</code></small></dd></div>
          </dl>
          <small className="hint">Fișele se modifică doar aici; la fiecare salvare se trimit și în UVALO, unde apar ca fișele firmei.</small>
        </details>
      </div>
      {msg && <p className={msg.ok ? "okTxt" : "errTxt"} role="status">{msg.t}</p>}
    </section>
  );
}
