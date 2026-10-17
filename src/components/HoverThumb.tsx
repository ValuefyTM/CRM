"use client";
// A small photo that shows bigger while the pointer is over it (above the table, so the list's scroll box does not cut it).
import { useState } from "react";
import { createPortal } from "react-dom";

export function HoverThumb({ src, alt }: { src: string; alt: string }) {
  const [bad, setBad] = useState(false);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  if (bad) return null;
  const show = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const W = 260, H = 195;
    setAt({ x: Math.min(r.right + 10, innerWidth - W - 8), y: Math.max(8, Math.min(r.top + r.height / 2 - H / 2, innerHeight - H - 8)) });
  };
  return (
    <span className="repThumb" onMouseEnter={show} onMouseLeave={() => setAt(null)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" onError={() => setBad(true)} />
      {at && createPortal(
        // eslint-disable-next-line @next/next/no-img-element
        <img className="repThumbBig" src={src} alt="" style={{ left: at.x, top: at.y }} />, document.body)}
    </span>
  );
}
