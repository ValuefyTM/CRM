"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Ctx } from "./InspApp";
import { newId } from "./store";
import { position, shrink, useDetail, useDraft, usePhotos } from "./hooks";
import { Chips, Icon, type Local } from "./ui";
import { DocsButton } from "./DocsViewer";
import {
  accFields, answered, formOf, hasRooms, isFilled, isOptional, otherKey, roomsOf, sheetTypeLabel,
  type Answers, type Field, type Section, type UtilAnswer,
} from "@/lib/insp-forms";

function UtilBlock({ f, value, onChange, readOnly }: { f: Extract<Field, { kind: "util" }>; value: UtilAnswer; onChange: (v: UtilAnswer) => void; readOnly: boolean }) {
  const yn = (cur: string | undefined, set: (v: "da" | "nu" | undefined) => void, label: string) => (
    <div className="iChips" role="group" aria-label={label}>
      {(["da", "nu"] as const).map((v) => (
        <button key={v} type="button" disabled={readOnly} className={`iChip${cur === v ? " on" : ""}`} aria-pressed={cur === v} onClick={() => set(cur === v ? undefined : v)}>
          {v === "da" ? "Da" : "Nu"}
        </button>
      ))}
    </div>
  );
  return (
    <div className="iUtil">
      <div className="iUtilRow"><span>Branșat</span>{yn(value.on, (on) => onChange({ ...value, on }), `${f.label}: branșat`)}</div>
      {value.on === "da" && f.k !== "sewer" && (
        <div className="iUtilRow"><span>{f.meterLabel ?? "Contor montat"}</span>{yn(value.meter, (meter) => onChange({ ...value, meter }), `${f.label}: contor`)}</div>
      )}
      {value.on === "nu" && (
        <label className="iUtilRow"><span>Distanța până la rețea</span>
          <span className="iUnit"><input inputMode="decimal" value={value.dist ?? ""} readOnly={readOnly} onChange={(e) => onChange({ ...value, dist: e.target.value.replace(/[^\d.,]/g, "") })} aria-label={`${f.label}: distanța până la rețea, metri liniari`} /><em>ml</em></span>
        </label>
      )}
    </div>
  );
}

function FieldInput({ f, answers, set, readOnly, onPhoto, photos }: {
  f: Field; answers: Answers; set: (k: string, v: Answers[string]) => void; readOnly: boolean; onPhoto: (f: Field) => void; photos: number;
}) {
  const a = answers[f.k];
  if (f.kind === "util") return <UtilBlock f={f} value={(a ?? {}) as UtilAnswer} onChange={(v) => set(f.k, v)} readOnly={readOnly} />;
  if (f.kind === "photo") {
    return (
      <button type="button" className={`sPhotoQ${photos ? " ok" : ""}`} disabled={readOnly} onClick={() => onPhoto(f)}>
        <Icon.camera />{photos ? `Fotografiat (${photos}) · mai adaugă` : "Fotografiază"}
      </button>
    );
  }
  if (f.kind === "one" || f.kind === "many") {
    const v = Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : typeof a === "string" && a ? [a] : [];
    const alt = answers[otherKey(f.k)];
    return (
      <fieldset className="iChipsWrap" disabled={readOnly}>
        <Chips label={f.label} opts={f.opts} value={v} multi={f.kind === "many"} onChange={(n) => set(f.k, f.kind === "many" ? n : n[0] ?? "")} />
        {f.other && (
          <input className="sOther" value={typeof alt === "string" ? alt : ""} onChange={(e) => set(otherKey(f.k), e.target.value)} placeholder="Altele…" aria-label={`${f.label}: altele`} />
        )}
      </fieldset>
    );
  }
  if (f.kind === "text" && f.long) {
    return <textarea rows={3} value={(a as string) ?? ""} readOnly={readOnly} onChange={(e) => set(f.k, e.target.value)} aria-label={f.label} placeholder={f.placeholder} />;
  }
  const numeric = f.kind === "num" || f.kind === "int";
  return (
    <span className="iUnit">
      <input value={(a as string) ?? ""} readOnly={readOnly} aria-label={f.label} placeholder={f.kind === "text" || numeric ? f.placeholder : undefined}
        inputMode={f.kind === "int" ? "numeric" : f.kind === "num" ? "decimal" : undefined}
        onChange={(e) => set(f.k, numeric ? e.target.value.replace(/[^\d.,]/g, "") : e.target.value)} />
      {"unit" in f && f.unit && <em>{f.unit}</em>}
    </span>
  );
}

const counts = (s: Section, answers: Answers) => {
  const req = s.fields.filter((f) => !isOptional(f));
  return { done: req.filter((f) => answered(f, answers)).length, total: req.length };
};

