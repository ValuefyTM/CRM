"use client";

import { useEffect, useRef, useState } from "react";
import type { Ctx } from "./InspApp";
import { position, useDetail, useDraft, usePhotos } from "./hooks";
import { Icon, TopBar, type Local } from "./ui";
import { photoCategories, PRESENT_ROLES, progress } from "@/lib/insp-forms";

/** Signature pad: pointer events, drawn at the screen's pixel density, exported as PNG. */
function Pad({ onDone, disabled }: { onDone: (png: string | null) => void; disabled: boolean }) {
  const c = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const drawn = useRef(false);
  const last = useRef<[number, number] | null>(null);

  useEffect(() => {
    const el = c.current!;
    const fit = () => {
      const r = el.getBoundingClientRect(), d = window.devicePixelRatio || 1;
      el.width = Math.round(r.width * d); el.height = Math.round(r.height * d);
      const ctx = el.getContext("2d")!;
      ctx.scale(d, d); ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#111111";
      drawn.current = false;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const pt = (e: React.PointerEvent): [number, number] => { const r = c.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const down = (e: React.PointerEvent) => { if (disabled) return; drawing.current = true; last.current = pt(e); c.current!.setPointerCapture(e.pointerId); };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const ctx = c.current!.getContext("2d")!, p = pt(e);
    ctx.beginPath(); ctx.moveTo(...last.current); ctx.lineTo(...p); ctx.stroke();
    last.current = p; drawn.current = true;
  };
  const up = () => { if (!drawing.current) return; drawing.current = false; last.current = null; if (drawn.current) onDone(c.current!.toDataURL("image/png")); };
  const clear = () => { const el = c.current!; el.getContext("2d")!.clearRect(0, 0, el.width, el.height); drawn.current = false; onDone(null); };

  return (
    <div className="iPad2">
      <canvas ref={c} className="iSig" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Semnătură: semnează cu degetul" role="img" />
      {!disabled && <button type="button" className="iTextBtn" onClick={clear}>Șterge semnătura</button>}
    </div>
  );
}

export function SignView({ ctx, id, item }: { ctx: Ctx; id: string; item: Local | undefined }) {
  const { detail } = useDetail(ctx, id);
  const { draft, update } = useDraft(ctx, id, item, detail);
  const { photos } = usePhotos(ctx, id, detail);
  const [gps, setGps] = useState<"" | "wait" | "ok" | "no">("");
  const [msg, setMsg] = useState("");
  const asked = useRef(false);

  useEffect(() => {
    if (!draft || draft.submitted || draft.submit || asked.current || draft.lat != null) return;
    asked.current = true;
    setGps("wait");
    position(15000).then((p) => {
      if (!p) return setGps("no");
      setGps("ok");
      update({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: Math.round(p.coords.accuracy) });
    });
  }, [draft, update]);

  if (!draft) return (<><TopBar title="Semnătură" onBack={ctx.back} /><div className="iPad"><p className="iEmpty">Se încarcă…</p></div></>);

  const ro = draft.submitted || draft.submit;
  const p = progress(draft.sheet_type, draft.answers);
  const required = photoCategories(draft.sheet_type).filter((c) => c.required);
  const photosOk = required.every((c) => photos.some((x) => x.category === c.k));
  const hasSig = !!draft.signature || !!detail?.sheet?.has_signature;
  const checks: [boolean, string, string?][] = [
    [p.done === p.total, `Fișa: ${p.done} din ${p.total} câmpuri`, `#/i/${encodeURIComponent(id)}/fisa`],
    [photosOk, `${photos.length} ${photos.length === 1 ? "fotografie" : "fotografii"}${photosOk ? "" : " · lipsește fotografia exterioară"}`, `#/i/${encodeURIComponent(id)}/foto`],
    [!!draft.present_person.trim(), "Persoana prezentă"],
    [hasSig, "Semnătura"],
    [draft.lat != null, draft.lat != null ? `Locația (±${draft.accuracy_m ?? "?"} m)` : gps === "wait" ? "Locația: se caută…" : "Locația nu este disponibilă (opțional)"],
  ];

  const send = async () => {
    setMsg("");
    if (!photosOk) return setMsg("Adaugă cel puțin o fotografie exterioară.");
    if (!draft.present_person.trim()) return setMsg("Completează numele persoanei prezente.");
    if (!hasSig) return setMsg("Lipsește semnătura persoanei prezente.");
    if (p.done < p.total && !confirm(`Fișa are ${p.total - p.done} câmpuri necompletate. Trimiți așa?`)) return;
    update({ submit: true });
    if (navigator.onLine) setTimeout(() => ctx.sync(), 300);
  };

  return (
    <>
      <TopBar title="Prezență și semnătură" sub={item?.address} onBack={() => ctx.go(`#/i/${encodeURIComponent(id)}/foto`)} />
      <div className="iPad withCta">
        {draft.submitted && <p className="iNote ok">Fișa a fost trimisă. Mulțumim!</p>}
        {draft.submit && !draft.submitted && <p className="iNote warn">{ctx.online ? "Se trimite…" : "Fișa e salvată pe telefon și se trimite automat când revine semnalul."}</p>}
        {draft.error && <p className="iNote err">{draft.error}</p>}

        <section className="iBox">
          <h3>Verificare</h3>
          <ul className="iChecks">
            {checks.map(([ok, t, href]) => (
              <li key={t} className={ok ? "ok" : ""}>
                <span className="iCheckDot">{ok ? <Icon.check /> : null}</span>
                {href && !ok && !ro ? <a href={href}>{t} →</a> : <span>{t}</span>}
              </li>
            ))}
          </ul>
        </section>

        <section className="iBox">
          <h3>Persoana prezentă la inspecție</h3>
          <label className="iField">Nume și prenume
            <input value={draft.present_person} readOnly={ro} onChange={(e) => update({ present_person: e.target.value })} autoComplete="off" />
          </label>
          <div className="iField">Calitatea
            <div className="iChips">
              {PRESENT_ROLES.map(([k, l]) => (
                <button key={k} type="button" disabled={ro} className={`iChip${draft.present_role === k ? " on" : ""}`} aria-pressed={draft.present_role === k}
                  onClick={() => update({ present_role: draft.present_role === k ? "" : k })}>{l}</button>
              ))}
            </div>
          </div>
          <label className="iField">Telefon
            <input type="tel" inputMode="tel" value={draft.present_phone} readOnly={ro} onChange={(e) => update({ present_phone: e.target.value })} />
          </label>
        </section>

        <section className="iBox">
          <h3>Semnătura</h3>
          <p className="hint">Prin semnare, persoana prezentă confirmă că inspecția proprietății a avut loc la data de azi.</p>
          {hasSig && !draft.signature ? <p className="iNote ok">Semnătura a fost deja trimisă.</p> : <Pad disabled={ro} onDone={(png) => update({ signature: png })} />}
        </section>
        {msg && <p role="alert" className="iNote err">{msg}</p>}
      </div>
      <div className="iCta">
        {draft.submitted ? (
          <a className="iBtn big ghost" href="#/">Înapoi la inspecții</a>
        ) : draft.submit ? (
          <button type="button" className="iBtn big ghost" onClick={() => ctx.sync()} disabled={ctx.syncing}>{ctx.syncing ? "Se trimite…" : "Încearcă acum"}</button>
        ) : (
          <button type="button" className="iBtn big acc" onClick={send}>Trimite fișa</button>
        )}
      </div>
    </>
  );
}
