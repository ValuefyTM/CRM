"use client";

import { useRef, useState } from "react";

/** VALUEFY's details on contracts; read-only for users who are not administrators. */
export function FirmForm({ fields, values, edit }: { fields: [string, string, string][]; values: Record<string, string>; edit: boolean }) {
  const [f, setF] = useState(values);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = fields.some(([k]) => f[k] !== values[k]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const r = await fetch("/api/crm/settings/firm", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    setBusy(false);
    if (!r?.ok) return setMsg({ ok: false, text: d?.error || "Nu am putut salva." });
    setMsg({ ok: true, text: "Salvat. Contractele generate de acum folosesc datele noi; cele deja semnate rămân cum au fost semnate." });
    setTimeout(() => location.reload(), 900);
  };
  return (
    <form onSubmit={save} noValidate>
      <div className="stGrid">
        {fields.map(([k, l, h]) => (
          <label key={k} className={`field${k === "address" || k === "mail" || k === "iban" ? " stWide" : ""}`}>{l}
            <input className={`input${k === "cui" || k === "reg" || k === "iban" ? " mono" : ""}`} value={f[k] ?? ""} placeholder={h} disabled={!edit}
              onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </label>
        ))}
      </div>
      {msg && <div role={msg.ok ? "status" : "alert"} className={msg.ok ? "note" : "error"}>{msg.text}</div>}
      {edit && <div className="actions"><button type="submit" className="btn btnGold" disabled={busy || !dirty}>{busy ? "Se salvează…" : "Salvează"}</button>
        {dirty && <button type="button" className="btn btnGhost" onClick={() => setF(values)}>Renunță</button>}</div>}
    </form>
  );
}

export function FirmImage({ which, label, src, custom, edit }: { which: "stamp" | "signature"; label: string; src: string; custom: boolean; edit: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    setBusy(true); setMsg("");
    const fd = new FormData(); fd.set("which", which); fd.set("file", file);
    const r = await fetch("/api/crm/settings/firm/image", { method: "POST", body: fd }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setMsg(((await r?.json().catch(() => ({}))) as { error?: string })?.error || "Nu am putut încărca imaginea.");
    location.reload();
  };
  const reset = async () => {
    setBusy(true);
    await fetch(`/api/crm/settings/firm/image?which=${which}`, { method: "DELETE" }).catch(() => null);
    location.reload();
  };
  return (
    <div className="stImg">
      <span className="stImgLabel">{label}{!custom && <small className="muted"> · din modelul de contract</small>}</span>
      <div className="stImgBox"><img src={src} alt={label} /></div>
      {edit && (
        <div className="actions">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
          <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Se încarcă…" : "Înlocuiește"}</button>
          {custom && <button type="button" className="linkBtn" disabled={busy} onClick={reset}>Revino la cea din model</button>}
        </div>
      )}
      {msg && <div role="alert" className="error">{msg}</div>}
    </div>
  );
}
