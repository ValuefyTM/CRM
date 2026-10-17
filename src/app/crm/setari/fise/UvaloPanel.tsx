"use client";
// Setări → Fișe de inspecție: where the inspections are done — in UVALO (the inspectors' phone app on app.uvalo.ro, by their
// ANEVAR card) or in the CRM's own app (the fallback) — and whether the link with UVALO works.
import { useEffect, useState } from "react";
import { SHEET_TYPES } from "@/lib/insp-forms";

type State = {
  configured: boolean; webhook_secret: boolean; channel: "uvalo" | "app";
  ping: { ok: boolean; org?: string | null; key?: string; error?: string } | null;
  templates: Record<string, { at: string; error?: string }>;
};
const when = (iso: string) => new Date(iso).toLocaleString("ro-RO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(".", "");

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
  if (!s) return <section className="card uvCard"><h2>Inspecții prin UVALO</h2><p className="hint">Se verifică legătura…</p></section>;
  const ready = s.configured && !!s.ping?.ok;
  return (
    <section className="card uvCard">
      <div className="cardHead"><h2>Unde se fac inspecțiile</h2>
        <span className={`pill ${s.channel === "uvalo" ? "pillOk" : ""}`}><i />{s.channel === "uvalo" ? "În aplicația UVALO" : "În aplicația CRM"}</span></div>
      <div className="uvPick" role="radiogroup" aria-label="Aplicația de inspecții">
        <button type="button" role="radio" aria-checked={s.channel === "uvalo"} disabled={!edit || busy || !ready}
          onClick={() => post({ action: "channel", value: "uvalo" }, "Inspecțiile noi se trimit în UVALO; fișele au fost trimise acolo.")}>
          <b>UVALO</b><small>Inspectorul primește inspecția în aplicația UVALO (după legitimația ANEVAR) și o face acolo; fișa finalizată vine înapoi în raport.</small>
        </button>
        <button type="button" role="radio" aria-checked={s.channel === "app"} disabled={!edit || busy}
          onClick={() => post({ action: "channel", value: "app" }, "Inspecțiile noi se fac în aplicația CRM.")}>
          <b>Aplicația CRM</b><small>Aplicația proprie de inspecții (rezerva). Inspecțiile deja trimise în UVALO rămân acolo.</small>
        </button>
      </div>
      <dl className="kv uvKv">
        <div><dt>Cheia UVALO</dt><dd><span>{!s.configured ? <span className="errTxt">lipsește — secretul <code>UVALO_API_KEY</code> în Cloudflare</span>
          : s.ping?.ok ? <>funcționează · firma <b>{s.ping.org ?? "—"}</b> · cheia „{s.ping.key}”</> : <span className="errTxt">{s.ping?.error ?? "nu răspunde"}</span>}</span></dd></div>
        <div><dt>Webhook</dt><dd>{s.webhook_secret ? <span>secretul e setat</span> : <span className="errTxt">lipsește secretul <code>UVALO_WEBHOOK_SECRET</code></span>}
          <small className="uvUrl">În UVALO → Firma mea → Integrare, la cheie, adresa: <code>{webhook}</code></small></dd></div>
        <div><dt>Fișele în UVALO</dt><dd>
          <ul className="uvTpl">
            {SHEET_TYPES.map(([t, l]) => {
              const x = s.templates[t];
              return <li key={t}><span>{l}</span>{x ? x.error ? <span className="errTxt">{x.error}</span> : <small>trimisă {when(x.at)}</small> : <small className="muted">netrimisă</small>}</li>;
            })}
          </ul>
          {edit && ready && <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={() => post({ action: "sync" }, "Fișele au fost trimise în UVALO.")}>Trimite fișele acum</button>}
          <small className="hint">Fișele se modifică doar aici; la fiecare salvare se trimit și în UVALO, unde apar ca fișele firmei (nu se pot modifica acolo).</small>
        </dd></div>
      </dl>
      {msg && <p className={msg.ok ? "okTxt" : "errTxt"} role="status">{msg.t}</p>}
    </section>
  );
}
