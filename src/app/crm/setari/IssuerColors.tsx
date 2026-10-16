"use client";
import { useRef, useState } from "react";

type Firm = { id: string; name: string; color: string | null; fallback: string; reports: number; logo: string | null };

/** Colour and logo of every issuing firm (its stripe and picture in the reports list). Saved as soon as picked. */
export function IssuerColors({ firms, edit }: { firms: Firm[]; edit: boolean }) {
  const [colors, setColors] = useState<Record<string, string | null>>(Object.fromEntries(firms.map((f) => [f.id, f.color])));
  const [logos, setLogos] = useState<Record<string, string | null>>(Object.fromEntries(firms.map((f) => [f.id, f.logo])));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const pick = useRef<Record<string, HTMLInputElement | null>>({});
  const fail = async (r: Response | null, fallback: string) => {
    const d = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    setMsg(d?.error ?? fallback);
  };
  const saveColor = async (id: string, color: string | null) => {
    setColors((c) => ({ ...c, [id]: color }));
    const r = await fetch(`/api/crm/issuers/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ color }) }).catch(() => null);
    if (!r?.ok) return fail(r, "Nu am putut salva culoarea.");
    setMsg(null);
  };
  const upload = async (id: string, file: File | undefined) => {
    if (!file) return;
    setBusy(id); setMsg(null);
    const body = new FormData(); body.append("file", file);
    const r = await fetch(`/api/crm/issuers/${encodeURIComponent(id)}/logo`, { method: "POST", body }).catch(() => null);
    setBusy(null);
    if (!r?.ok) return fail(r, "Nu am putut încărca logo-ul.");
    const d = (await r.json()) as { src: string };
    setLogos((l) => ({ ...l, [id]: `${d.src}?v=${Date.now()}` }));
  };
  const removeLogo = async (id: string) => {
    setBusy(id); setMsg(null);
    const r = await fetch(`/api/crm/issuers/${encodeURIComponent(id)}/logo`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (!r?.ok) return fail(r, "Nu am putut șterge logo-ul.");
    setLogos((l) => ({ ...l, [id]: null }));
  };
  return (
    <div className="issuerColors">
      {firms.map((f) => {
        const cur = colors[f.id] ?? f.fallback;
        const logo = logos[f.id];
        const initials = f.name.slice(0, 2).toUpperCase();
        return (
          <div key={f.id} className="issuerRow">
            <i style={{ background: cur }} />
            <span className="issuerLogo" title={logo ? "Logo-ul firmei" : "Fără logo: în listă apar inițialele"}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {logo ? <img src={logo} alt="" /> : <b>{initials}</b>}
            </span>
            <span className="who">
              <b>{f.name}</b>
              <small>{f.reports} rapoarte{colors[f.id] ? "" : " · culoare implicită"}</small>
              {edit && (
                <span className="issuerActs">
                  <button type="button" className="linkBtn" disabled={busy === f.id} onClick={() => pick.current[f.id]?.click()}>{busy === f.id ? "Se încarcă…" : logo ? "Schimbă logo-ul" : "Încarcă logo"}</button>
                  {logo && <button type="button" className="linkBtn" disabled={busy === f.id} onClick={() => removeLogo(f.id)}>Șterge logo-ul</button>}
                  <input ref={(el) => { pick.current[f.id] = el; }} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => { upload(f.id, e.target.files?.[0]); e.target.value = ""; }} />
                </span>
              )}
            </span>
            <input type="color" value={cur} disabled={!edit} onChange={(e) => saveColor(f.id, e.target.value)} aria-label={`Culoarea firmei ${f.name}`} />
            {edit && colors[f.id] && <button type="button" className="linkBtn" onClick={() => saveColor(f.id, null)}>implicit</button>}
          </div>
        );
      })}
      {msg && <div className="error">{msg}</div>}
    </div>
  );
}
