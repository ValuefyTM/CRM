"use client";

import { useEffect, useRef, useState } from "react";

/** Email → 6-digit code (or the link from the email). */
export function LoginForm({ kind, base, expired }: { kind: "internal" | "partner" | "client"; base: string; expired: boolean }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(expired ? "Linkul a expirat sau a fost deja folosit. Cere un cod nou." : "");
  const codeRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (step === "code") codeRef.current?.focus(); }, [step]);

  const post = (url: string, body: object) =>
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, ...body }) }).then(async (r) => ({
      ok: r.ok,
      data: (await r.json().catch(() => ({}))) as { error?: string },
    }));

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setMsg("Introdu o adresă de email validă.");
    setBusy(true); setMsg("");
    const r = await post("/api/auth/request", { email });
    setBusy(false);
    if (!r.ok) return setMsg(r.data.error || "Nu am putut trimite codul. Încearcă din nou.");
    setStep("code");
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.replace(/\D/g, "").length !== 6) return setMsg("Codul are 6 cifre.");
    setBusy(true); setMsg("");
    const r = await post("/api/auth/verify", { email, code });
    if (!r.ok) { setBusy(false); return setMsg(r.data.error || "Codul nu este corect."); }
    location.href = base || "/";
  };

  if (step === "code") {
    return (
      <form onSubmit={verify} className="authBox" style={{ animation: "none" }} noValidate>
        <div className="note">
          Dacă adresa <b>{email}</b> are cont, ți-am trimis un cod de 6 cifre și un link de autentificare. Verifică și folderul Spam.
        </div>
        <label className="field">Codul din email
          <input ref={codeRef} className="input codeInput" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))} placeholder="••••••" />
        </label>
        {msg && <div role="alert" className="error">{msg}</div>}
        <button type="submit" className="btn btnNavy" style={{ height: 52 }} disabled={busy}>{busy ? "Se verifică…" : "Intră în cont"}</button>
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <button type="button" className="linkBtn" onClick={() => { setStep("email"); setCode(""); setMsg(""); }}>← Altă adresă</button>
          <button type="button" className="linkBtn" onClick={() => sendCode()} disabled={busy}>Retrimite codul</button>
        </div>
      </form>
    );
  }
  return (
    <form onSubmit={sendCode} className="authBox" style={{ animation: "none" }} noValidate>
      <label className="field">Adresa de email
        <input className="input" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nume@firma.ro" />
      </label>
      {msg && <div role="alert" className="error">{msg}</div>}
      <button type="submit" className="btn btnNavy" style={{ height: 52 }} disabled={busy}>{busy ? "Se trimite…" : "Trimite-mi codul"}</button>
      <p className="hint">Nu folosim parole. Primești pe email un cod de 6 cifre și un link valabile 15 minute.</p>
    </form>
  );
}
