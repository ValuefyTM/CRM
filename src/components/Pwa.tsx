"use client";
// The CRM as an app: registers the service worker and, when the browser allows installing, offers it once in a small
// bar at the bottom (dismissed for 30 days with "Nu acum"; nothing is shown once installed).
import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const KEY = "vf_pwa_later";

export function Pwa({ base }: { base: string }) {
  const [ev, setEv] = useState<InstallEvent | null>(null);
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register(`${base}/sw.js`, { scope: base || "/" }).catch(() => {});
    const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    let later = 0;
    try { later = Number(localStorage.getItem(KEY) || 0); } catch { /* private window */ }
    if (standalone || later > Date.now()) return;
    const onPrompt = (e: Event) => { e.preventDefault(); setEv(e as InstallEvent); };
    addEventListener("beforeinstallprompt", onPrompt);
    addEventListener("appinstalled", () => setEv(null));
    return () => removeEventListener("beforeinstallprompt", onPrompt);
  }, [base]);
  if (!ev) return null;
  const install = async () => { await ev.prompt(); const r = await ev.userChoice; if (r.outcome === "accepted") setEv(null); };
  const notNow = () => { try { localStorage.setItem(KEY, String(Date.now() + 30 * 86400000)); } catch { /* not kept */ } setEv(null); };
  return (
    <div className="pwaBar" role="status">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-crm-192.png" alt="" width={36} height={36} />
      <span><b>Instalează CRM VALUEFY</b><small>Ca aplicație, pe ecranul de start sau pe desktop: se deschide fără browser.</small></span>
      <button type="button" className="btn btnGold btnSm" onClick={install}>Instalează</button>
      <button type="button" className="btn btnGhost btnSm" onClick={notNow}>Nu acum</button>
    </div>
  );
}
