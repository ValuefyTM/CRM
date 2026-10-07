"use client";

import { useEffect, useState } from "react";
import type { Ctx } from "./InspApp";
import { useDetail, useDraft } from "./hooks";
import { Chips, Icon, TopBar, type Local } from "./ui";
import { accFields, FORMS, isFilled, progress, SHEET_TYPES, type Answers, type Field, type Section, type SheetType, type UtilAnswer } from "@/lib/insp-forms";

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

function FieldInput({ f, answers, set, readOnly }: { f: Field; answers: Answers; set: (k: string, v: Answers[string]) => void; readOnly: boolean }) {
  const a = answers[f.k];
  if (f.kind === "util") return <UtilBlock f={f} value={(a ?? {}) as UtilAnswer} onChange={(v) => set(f.k, v)} readOnly={readOnly} />;
  if (f.kind === "one" || f.kind === "many") {
    const v = Array.isArray(a) ? a : typeof a === "string" && a ? [a] : [];
    return (
      <fieldset className="iChipsWrap" disabled={readOnly}>
        <Chips label={f.label} opts={f.opts} value={v} multi={f.kind === "many"} onChange={(n) => set(f.k, f.kind === "many" ? n : n[0] ?? "")} />
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

/** The inspection sheet, with the form of the property type. Saved on the phone at every change. */
export function SheetView({ ctx, id, item }: { ctx: Ctx; id: string; item: Local | undefined }) {
  const { detail } = useDetail(ctx, id);
  const { draft, update } = useDraft(ctx, id, item, detail);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const i = item ?? detail?.inspection;

  useEffect(() => {
    if (draft && !Object.keys(open).length) {
      // Open the first sections that are not complete yet.
      const o: Record<string, boolean> = {};
      let n = 0;
      for (const s of [...FORMS[draft.sheet_type], ...(i?.hosted ?? []).map((h) => ({ id: `acc-${h.id}`, title: "", fields: accFields(h.id) }))]) {
        const full = s.fields.every((f) => f.k === "notes" || isFilled(f, draft.answers[f.k]));
        if (!full && n < 2) { o[s.id] = true; n++; }
      }
      setOpen(o);
    }
  }, [draft, open]);

  if (!draft || !i) return (<><TopBar title="Fișa de inspecție" onBack={ctx.back} /><div className="iPad"><p className="iEmpty">Se încarcă…</p></div></>);

  const ro = draft.submitted || draft.submit;
  const type = draft.sheet_type;
  // Accessories at the same address (parking, garage, box) get their own section on this sheet.
  const extra: Section[] = (i.hosted ?? []).map((h) => ({ id: `acc-${h.id}`, title: `Accesoriu: ${h.label}`, fields: accFields(h.id) }));
  const sections = [...FORMS[type], ...extra];
  const base = progress(type, draft.answers);
  const extraFields = extra.flatMap((x) => x.fields).filter((f) => !f.k.endsWith(".acc_notes"));
  const p = { done: base.done + extraFields.filter((f) => isFilled(f, draft.answers[f.k])).length, total: base.total + extraFields.length };
  const set = (k: string, v: Answers[string]) => update({ answers: { ...draft.answers, [k]: v } });
  const setType = (t: SheetType) => {
    if (t === type) return;
    if (p.done > 0 && !confirm("Schimbi tipul fișei? Răspunsurile comune se păstrează, celelalte nu se mai trimit.")) return;
    update({ sheet_type: t });
    setOpen({});
  };

  return (
    <>
      <TopBar title={`Fișa: ${SHEET_TYPES.find(([k]) => k === type)?.[1]}`} sub={i.address} onBack={ctx.back}
        right={<span className="iCount">{p.done}/{p.total}</span>} />
      <div className="iProgress" aria-hidden="true"><i style={{ width: `${(p.done / Math.max(1, p.total)) * 100}%` }} /></div>
      <div className="iPad withCta">
        {ro && <p className="iNote ok">{draft.submitted ? "Fișa a fost trimisă și nu mai poate fi modificată." : "Fișa este semnată și așteaptă să fie trimisă."}</p>}
        {draft.error && <p className="iNote err">{draft.error}</p>}
        {!ro && (
          <div className="iTypeSwitch" role="group" aria-label="Tipul proprietății">
            {SHEET_TYPES.filter(([k]) => k !== "accesoriu" || type === "accesoriu" || !(i.hosted ?? []).length).map(([k, l]) => <button key={k} type="button" className={k === type ? "on" : ""} aria-pressed={k === type} onClick={() => setType(k)}>{l.split(" /")[0].split(" (")[0]}</button>)}
          </div>
        )}
        {(i.hosted ?? []).length > 0 && <p className="iNote">Pe această fișă inspectezi și {(i.hosted ?? []).map((h) => h.label.toLowerCase()).join(", ")}: secțiunile „Accesoriu” de la final.</p>}
        {sections.map((s, n) => {
          const free = (f: Field) => f.k === "notes" || f.k.endsWith(".acc_notes");
          const filled = s.fields.filter((f) => !free(f) && isFilled(f, draft.answers[f.k])).length;
          const total = s.fields.filter((f) => !free(f)).length;
          const isOpen = !!open[s.id];
          return (
            <section key={s.id} className={`iSection${isOpen ? " open" : ""}`}>
              <button type="button" className="iSectionHead" aria-expanded={isOpen} onClick={() => setOpen({ ...open, [s.id]: !isOpen })}>
                <span className={`iSecN${filled === total ? " ok" : ""}`}>{filled === total ? <Icon.check /> : n + 1}</span>
                <span className="iSecT"><b>{s.title}</b><small>{filled} din {total} completate</small></span>
                <span className="iSecChev"><Icon.chevron /></span>
              </button>
              {isOpen && (
                <div className="iSectionBody">
                  {s.fields.map((f) => (
                    <div key={f.k} className={`iQ${f.kind === "util" ? " util" : ""}`}>
                      <span className="iQLabel">{f.label}{isFilled(f, draft.answers[f.k]) && <Icon.check />}</span>
                      <FieldInput f={f} answers={draft.answers} set={set} readOnly={ro} />
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
        <p className="hint center">Totul se salvează pe telefon pe măsură ce completezi{ctx.online ? " și se trimite automat ca ciornă" : ""}.</p>
      </div>
      <div className="iCta">
        <a className="iBtn big acc" href={`#/i/${encodeURIComponent(id)}/foto`}>Fotografii →</a>
      </div>
    </>
  );
}
