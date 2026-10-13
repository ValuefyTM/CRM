"use client";
// Rooms of the floor survey (releveu): read by AI from the survey, checked and described at the visit (floor, walls,
// ceiling, condition) and photographed with their survey position ("Dormitor · rlv 4"), as the banks ask.

import { useRef, useState } from "react";
import type { Ctx } from "./InspApp";
import { newId } from "./store";
import { readRooms } from "./sync";
import { position, shrink, useDetail, useDraft, usePhotos } from "./hooks";
import { Chips, Icon, type Local } from "./ui";
import { DocsButton } from "./DocsViewer";
import { ROOM_FIELDS, ROOM_LEVELS, ROOMS_KEY, roomLabel, roomsOf, type Room } from "@/lib/insp-forms";

const STARE = ["Foarte bună", "Bună", "Satisfăcătoare", "Deteriorată"];
const num = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));
const full = (r: Room) => !!(r.floor?.length && r.walls?.length && r.condition);
const sumArea = (rooms: Room[]) => rooms.reduce((s, r) => s + (Number(r.area.replace(",", ".")) || 0), 0);
/** Photos of a room: the category from its name, the caption "Baie · rlv 5". */
export const roomCat = (r: Room) => (/buc[aă]t/i.test(r.name) ? "kitchen" : /baie|sanitar|\bwc\b|du[sș]/i.test(r.name) ? "bathroom" : "interior");

