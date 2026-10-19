"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Notice = { id: string; at: string; kind: string; title: string; sub: string; href: string };
type Data = { items: Notice[]; seen: string | null; unread: number };

const ICON: Record<string, string> = { message: "✉", team: "+", review: "?", verified: "✓", back: "↩", inspection: "⌂", order: "•", collect: "lei" };
const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 2) return "acum";
  if (m < 60) return `acum ${m} min`;
  if (m < 1440) return `acum ${Math.round(m / 60)} h`;
  const d = Math.round(m / 1440);
  return d === 1 ? "ieri" : `acum ${d} zile`;
};
const SHOWN = "vf_notif_shown";
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));

type PushState = "unsupported" | "off" | "on" | "denied" | "busy";

/**
 * The notifications bell in the CRM's top bar: new ones counted on it; opening the list marks them seen.
 * With the system notifications turned on (Windows, Mac, Android), each new item is also shown by the system while
 * the CRM is open, and pushed to this device when it is closed.
 */
export function Bell() {
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [push, setPush] = useState<PushState>("unsupported");
  const [pushMsg, setPushMsg] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const started = useRef(new Date().toISOString());

  // System notifications for the items that are new since the last ones shown (the pushed ones carry the same tag).
  const show = useCallback(async (items: Notice[]) => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return;
    let last = "";
    try { last = localStorage.getItem(SHOWN) ?? ""; } catch { /* private window */ }
    const floor = last || started.current;
    const fresh = items.filter((n) => n.at > floor).sort((a, b) => (a.at < b.at ? -1 : 1));
    if (!fresh.length) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      for (const n of fresh.slice(-5)) await reg.showNotification(n.title, { body: n.sub, icon: "/icon-crm-192.png", badge: "/icon-crm-192.png", tag: n.id, data: { href: n.href } });
      localStorage.setItem(SHOWN, fresh[fresh.length - 1].at);
    } catch { /* no service worker yet */ }
  }, []);

  const load = useCallback(async () => {
    const r = await fetch("/api/crm/notifications").catch(() => null);
    if (!r?.ok) return;
    const d = (await r.json()) as Data;
    setData(d);
    show(d.items);
  }, [show]);
  useEffect(() => {
    load();
    const t = setInterval(load, 120000);
    return () => clearInterval(t);
  }, [load]);

  // Where this device stands: subscribed for push, allowed but not subscribed, refused, or not possible here.
  useEffect(() => {
    (async () => {
      if (typeof Notification === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return setPush("unsupported");
      if (Notification.permission === "denied") return setPush("denied");
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!sub) return setPush("off");
        const r = await fetch(`/api/crm/push?endpoint=${encodeURIComponent(sub.endpoint)}`);
        const d = (await r.json().catch(() => ({}))) as { subscribed?: boolean };
        setPush(d.subscribed ? "on" : "off");
      } catch { setPush("off"); }
    })();
  }, []);

  const enable = async () => {
    setPush("busy"); setPushMsg("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setPush(perm === "denied" ? "denied" : "off"); return; }
      try { localStorage.setItem(SHOWN, new Date().toISOString()); } catch { /* not kept */ }
      const reg = await navigator.serviceWorker.ready;
      const { key } = (await (await fetch("/api/crm/push")).json()) as { key: string };
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64url(key) }));
      const r = await fetch("/api/crm/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!r.ok) throw new Error("save");
      setPush("on");
      setPushMsg("Gata: primești notificări pe acest dispozitiv, și cu CRM-ul închis.");
      await reg.showNotification("Notificările CRM sunt active", { body: "Așa vei afla de inspecții, mesaje, verificări și comenzi noi.", icon: "/icon-crm-192.png", tag: "vf-test" });
    } catch {
      // the system notifications still work while the CRM is open (the permission is given)
      setPush(Notification.permission === "granted" ? "off" : "denied");
      setPushMsg("Nu am putut activa primirea cu CRM-ul închis pe acest dispozitiv; cât timp CRM-ul e deschis, notificările apar.");
    }
  };
  const disable = async () => {
    setPush("busy"); setPushMsg("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/crm/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
    } catch { /* already gone */ }
    setPush("off");
  };

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
          {push !== "unsupported" && (
            <div className="bellFoot">
              {push === "on"
                ? <><span><b>Notificări pe acest dispozitiv: active</b><small>și cu CRM-ul închis</small></span><button type="button" className="btn btnGhost btnSm" onClick={disable}>Oprește</button></>
                : push === "denied"
                  ? <span><b>Notificările sunt blocate de browser</b><small>Permite-le din setările paginii (lacătul de lângă adresă), apoi revino aici.</small></span>
                  : <><span><b>Notificări pe acest dispozitiv</b><small>Windows, Mac, Android; pe iPhone cu CRM-ul pe ecranul principal</small></span><button type="button" className="btn btnGold btnSm" disabled={push === "busy"} onClick={enable}>{push === "busy" ? "Se activează…" : "Activează"}</button></>}
              {pushMsg && <small className="bellFootMsg">{pushMsg}</small>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
