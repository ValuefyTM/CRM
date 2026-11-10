"use client";
// The online dot on every avatar of a CRM page: the avatars carry their person's id (data-uid); this asks the
// presence of all of them at once, now, every minute and when new avatars appear, and marks each (data-presence).
import { useEffect } from "react";

export function PresenceLive() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null, busy = false, last = "";
    const run = async (force = false) => {
      if (busy) return;
      const els = [...document.querySelectorAll<HTMLElement>(".pAvatar[data-uid]")];
      const ids = [...new Set(els.map((e) => e.dataset.uid!).filter(Boolean))].sort();
      const key = ids.join(",");
      if (!ids.length || (!force && key === last && els.every((e) => e.dataset.presence))) return;
      busy = true; last = key;
      try {
        const r = await fetch(`/api/crm/presence?ids=${encodeURIComponent(key)}`, { cache: "no-store" });
        const map = (await r.json().catch(() => ({}))) as Record<string, [string, string]>;
        for (const e of document.querySelectorAll<HTMLElement>(".pAvatar[data-uid]")) {
          const p = map[e.dataset.uid!];
          if (!p) continue;
          e.dataset.presence = p[0];
          const name = e.getAttribute("data-name") ?? "";
          e.title = name ? `${name} · ${p[1]}` : p[1];
        }
      } catch { /* offline: the dots stay as they were */ }
      busy = false;
    };
    run(true);
    const every = setInterval(() => run(true), 60_000);
    const obs = new MutationObserver(() => { if (timer) clearTimeout(timer); timer = setTimeout(() => run(), 400); });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => { clearInterval(every); obs.disconnect(); if (timer) clearTimeout(timer); };
  }, []);
  return null;
}
