"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Notice = { id: string; at: string; kind: string; title: string; sub: string; href: string };
type Data = { items: Notice[]; seen: string | null; unread: number };

const ICON: Record<string, string> = { message: "✉", team: "+", review: "?", verified: "✓", back: "↩", inspection: "⌂", order: "•" };
const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 2) return "acum";
  if (m < 60) return `acum ${m} min`;
  if (m < 1440) return `acum ${Math.round(m / 60)} h`;
  const d = Math.round(m / 1440);
  return d === 1 ? "ieri" : `acum ${d} zile`;
};

/** The notifications bell in the CRM's top bar: new ones counted on it; opening the list marks them seen. */
export function Bell() {
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/crm/notifications").catch(() => null);
    if (r?.ok) setData((await r.json()) as Data);
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 120000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", off);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && data?.unread) {
      // What was new stays marked in this opening; the count on the bell goes away.
      setSeenAt(data.seen ?? "");
      setData({ ...data, unread: 0 });
      fetch("/api/crm/notifications", { method: "POST" }).catch(() => null);
    } else if (next) setSeenAt(data?.seen ?? "");
  };
  const unread = data?.unread ?? 0;
  return (
    <div className="bell" ref={box}>
      <button type="button" className="bellBtn" aria-label={unread ? `Notificări, ${unread} noi` : "Notificări"} aria-expanded={open} aria-haspopup="dialog" onClick={toggle}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && <span className="bellCount">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="bellPanel" role="dialog" aria-label="Notificări">
          <div className="bellHead"><b>Notificări</b><small>ultimele 30 de zile</small></div>
          {!data ? <p className="bellEmpty">Se încarcă…</p> : data.items.length === 0 ? <p className="bellEmpty">Nimic nou. Aici apar mesajele echipei, rapoartele în care ești pus, verificările și inspecțiile alocate.</p> : (
            <ul className="bellList">
              {data.items.map((n) => (
                <li key={n.id} className={seenAt !== null && (seenAt === "" || n.at > seenAt) ? "new" : ""}>
                  <a href={n.href}>
                    <span className={`bellIcon k-${n.kind}`} aria-hidden="true">{ICON[n.kind] ?? "•"}</span>
                    <span className="bellText"><b>{n.title}</b>{n.sub && <small>{n.sub}</small>}</span>
                    <time dateTime={n.at}>{ago(n.at)}</time>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
