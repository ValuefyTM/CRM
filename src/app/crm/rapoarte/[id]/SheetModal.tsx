"use client";
// The inspection sheet of an asset, opened over the page (a general view for now: photos, findings, who was present).
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function SheetModal({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [open]);
  return (
    <>
      <button type="button" className="btn btnNavy btnSm" onClick={() => setOpen(true)}>{label}</button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="sheetTitle" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="vfModalBox shBox">
            <div className="cardHead"><h2 id="sheetTitle">{title}</h2><button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(false)} aria-label="Închide">×</button></div>
            {children}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
