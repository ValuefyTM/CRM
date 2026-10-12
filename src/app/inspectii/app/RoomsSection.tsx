"use client";
// Rooms of the floor survey (releveu): read by AI from the survey, checked and completed at the visit (floor, walls,
// ceiling, condition). The banks want every room described and photographed with its survey position ("Baie · rlv 5").

import { useState } from "react";
import { ROOM_FIELDS, ROOM_LEVELS, roomLabel, type Room } from "@/lib/insp-forms";
import { newId } from "./store";
import { readRooms } from "./sync";
import { Chips, Icon } from "./ui";

const STARE = ["Foarte bună", "Bună", "Satisfăcătoare", "Deteriorată"];
const num = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));

export function RoomsSection({ id, rooms, onChange, readOnly, n, online }: {
  id: string; rooms: Room[]; onChange: (r: Room[]) => void; readOnly: boolean; n: number; online: boolean;
}) {
  const [open, setOpen] = useState(rooms.length === 0);
  const [edit, setEdit] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const done = rooms.filter((r) => r.floor?.length && r.walls?.length && r.condition).length;

  const fromSurvey = async () => {
    if (rooms.length && !confirm("Recitești releveul? Încăperile cu aceeași poziție își păstrează ce ai completat, celelalte se înlocuiesc.")) return;
    setBusy(true); setMsg(null);
    const r = await readRooms(id);
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    if (!r.data.rooms.length) return setMsg({ ok: false, text: "Nu am găsit încăperi în releveu. Adaugă-le manual." });
    // Keep what was filled in for rooms that are still there (same position, or same name when unnumbered).
    const key = (x: { pos?: string | null; name: string }) => (x.pos ? `p:${x.pos}` : `n:${x.name.toLowerCase()}`);
    const old = new Map(rooms.map((x) => [key(x), x]));
    onChange(r.data.rooms.map((x) => {
      const prev = old.get(key(x));
      return { ...(prev ?? {}), id: prev?.id ?? newId(), pos: x.pos ?? "", name: x.name, level: x.level ?? prev?.level ?? "", area: num(x.area) || prev?.area || "" };
    }));
    setMsg({ ok: true, text: `Am citit ${r.data.rooms.length} încăperi${r.data.usable_total ? ` (Su totală ${num(r.data.usable_total)} m²)` : ""}. Verifică-le la fața locului.${r.data.note ? ` ${r.data.note}` : ""}` });
  };

  const set = (rid: string, patch: Partial<Room>) => onChange(rooms.map((r) => (r.id === rid ? { ...r, ...patch } : r)));
  const add = () => { const r: Room = { id: newId(), pos: "", name: "", level: rooms.at(-1)?.level ?? "", area: "" }; onChange([...rooms, r]); setEdit(r.id); };
  const remove = (rid: string) => { if (confirm("Ștergi încăperea din listă?")) onChange(rooms.filter((r) => r.id !== rid)); };

  return (
    <section className={`iSection${open ? " open" : ""}`}>
      <button type="button" className="iSectionHead" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`iSecN${rooms.length && done === rooms.length ? " ok" : ""}`}>{rooms.length && done === rooms.length ? <Icon.check /> : n}</span>
        <span className="iSecT"><b>Încăperi (din releveu)</b><small>{rooms.length ? `${done} din ${rooms.length} descrise` : "nicio încăpere încă"}</small></span>
        <span className="iSecChev"><Icon.chevron /></span>
      </button>
      {open && (
        <div className="iSectionBody">
          {!readOnly && (
            <div className="iRow2 wide">
              <button type="button" className="iBtn acc" onClick={fromSurvey} disabled={busy || !online}>
                {busy ? "Se citește releveul…" : rooms.length ? "Recitește din releveu (AI)" : "Citește din releveu (AI)"}
              </button>
              <button type="button" className="iBtn ghost" onClick={add}>+ Încăpere</button>
            </div>
          )}
          {!online && !readOnly && <p className="hint">Citirea din releveu are nevoie de semnal; încăperile se pot adăuga și manual.</p>}
          {msg && <p className={`iNote ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>}
          {rooms.length > 0 && (
            <ul className="iRooms">
              {rooms.map((r) => {
                const full = !!(r.floor?.length && r.walls?.length && r.condition);
                const isEdit = edit === r.id;
                return (
                  <li key={r.id} className={isEdit ? "open" : ""}>
                    <button type="button" className="iRoomHead" onClick={() => setEdit(isEdit ? null : r.id)} aria-expanded={isEdit}>
                      <span className={`iRoomPos${full ? " ok" : ""}`}>{r.pos || "–"}</span>
                      <span className="iRoomT"><b>{r.name || "Încăpere fără nume"}</b><small>{[r.level, r.area && `${r.area} m²`, full ? "descrisă" : "de descris"].filter(Boolean).join(" · ")}</small></span>
                      <span className="iSecChev"><Icon.chevron /></span>
                    </button>
                    {isEdit && (
                      <fieldset className="iRoomBody" disabled={readOnly}>
                        <div className="iRoomGrid">
                          <label>Poziție rlv<input inputMode="decimal" value={r.pos} onChange={(e) => set(r.id, { pos: e.target.value })} /></label>
                          <label className="wide">Denumire<input value={r.name} onChange={(e) => set(r.id, { name: e.target.value })} placeholder="ex. Dormitor" /></label>
                          <label>Suprafață m²<input inputMode="decimal" value={r.area} onChange={(e) => set(r.id, { area: e.target.value })} /></label>
                          <label className="wide">Nivel
                            <select value={r.level} onChange={(e) => set(r.id, { level: e.target.value })}>
                              <option value="">—</option>
                              {[...new Set([...ROOM_LEVELS, r.level].filter(Boolean))].map((l) => <option key={l}>{l}</option>)}
                            </select>
                          </label>
                        </div>
                        {(["floor", "walls"] as const).map((k) => (
                          <div key={k} className="iQ"><span className="iQLabel">{ROOM_FIELDS[k].label}</span>
                            <Chips label={ROOM_FIELDS[k].label} opts={[...ROOM_FIELDS[k].opts]} value={r[k] ?? []} multi onChange={(v) => set(r.id, { [k]: v })} />
                          </div>
                        ))}
                        <div className="iQ"><span className="iQLabel">{ROOM_FIELDS.ceiling.label}</span>
                          <Chips label={ROOM_FIELDS.ceiling.label} opts={[...ROOM_FIELDS.ceiling.opts]} value={r.ceiling ? [r.ceiling] : []} onChange={(v) => set(r.id, { ceiling: v[0] ?? "" })} />
                        </div>
                        <div className="iQ"><span className="iQLabel">Stare</span>
                          <Chips label="Stare" opts={STARE} value={r.condition ? [r.condition] : []} onChange={(v) => set(r.id, { condition: v[0] ?? "" })} />
                        </div>
                        <label className="iRoomNote">Observații<input value={r.notes ?? ""} onChange={(e) => set(r.id, { notes: e.target.value })} placeholder="ex. infiltrații la colțul ferestrei" /></label>
                        {!readOnly && <button type="button" className="iBtn ghost danger" onClick={() => remove(r.id)}><Icon.trash />Șterge încăperea</button>}
                      </fieldset>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {rooms.length > 0 && <p className="hint">Fotografiile se fac pe încăperi, în pasul următor, și primesc automat numele: „{roomLabel(rooms[0])}”.</p>}
        </div>
      )}
    </section>
  );
}
