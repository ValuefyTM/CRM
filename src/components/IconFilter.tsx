"use client";
// A table filter like FilterSelect, with a picture next to each option: the bank's or firm's logo, the person's avatar.
// A native <select> cannot show pictures, so this is a pill that opens a small list (with a search box when long).
import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";

export type IconOption = { v: string; label: string; n?: number; logo?: string | null; person?: { id: string; photo: string | null } };

function Pic({ o }: { o: IconOption }) {
  const [bad, setBad] = useState(false);
  if (o.person) return <Avatar id={o.person.id} name={o.label} size={20} photo={o.person.photo} />;
  const short = o.label.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  return (
    <span className="ifLogo" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {o.logo && !bad ? <img src={o.logo} alt="" onError={() => setBad(true)} /> : short}
    </span>
  );
}

export function IconFilter({ label, value, options, onChange, all = "Toate" }: { label: string; value: string; options: IconOption[]; onChange: (v: string) => void; all?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", out);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", key); };
  }, [open]);
  const cur = options.find((o) => o.v === value);
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const shown = q ? options.filter((o) => norm(o.label).includes(norm(q))) : options;
  const pick = (v: string) => { setOpen(false); setQ(""); if (v !== value) onChange(v); };
  return (
    <div className="ifWrap" ref={box}>
      <button type="button" className="fsel ifBtn" data-on={value ? "" : undefined} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((x) => !x)}>
        <span>{label}</span>
        {cur && <Pic o={cur} />}
        <b>{cur ? cur.label : value || all}</b>
      </button>
      {open && (
        <div className="ifPop" role="listbox" aria-label={label}>
          {options.length > 8 && <input className="ifSearch" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută…" aria-label={`Caută ${label.toLowerCase()}`} />}
          <button type="button" role="option" aria-selected={!value} className={`ifOpt${!value ? " on" : ""}`} onClick={() => pick("")}><span className="ifAll" aria-hidden>∗</span><span>{all}</span></button>
          {shown.map((o) => (
            <button key={o.v} type="button" role="option" aria-selected={o.v === value} className={`ifOpt${o.v === value ? " on" : ""}`} onClick={() => pick(o.v)}>
              <Pic o={o} /><span>{o.label}</span>{o.n != null && <small>{o.n.toLocaleString("ro-RO")}</small>}
            </button>
          ))}
          {shown.length === 0 && <span className="ifNone">Nimic găsit</span>}
        </div>
      )}
    </div>
  );
}
