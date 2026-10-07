"use client";
// Keeps the user "online" while a CRM tab is open and visible: one tiny request a minute.
import { useEffect } from "react";

export function Heartbeat({ url }: { url: string }) {
  useEffect(() => {
    const beat = () => { if (document.visibilityState === "visible") fetch(url, { method: "POST", keepalive: true }).catch(() => {}); };
    const t = setInterval(beat, 60_000);
    document.addEventListener("visibilitychange", beat);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", beat); };
  }, [url]);
  return null;
}
