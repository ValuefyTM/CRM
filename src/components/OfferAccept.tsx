"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function PrintButton() {
  return <button type="button" className="ofBtnGhost" onClick={() => window.print()}>Descarcă PDF</button>;
}

/** Signature pad: draws with mouse, pen or finger; reports the PNG (or "" when cleared). */
function SignaturePad({ onChange, disabled }: { onChange: (png: string) => void; disabled: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const strokes = useRef(0);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current!;
    const fit = () => {
      const r = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
      const g = c.getContext("2d")!;
      g.scale(dpr, dpr); g.lineWidth = 2.4; g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = "#17173A";
      strokes.current = 0; setEmpty(true); onChange("");
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = (e: React.PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
  const clear = () => {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    strokes.current = 0; setEmpty(true); onChange("");
  };

  return (
    <div className="ofSigWrap">
      <div className="ofSigHead"><span>Semnătura ta</span><button type="button" className="ofBtnGhost sm" onClick={clear} disabled={disabled || empty}>Șterge</button></div>
      <div className={`ofPad${disabled ? " off" : ""}`}>
        <canvas
          ref={canvas}
          aria-label="Chenar pentru semnătură"
          onPointerDown={(e) => {
            if (disabled) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            const g = canvas.current!.getContext("2d")!;
            const [x, y] = pos(e);
            g.beginPath(); g.moveTo(x, y); g.lineTo(x + 0.1, y + 0.1); g.stroke();
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const g = canvas.current!.getContext("2d")!;
            const [x, y] = pos(e);
            g.lineTo(x, y); g.stroke();
          }}
          onPointerUp={() => {
            if (!drawing.current) return;
            drawing.current = false;
            strokes.current++;
            setEmpty(false);
            onChange(canvas.current!.toDataURL("image/png"));
          }}
        />
        {empty && <span className="ofPadHint">Semnează aici cu mouse-ul sau cu degetul</span>}
      </div>
    </div>
  );
}

export function OfferAccept({ token, disabled, urgentFee, urgentDays, defaultName, defaultUrgent }: {
  token: string; disabled: boolean; urgentFee: string | null; urgentDays: number; defaultName: string; defaultUrgent: boolean;
}) {
  const [name, setName] = useState(defaultName);
  const [sig, setSig] = useState("");
  const [agree, setAgree] = useState(false);
  const [urgent, setUrgent] = useState(defaultUrgent && !!urgentFee);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [signed, setSigned] = useState(false);
  const today = new Date().toLocaleDateString("ro-RO");

  const post = async (body: { action: string; [k: string]: unknown }) => {
    setBusy(true); setMsg("");
    const r = await fetch(`/api/offer/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    setBusy(false);
    if (!r?.ok) return setMsg(d?.error || "Nu am putut trimite. Verifică conexiunea și încearcă din nou.");
    // After signing, explain what happens next before showing the signed offer.
    if (body.action === "accept") setSigned(true);
    else location.reload();
  };

  return (
    <section className="ofCard ofAccept" id="acceptare">
      {signed && <SignedModal onClose={() => location.reload()} />}
      <h2>Acceptare și semnătură</h2>
      <p className="ofMuted">Prin semnare accepți oferta tehnică și financiară și termenii de referință ai evaluării; după ce primim datele tale de facturare, oferta semnată se transformă automat în contract de prestări servicii. Primești o copie semnată pe email.</p>
      <form className="ofForm" onSubmit={(e) => {
        e.preventDefault();
        if (disabled) return;
        if (name.trim().split(/\s+/).length < 2) return setMsg("Scrie numele și prenumele complet.");
        if (!sig) return setMsg("Semnează în chenar.");
        if (!agree) return setMsg("Bifează acordul cu oferta și termenii de referință.");
        post({ action: "accept", name, signature: sig, agree, urgent });
      }}>
        <div className="ofGrid2 flat tight">
          <label className="ofField">Nume și prenume<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" disabled={disabled} /></label>
          <label className="ofField">Data<input value={today} readOnly disabled /></label>
        </div>
        {urgentFee && (
          <label className="ofCheck"><input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} disabled={disabled} />
            <span>Doresc <b>regim urgent</b>: raport în {urgentDays} zile lucrătoare de la inspecție (+ {urgentFee} cu TVA).</span></label>
        )}
        <SignaturePad onChange={setSig} disabled={disabled} />
        <label className="ofCheck"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} disabled={disabled} />
          <span>Am citit și accept oferta tehnică și financiară, <a href="#termeni">termenii de referință ai evaluării</a>, <a href="https://valuefy.ro/termeni-si-conditii" target="_blank" rel="noopener">Termenii și condițiile</a> și <a href="https://valuefy.ro/politica-de-confidentialitate" target="_blank" rel="noopener">Politica de confidențialitate</a>.</span></label>
        {msg && <div role="alert" className="ofError">{msg}</div>}
        <button type="submit" className="ofBtnNavy" disabled={disabled || busy}>{busy ? "Se trimite…" : "Acceptă și semnează oferta"} <i>✓</i></button>
      </form>
      {!disabled && (
        declining ? (
          <form className="ofDecline" onSubmit={(e) => { e.preventDefault(); post({ action: "decline", reason }); }}>
            <label className="ofField">De ce refuzi oferta? <small>(opțional, ne ajută să revenim cu o variantă mai bună)</small>
              <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <div className="ofRow">
              <button type="submit" className="ofBtnGhost" disabled={busy}>Confirm refuzul</button>
              <button type="button" className="ofLinkBtn" onClick={() => setDeclining(false)}>Renunță</button>
            </div>
          </form>
        ) : <button type="button" className="ofLinkBtn" onClick={() => setDeclining(true)}>Refuz oferta</button>
      )}
    </section>
  );
}

/** Shown right after the client signs: the signed offer becomes the contract once the billing details are in. */
function SignedModal({ onClose }: { onClose: () => void }) {
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ok.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  // Rendered on <body>: the offer cards are animated (transform), which would trap a fixed overlay inside them.
  return createPortal(
    <div className="ofModalBack" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ofModal" role="dialog" aria-modal="true" aria-labelledby="signed-title" aria-describedby="signed-text">
        <span className="ofModalIcon" aria-hidden>✓</span>
        <h2 id="signed-title">Oferta a fost semnată</h2>
        <p id="signed-text">
          Mulțumim! Oferta semnată se va transforma <b>automat în contract de prestări servicii</b> odată ce primim <b>toate datele tale de facturare</b>.
        </p>
        <p className="ofMuted">Îți trimitem pe email o copie a ofertei semnate. Te contactăm în curând pentru datele de facturare și programarea inspecției.</p>
        <button ref={ok} type="button" className="ofBtnNavy" onClick={onClose}>Am înțeles</button>
      </div>
    </div>,
    document.body,
  );
}