export function RoomsView({ ctx, id, item }: { ctx: Ctx; id: string; item: Local | undefined }) {
  const { detail } = useDetail(ctx, id);
  const { draft, update } = useDraft(ctx, id, item, detail);
  const { photos, add } = usePhotos(ctx, id, detail);
  const [sel, setSel] = useState<string | null>(null);
  const [editData, setEditData] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const cam = useRef<HTMLInputElement>(null);
  const target = useRef<Room | null>(null);
  const base = `#/i/${encodeURIComponent(id)}`;

  if (!draft) return (<div className="sLoading"><p className="iEmpty">Se încarcă…</p></div>);
  const ro = draft.submitted || draft.submit;
  const rooms = roomsOf(draft.answers);
  const done = rooms.filter(full).length;
  const onChange = (r: Room[]) => update({ answers: { ...draft.answers, [ROOMS_KEY]: r } });
  const set = (rid: string, patch: Partial<Room>) => onChange(rooms.map((r) => (r.id === rid ? { ...r, ...patch } : r)));
  const active = rooms.find((r) => r.id === sel) ?? rooms.find((r) => !full(r)) ?? null;
  const photosOf = (r: Room) => photos.filter((p) => p.caption === roomLabel(r)).length;

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
  const addRoom = () => { const r: Room = { id: newId(), pos: "", name: "", level: rooms.at(-1)?.level ?? "", area: "" }; onChange([...rooms, r]); setSel(r.id); setEditData(true); };
  const remove = (rid: string) => { if (confirm("Ștergi încăperea din listă?")) { onChange(rooms.filter((r) => r.id !== rid)); setSel(null); } };
  const nextAfter = (r: Room) => rooms.slice(rooms.indexOf(r) + 1).find((x) => !full(x)) ?? rooms.find((x) => !full(x) && x.id !== r.id);

  const take = (r: Room) => { target.current = r; cam.current?.click(); };
  const onFile = async (files: FileList | null) => {
    const r = target.current;
    if (!files?.length || !r) return;
    const pos = await position(4000);
    let sort = photos.length;
    for (const file of Array.from(files)) {
      const { blob, width, height } = await shrink(file);
      await add({ id: newId(), inspection_id: id, category: roomCat(r), caption: roomLabel(r), blob, width, height, taken_at: new Date().toISOString(),
        lat: pos?.coords.latitude ?? null, lng: pos?.coords.longitude ?? null, sort: sort++, uploaded: false, deleted: false, error: null });
    }
    if (cam.current) cam.current.value = "";
  };

  const summary = (r: Room) => [r.floor?.join(", "), r.walls?.join(", "), r.condition?.toLowerCase()].filter(Boolean).join(" · ");
  const total = sumArea(rooms);

  return (
    <>
      <header className="sHead">
        <div className="sHeadRow">
          <button type="button" className="iIconBtn" onClick={() => ctx.go(`${base}/fisa`)} aria-label="Înapoi la fișă"><Icon.back /></button>
          <span className="sHeadText"><b>Încăperi{rooms.length ? ` · ${done} din ${rooms.length}` : ""}</b><small>{rooms.length ? `Din releveu · total ${total.toLocaleString("ro-RO", { maximumFractionDigits: 2 })} mp` : "Citite din releveu sau adăugate de tine"}</small></span>
          <DocsButton docs={detail?.docs} type="rlv" label="Releveul" />
        </div>
      </header>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files)} />

      <div className="sBody">
        {!rooms.length && !ro && (
          <div className="rEmpty">
            <b>Lista încăperilor din releveu</b>
            <p>O citim din releveu cu AI: poziția, denumirea, nivelul și suprafața. Tu doar verifici și descrii fiecare încăpere.</p>
            <button type="button" className="iBtn big acc" onClick={fromSurvey} disabled={busy || !ctx.online}>{busy ? "Se citește releveul…" : "Citește din releveu"}</button>
            {!ctx.online && <p className="hint">Citirea are nevoie de semnal; încăperile se pot adăuga și manual.</p>}
          </div>
        )}
        {msg && <p className={`iNote ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>}

        {rooms.map((r) => {
          const isActive = active?.id === r.id;
          const n = photosOf(r);
          if (!isActive) {
            return (
              <button key={r.id} type="button" className={`rRow${full(r) ? " ok" : ""}`} onClick={() => { setSel(r.id); setEditData(!r.name); }}>
                <span className="rPos">{r.pos || "–"}</span>
                <span className="rText"><b>{r.name || "Încăpere fără nume"}{r.area ? ` · ${r.area} mp` : ""}</b>{full(r) ? <small>{summary(r)}</small> : null}</span>
                {full(r) ? <small className="rMeta">{n ? `${n} foto` : "fără foto"}</small> : <small className="rTodo">De descris</small>}
              </button>
            );
          }
          return (
            <fieldset key={r.id} className="rActive" disabled={ro}>
              <span className="rActiveHead">
                <span className="rPos on">{r.pos || "–"}</span>
                <span className="rText"><b>{r.name || "Încăpere nouă"}{r.area ? ` · ${r.area} mp` : ""}</b><small>{[r.level, r.pos && `rlv ${r.pos}`].filter(Boolean).join(" · ") || "fără nivel"}</small></span>
                {!ro && <button type="button" className="rEdit" onClick={() => setEditData(!editData)}>{editData ? "Gata" : "Date"}</button>}
              </span>
              {editData && (
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
              )}
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
              {!ro && (
                <button type="button" className="rShoot" onClick={() => take(r)}><Icon.camera />Fotografiază „{roomLabel(r)}”{n ? ` · ${n}` : ""}</button>
              )}
              {!ro && (
                <span className="rActiveFoot">
                  <button type="button" className="iTextBtn danger" onClick={() => remove(r.id)}>Șterge</button>
                  {nextAfter(r) && <button type="button" className="iBtn ghost" onClick={() => { setSel(nextAfter(r)!.id); setEditData(false); }}>Următoarea →</button>}
                </span>
              )}
            </fieldset>
          );
        })}
        {!ro && rooms.length > 0 && (
          <>
            <button type="button" className="rAdd" onClick={addRoom}>+ Încăpere care nu e în releveu</button>
            <button type="button" className="iTextBtn" onClick={fromSurvey} disabled={busy || !ctx.online}>{busy ? "Se citește releveul…" : "Recitește din releveu"}</button>
          </>
        )}
        {!ro && !rooms.length && <button type="button" className="rAdd" onClick={addRoom}>+ Adaugă manual</button>}
      </div>

      <div className="sFoot">
        <div className="sFootLinks two">
          <a href={`${base}/fisa`}>Fișa</a>
          <a href={`${base}/foto`}>Foto · {photos.length}</a>
        </div>
        <a className="sNext" href={`${base}/${rooms.length && done === rooms.length ? "foto" : "fisa"}`}>{rooms.length && done === rooms.length ? "Mai departe: fotografii →" : "Înapoi la fișă"}</a>
      </div>
    </>
  );
}
