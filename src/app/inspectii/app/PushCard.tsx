"use client";

import { useCallback, useEffect, useState } from "react";

const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));

export type PushState = "unsupported" | "off" | "on" | "denied" | "busy" | "";

/** Phone notifications of the app (a sheet sent back for completions…): where this phone stands, turn on, turn off. */
export function usePush() {
  const [state, setState] = useState<PushState>("");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    (async () => {
      if (typeof Notification === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!sub) return setState("off");
        const r = await fetch(`/api/insp/push?endpoint=${encodeURIComponent(sub.endpoint)}`, { cache: "no-store" });
        const d = (await r.json().catch(() => ({}))) as { subscribed?: boolean };
        setState(d.subscribed ? "on" : "off");
      } catch { setState("off"); }
    })();
  }, []);

  const enable = useCallback(async () => {
    setState("busy"); setMsg("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); return; }
      const reg = await navigator.serviceWorker.ready;
      const { key } = (await (await fetch("/api/insp/push", { cache: "no-store" })).json()) as { key: string };
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64url(key) }));
      const r = await fetch("/api/insp/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!r.ok) throw new Error("save");
      setState("on");
      setMsg("Gata: primești notificări pe telefon, și cu aplicația închisă.");
      await reg.showNotification("Notificările sunt active", { body: "Așa afli când evaluatorul îți cere completări la o fișă.", icon: "/icon-insp-192.png", tag: "vf-insp-test" });
    } catch {
      setState(Notification.permission === "granted" ? "off" : "denied");
      setMsg("Nu am putut activa notificările pe acest telefon. Pe iPhone, adaugă întâi aplicația pe ecranul principal (Partajează → Adaugă pe ecranul principal) și deschide-o de acolo.");
    }
  }, []);

  const disable = useCallback(async () => {
    setState("busy"); setMsg("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/insp/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
    } catch { /* already gone */ }
    setState("off");
  }, []);

  return { state, msg, enable, disable };
}

/** The card in "Contul meu". */
export function PushCard() {
  const { state, msg, enable, disable } = usePush();
  return (
    <section className="iBox">
      <h3>Notificări pe telefon</h3>
      <p className="iText">Afli imediat când evaluatorul îți trimite o fișă înapoi pentru completări.</p>
      {state === "on" && <div className="iKv"><span>Stare</span><b>Active</b></div>}
      {state === "unsupported" && <p className="hint">Telefonul sau browserul nu permit notificări. Pe iPhone, adaugă aplicația pe ecranul principal și deschide-o de acolo.</p>}
      {state === "denied" && <p className="hint">Notificările sunt blocate pentru aplicație. Le poți permite din setările telefonului (Notificări → browserul / aplicația), apoi revii aici.</p>}
      {(state === "off" || state === "busy") && <button type="button" className="iBtn" onClick={enable} disabled={state === "busy"}>{state === "busy" ? "Se activează…" : "Activează notificările"}</button>}
      {state === "on" && <button type="button" className="iBtn ghost" onClick={disable}>Oprește notificările</button>}
      {msg && <p className="hint">{msg}</p>}
    </section>
  );
}
