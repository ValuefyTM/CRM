"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SEGMENTS } from "@/lib/report-stage";

const WHAT = ["vizita la proprietate, fișa și pozele", "redactarea raportului de evaluare", "verificatorul confirmă sau întoarce raportul", "raportul trimis clientului și factura emisă"];

/**
 * The "?" in the Etapă header: what the four segments mean. Opens on hover, focus or tap; drawn over the page
 * (the table scrolls sideways, so a tooltip inside it would be clipped).
 */
export function StageHelp() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const btn = useRef<HTMLButtonElement>(null);
  const show = () => {
    const r = btn.current?.getBoundingClientRect();
    if (r) setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 300)), top: r.bottom + 8 });
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const off = () => setOpen(false);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") off(); };
    window.addEventListener("scroll", off, true);
    window.addEventListener("resize", off);
    document.addEventListener("keydown", esc);
    return () => { window.removeEventListener("scroll", off, true); window.removeEventListener("resize", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <>
      <button ref={btn} type="button" className="helpBtn" aria-label="Ce înseamnă cele patru segmente ale etapei" aria-expanded={open}
        onMouseEnter={show} onMouseLeave={() => setOpen(false)} onFocus={show} onBlur={() => setOpen(false)} onClick={() => (open ? setOpen(false) : show())}>?</button>
      {open && createPortal(
        <span className="helpTip" role="tooltip" style={{ left: pos.left, top: pos.top }}>
          <b>Cele patru segmente ale etapei</b>
          <ol>
            {SEGMENTS.map((l, i) => <li key={l}><i className={`s${i + 1}`} /><span>{l}<small>{WHAT[i]}</small></span></li>)}
          </ol>
          <em>Verde = făcut · galben = în lucru · roșu = întârziat · gri = urmează</em>
        </span>,
        document.body,
      )}
    </>
  );
}
