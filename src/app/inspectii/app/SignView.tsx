"use client";

import { useEffect, useRef, useState } from "react";
import type { Ctx } from "./InspApp";
import { position, useDetail, useDraft, usePhotos } from "./hooks";
import { Icon, type Local } from "./ui";
import { hasRooms, missingRequired, photoCategories, PRESENT_ROLES, progress, roomsOf } from "@/lib/insp-forms";

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

const ROLE_OF: Record<string, string> = { owner: "owner", client: "client", agent: "agent" };

export function SignView({ ctx, id, item }: { ctx: Ctx; id: string; item: Local | undefined }) {
  const { detail } = useDetail(ctx, id);
  const { draft, update } = useDraft(ctx, id, item, detail);
  const { photos } = usePhotos(ctx, id, detail);
  const [gps, setGps] = useState<"" | "wait" | "ok" | "no">("");
  const [msg, setMsg] = useState("");
  const [other, setOther] = useState(false);
  const [signedAt, setSignedAt] = useState<Date | null>(null);
  const asked = useRef(false);
  const i = item ?? detail?.inspection;

  useEffect(() => {
    // completions on a sheet sent back: the place of the visit stays the one captured then
    if (!draft || draft.submitted || draft.submit || asked.current || draft.lat != null || i?.revision) return;
    asked.current = true;
    setGps("wait");
    position(15000).then((p) => {
      if (!p) return setGps("no");
      setGps("ok");
      update({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: Math.round(p.coords.accuracy) });
    });
  }, [draft, update, i?.revision]);

  if (!draft) return (<div className="sLoading"><p className="iEmpty">Se încarcă…</p></div>);

  const base = `#/i/${encodeURIComponent(id)}`;
  const ro = draft.submitted || draft.submit;
  const p = progress(draft.sheet_type, draft.answers, draft.form);
  const req = missingRequired(draft.sheet_type, draft.answers, draft.form);
  const rooms = roomsOf(draft.answers);
  const roomsDone = rooms.filter((r) => r.floor?.length && r.walls?.length && r.condition).length;
  const required = photoCategories(draft.sheet_type).filter((c) => c.required);
  const photosOk = required.every((c) => photos.some((x) => x.category === c.k));
  const hasSig = !!draft.signature || !!detail?.sheet?.has_signature;
  // The contact of the visit, offered as the person present (one tap), or someone else.
  const contact = i?.contact_name?.trim() || "";
  const isContact = !!contact && !other && draft.present_person.trim() === contact;

  const rows: [boolean | null, string, string, string?][] = [
    [p.done === p.total, "Fișa", `${p.done}/${p.total}`, `${base}/fisa`],
    ...(req.length ? [[false, "Obligatorii necompletate", req.slice(0, 2).map((f) => f.label).join(", ") + (req.length > 2 ? "…" : ""), `${base}/fisa`] as [boolean, string, string, string]] : []),
    ...(hasRooms(draft.sheet_type) ? [[rooms.length > 0 && roomsDone === rooms.length, "Încăperi", rooms.length ? `${roomsDone}/${rooms.length}` : "nicio încăpere", `${base}/incaperi`] as [boolean, string, string, string]] : []),
    [photosOk, "Fotografii", photosOk ? String(photos.length) : "lipsește exteriorul", `${base}/foto`],
    i?.revision ? [true, "Locația", "cea de la vizită"] : [draft.lat != null ? true : null, "Locația", draft.lat != null ? `±${draft.accuracy_m ?? "?"} m` : gps === "wait" ? "se caută…" : "indisponibilă (opțional)"],
  ];

  const send = async () => {
    setMsg("");
    if (req.length) return setMsg(`Completează întrebările obligatorii: ${req.slice(0, 4).map((f) => f.label).join(", ")}.`);
    if (!photosOk) return setMsg("Adaugă cel puțin o fotografie exterioară.");
    if (!draft.present_person.trim()) return setMsg("Alege sau completează persoana prezentă.");
    if (!hasSig) return setMsg("Lipsește semnătura persoanei prezente.");
    if (p.done < p.total && !confirm(`Fișa are ${p.total - p.done} întrebări fără răspuns. Trimiți așa?`)) return;
    update({ submit: true });
    if (navigator.onLine) setTimeout(() => ctx.sync(), 300);
  };

  return (
    <>
      <header className="sHead">
        <div className="sHeadRow">
          <button type="button" className="iIconBtn" onClick={() => ctx.go(`${base}/fisa`)} aria-label="Înapoi la fișă"><Icon.back /></button>
          <span className="sHeadText"><b>Încheie inspecția</b><small>Verifică, semnează, trimite</small></span>
        </div>
      </header>
      <div className="sBody">
        {draft.submitted && <p className="iNote ok">Fișa a fost trimisă. Mulțumim!</p>}
        {draft.submit && !draft.submitted && <p className="iNote warn">{ctx.online ? "Se trimite…" : "Fișa e salvată pe telefon și se trimite automat când revine semnalul."}</p>}
        {draft.error && <p className="iNote err">{draft.error}</p>}

        <div className="gSum">
          {rows.map(([ok, t, v, href]) => {
            const val = <b className={ok === true ? "ok" : ok === false ? "warn" : ""}>{ok === true ? "✓ " : ""}{v}</b>;
            return href && ok === false && !ro
              ? <a key={t} href={href}><span>{t}</span>{val}</a>
              : <span key={t}><span>{t}</span>{val}</span>;
          })}
        </div>

        <div className="iQ">
          <span className="iQLabel">Cine a fost prezent</span>
          <div className="iChips">
            {contact && (
              <button type="button" disabled={ro} className={`iChip${isContact ? " on" : ""}`} aria-pressed={isContact}
                onClick={() => { setOther(false); update({ present_person: contact, present_phone: i?.contact_phone ?? "", present_role: ROLE_OF[i?.contact_kind ?? ""] ?? draft.present_role }); }}>
                {contact}{i?.contact_kind && PRESENT_ROLES.find(([k]) => k === ROLE_OF[i.contact_kind!]) ? ` · ${PRESENT_ROLES.find(([k]) => k === ROLE_OF[i.contact_kind!])![1].toLowerCase()}` : ""}
              </button>
            )}
            <button type="button" disabled={ro} className={`iChip${!isContact ? " on" : ""}`} aria-pressed={!isContact}
              onClick={() => { setOther(true); if (isContact) update({ present_person: "", present_phone: "", present_role: "" }); }}>{contact ? "Altcineva" : "Persoana prezentă"}</button>
          </div>
        </div>
        {!isContact && (
          <div className="gWho">
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
            <label className="iField">Telefon (opțional)
              <input type="tel" inputMode="tel" value={draft.present_phone} readOnly={ro} onChange={(e) => update({ present_phone: e.target.value })} />
            </label>
          </div>
        )}

        <div className="iQ">
          <span className="iQLabel">Semnătura persoanei prezente</span>
          {hasSig && !draft.signature ? <p className="iNote ok">Semnătura a fost deja trimisă.</p> : <Pad disabled={ro} onDone={(png) => { update({ signature: png }); setSignedAt(png ? new Date() : null); }} />}
          {(signedAt || draft.lat != null) && (
            <small className="hint">{signedAt ? `Semnat la ${signedAt.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })}` : ""}{signedAt && draft.lat != null ? " · " : ""}{draft.lat != null ? `locație GPS ±${draft.accuracy_m ?? "?"} m` : ""}</small>
          )}
          <p className="hint">Prin semnare, persoana prezentă confirmă că inspecția proprietății a avut loc la data de azi.</p>
        </div>

        <div className="gInfo">
          <b>După trimitere</b>
          <span>Fișa ajunge în CRM-ul VALUEFY, la raport: răspunsurile, încăperile, fotografiile pe încăperi și caracteristicile proprietății. Evaluatorul o descarcă în PDF, ca anexă la raport.</span>
        </div>
        {msg && <p role="alert" className="iNote err">{msg}</p>}
      </div>
      <div className="sFoot">
        {draft.submitted ? (
          <a className="sNext" href="#/">Înapoi la inspecții</a>
        ) : draft.submit ? (
          <button type="button" className="sNext" onClick={() => ctx.sync()} disabled={ctx.syncing}>{ctx.syncing ? "Se trimite…" : "Încearcă acum"}</button>
        ) : (
          <>
            <button type="button" className="sNext" onClick={send}>{i?.revision ? "Trimite completările" : "Finalizează și trimite"}</button>
            <small className="sFootNote">Fără semnal? Se trimite singură când revine rețeaua.</small>
          </>
        )}
      </div>
    </>
  );
}