/** The inspection sheet, one group of questions at a time (the firm's template). Saved on the phone at every change. */
export function SheetView({ ctx, id, item }: { ctx: Ctx; id: string; item: Local | undefined }) {
  const { detail } = useDetail(ctx, id);
  const { draft, update } = useDraft(ctx, id, item, detail);
  const { photos, add } = usePhotos(ctx, id, detail);
  const i = item ?? detail?.inspection;
  const key = `insp-sec-${id}`;
  const [cur, setCur] = useState<string | null>(() => { try { return sessionStorage.getItem(key); } catch { return null; } });
  const nav = useRef<HTMLElement>(null);
  const cam = useRef<HTMLInputElement>(null);
  const photoQ = useRef<Field | null>(null);

  const sections = useMemo<Section[]>(() => {
    if (!draft) return [];
    // Accessories at the same address (parking, garage, box) get their own group on this sheet.
    const extra = (i?.hosted ?? []).map((h) => ({ id: `acc-${h.id}`, title: `Accesoriu: ${h.label}`, fields: accFields(h.id) }));
    return [...formOf(draft.sheet_type, draft.form), ...extra];
  }, [draft, i?.hosted]);

  // Start on the first group that is not complete.
  const current = sections.find((s) => s.id === cur) ?? (draft ? sections.find((s) => { const c = counts(s, draft.answers); return c.done < c.total; }) ?? sections[0] : undefined);
  useEffect(() => {
    if (!current) return;
    try { sessionStorage.setItem(key, current.id); } catch { /* private mode */ }
    nav.current?.querySelector('[aria-current="step"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [current, key]);

  if (!draft || !i || !current) return (<div className="sLoading"><p className="iEmpty">Se încarcă fișa…</p></div>);

  const ro = draft.submitted || draft.submit;
  const all = sections.flatMap((s) => s.fields).filter((f) => !isOptional(f));
  const done = all.filter((f) => answered(f, draft.answers)).length;
  const set = (k: string, v: Answers[string]) => update({ answers: { ...draft.answers, [k]: v } });
  const idx = sections.findIndex((s) => s.id === current.id);
  const nextS = sections[idx + 1];
  const go = (s: Section) => { setCur(s.id); window.scrollTo(0, 0); };
  const rooms = roomsOf(draft.answers);
  const roomsDone = rooms.filter((r) => r.floor?.length && r.walls?.length && r.condition).length;
  const base = `#/i/${encodeURIComponent(id)}`;
  const photoCount = (f: Field) => photos.filter((p) => p.caption === f.label && p.category === "other").length;

  const takeFor = (f: Field) => { photoQ.current = f; cam.current?.click(); };
  const onFile = async (files: FileList | null) => {
    const f = photoQ.current;
    if (!files?.length || !f) return;
    const pos = await position(4000);
    let sort = photos.length;
    for (const file of Array.from(files)) {
      const { blob, width, height } = await shrink(file);
      await add({ id: newId(), inspection_id: id, category: "other", caption: f.label, blob, width, height, taken_at: new Date().toISOString(),
        lat: pos?.coords.latitude ?? null, lng: pos?.coords.longitude ?? null, sort: sort++, uploaded: false, deleted: false, error: null });
    }
    set(f.k, "1");
    if (cam.current) cam.current.value = "";
  };

  return (
    <>
      <header className="sHead">
        <div className="sHeadRow">
          <button type="button" className="iIconBtn" onClick={() => ctx.go(base)} aria-label="Înapoi"><Icon.back /></button>
          <span className="sHeadText"><b>Fișa · {sheetTypeLabel(draft.sheet_type).split(" (")[0]}</b><small>{ro ? (draft.submitted ? "Trimisă" : "Semnată · se trimite") : "Salvat pe telefon"} · {done} din {all.length} completate</small></span>
          <DocsButton docs={detail?.docs} label="Acte" />
        </div>
        <div className="sBar" aria-hidden="true"><i style={{ width: `${(done / Math.max(1, all.length)) * 100}%` }} /></div>
        <nav ref={nav} className="sNav" aria-label="Secțiuni">
          {sections.map((s) => {
            const c = counts(s, draft.answers);
            const on = s.id === current.id;
            const full = c.total > 0 && c.done === c.total;
            return (
              <button key={s.id} type="button" aria-current={on ? "step" : undefined} className={on ? "on" : full ? "ok" : ""} onClick={() => go(s)}>
                {full && !on ? "✓ " : ""}{s.title}{on && c.total ? ` ${c.done}/${c.total}` : ""}
              </button>
            );
          })}
        </nav>
      </header>

      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files)} />
      <div className="sBody">
        {ro && <p className="iNote ok">{draft.submitted ? "Fișa a fost trimisă și nu mai poate fi modificată." : "Fișa este semnată și așteaptă să fie trimisă."}</p>}
        {draft.error && <p className="iNote err">{draft.error}</p>}
        {idx === 0 && (i.hosted ?? []).length > 0 && <p className="iNote">Pe această fișă inspectezi și {(i.hosted ?? []).map((h) => h.label.toLowerCase()).join(", ")}: grupurile „Accesoriu” de la final.</p>}
        <h2 className="sTitle">{current.title}</h2>
        {current.fields.map((f) => (
          <div key={f.k} className={`iQ${f.kind === "util" ? " util" : ""}`}>
            <span className="iQLabel">{f.label}{f.req && <span className="sReq" aria-label="obligatoriu">*</span>}{isFilled(f, draft.answers[f.k]) && <Icon.check />}</span>
            <FieldInput f={f} answers={draft.answers} set={set} readOnly={ro} onPhoto={takeFor} photos={f.kind === "photo" ? photoCount(f) : 0} />
          </div>
        ))}
      </div>

      <div className="sFoot">
        <div className={`sFootLinks${hasRooms(draft.sheet_type) ? "" : " two"}`}>
          {hasRooms(draft.sheet_type) && <a href={`${base}/incaperi`}>Încăperi {rooms.length ? `${roomsDone}/${rooms.length}` : ""}</a>}
          <a href={`${base}/foto`}>Foto · {photos.length}</a>
          <a href={`${base}/semnatura`}>Semnătură</a>
        </div>
        {nextS ? (
          <button type="button" className="sNext" onClick={() => go(nextS)}>Secțiunea următoare: {nextS.title} →</button>
        ) : (
          <a className="sNext" href={hasRooms(draft.sheet_type) && rooms.length > roomsDone ? `${base}/incaperi` : `${base}/semnatura`}>
            {hasRooms(draft.sheet_type) && rooms.length > roomsDone ? "Mai departe: încăperile →" : "Încheie: semnătură și trimitere →"}
          </a>
        )}
      </div>
    </>
  );
}
