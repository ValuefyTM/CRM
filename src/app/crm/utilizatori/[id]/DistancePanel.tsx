"use client";
// Where a team member's inspections are measured from on the statements (the coloured km tags): the firm's office, or
// their own base address (an inspector's home, a collaborator's base), placed on the map when saved.
import { useState } from "react";

export function DistancePanel(props: { userId: string; canEdit: boolean; from: "office" | "base"; address: string; coords: string; note: string }) {
  const [from, setFrom] = useState(props.from);
  const [address, setAddress] = useState(props.address);
  const [coords, setCoords] = useState(props.address ? "" : props.coords);
  const [placed, setPlaced] = useState(props.from === "base" && props.coords ? { coords: props.coords, note: props.note } : null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async () => {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/crm/users/${props.userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "base", from, address, coords }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string; note?: string; lat?: number; lng?: number } | undefined;
    setBusy(false);
    if (!r?.ok) return setMsg({ ok: false, text: d?.error || "Nu s-a putut salva." });
    if (from === "base" && d?.lat != null) setPlaced({ coords: `${d.lat}, ${d.lng}`, note: d.note ?? "" });
    setMsg({ ok: true, text: from === "base" ? "Salvat. Distanțele din borderouri se calculează de la adresa lui." : "Salvat. Distanțele din borderouri se calculează de la sediul firmei." });
  };
  return (
    <section className="card">
      <div className="cardHead"><h2>Distanța la inspecții</h2></div>
      <p className="hint" style={{ margin: 0 }}>De unde se calculează, pe drum, cu mașina, distanța până la inspecțiile lui. Apare ca tag colorat în borderou.</p>
      <div className="chips" role="radiogroup" aria-label="Distanța de la" style={{ margin: "10px 0" }}>
        <button type="button" className="chip" role="radio" aria-checked={from === "office"} disabled={!props.canEdit || busy} onClick={() => { setFrom("office"); setMsg(null); }}>De la sediul firmei</button>
        <button type="button" className="chip" role="radio" aria-checked={from === "base"} disabled={!props.canEdit || busy} onClick={() => { setFrom("base"); setMsg(null); }}>De la adresa lui</button>
      </div>
      {from === "base" && <>
        <label className="field">Adresa lui de bază <small>(stradă, număr, localitate, județ)</small>
          <input className="input" value={address} disabled={!props.canEdit || busy} onChange={(e) => { setAddress(e.target.value); setMsg(null); }} placeholder="ex. Str. Bega 25, Giroc, jud. Timiș" /></label>
        <label className="field">Coordonate <small>(opțional, „lat, lng”, dacă adresa nu e găsită pe hartă)</small>
          <input className="input" value={coords} disabled={!props.canEdit || busy} onChange={(e) => { setCoords(e.target.value); setMsg(null); }} placeholder="ex. 45.7537, 21.2257" /></label>
        {placed && <p className="hint" style={{ margin: 0 }}>Pe hartă: <a className="link" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${placed.coords.split(",")[0].trim()}&mlon=${placed.coords.split(",")[1]?.trim()}#map=16/${placed.coords.split(",")[0].trim()}/${placed.coords.split(",")[1]?.trim()}`}>{placed.coords}</a>{placed.note ? ` · ${placed.note}` : ""}</p>}
      </>}
      {msg && <div role={msg.ok ? "status" : "alert"} className={msg.ok ? "okMsg" : "error"}>{msg.text}</div>}
      {props.canEdit && <div className="actions" style={{ justifyContent: "flex-end" }}><button type="button" className="btn btnGold btnSm" disabled={busy} onClick={save}>{busy ? "Se salvează…" : "Salvează"}</button></div>}
    </section>
  );
}
