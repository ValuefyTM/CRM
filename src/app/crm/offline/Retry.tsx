"use client";
import { useEffect, useState } from "react";

/** Reloads the page the user wanted (the browser's history) as soon as the signal is back, or on request. */
export function Retry() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => { setOnline(true); location.reload(); };
    const off = () => setOnline(false);
    addEventListener("online", on); addEventListener("offline", off);
    return () => { removeEventListener("online", on); removeEventListener("offline", off); };
  }, []);
  return (
    <>
      <button type="button" className="btn btnGold" onClick={() => location.reload()}>Reîncearcă</button>
      <small>{online ? "Conexiunea pare să fie înapoi." : "Pagina se reîncarcă singură când revine semnalul."}</small>
    </>
  );
}
