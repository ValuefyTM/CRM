"use client";

import { useRef, useState } from "react";
import type { Ctx } from "./InspApp";
import { newId } from "./store";
import { position, shrink, useDetail, useDraft, usePhotos, type ShownPhoto } from "./hooks";
import { Icon, type Local } from "./ui";
import { roomCat } from "./RoomsView";
import { photoCategories, roomLabel, roomsOf } from "@/lib/insp-forms";

type Group = { key: string; title: string; cat: string; caption: string | null; list: ShownPhoto[]; required?: boolean; kind: "room" | "cat" };

/** Photos by room of the survey and by category, taken with the phone camera. Kept on the phone until they reach the server. */
export function PhotosView({ ctx, id, item }: { ctx: Ctx; id: string; item: Local | undefined }) {
  const { detail } = useDetail(ctx, id);
  const { draft } = useDraft(ctx, id, item, detail);
  const { photos, add, remove } = usePhotos(ctx, id, detail);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<ShownPhoto | null>(null);
  const [filter, setFilter] = useState<"all" | "rooms" | string>("all");
  const [target, setTarget] = useState<string>("");
  const input = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const shot = useRef<Group | null>(null);
  const base = `#/i/${encodeURIComponent(id)}`;

  if (!draft) return (<div className="sLoading"><p className="iEmpty">Se încarcă…</p></div>);
  const ro = !!draft.submitted || !!draft.submit;
  const rooms = roomsOf(draft.answers);
  const roomLabels = new Set(rooms.map(roomLabel));
  const groups: Group[] = [
    ...rooms.map((r) => ({ key: `r:${r.id}`, title: roomLabel(r), cat: roomCat(r), caption: roomLabel(r), list: photos.filter((p) => p.caption === roomLabel(r)), kind: "room" as const })),
    ...photoCategories(draft.sheet_type).map((c) => ({
      key: `c:${c.k}`, title: c.label, cat: c.k, caption: null, required: c.required, kind: "cat" as const,
      list: photos.filter((p) => p.category === c.k && !(p.caption && roomLabels.has(p.caption))),
    })),
  ];
  // Where the next photo goes: chosen, else the first room without a photo, else the exterior.
  const tgt = groups.find((g) => g.key === target) ?? groups.find((g) => g.kind === "room" && !g.list.length) ?? groups.find((g) => g.key === "c:exterior")!;
  // All: the rooms, the required categories and those with photos (the others are reached with "merge la").
  const shown = filter === "all" ? groups.filter((g) => g.kind === "room" || g.required || g.list.length || g.key === tgt.key)
    : filter === "rooms" ? groups.filter((g) => g.kind === "room") : groups.filter((g) => g.key === filter);
  const onPhone = photos.filter((p) => p.local && !p.local.uploaded).length;
  const missing = groups.filter((g) => g.required && !g.list.length);

  const take = (g: Group, fromGallery = false) => { shot.current = g; (fromGallery ? gallery : input).current?.click(); };
  const onFiles = async (files: FileList | null) => {
    const g = shot.current;
    if (!files?.length || !g) return;
    setBusy(true);
    const pos = await position(4000);
    let sort = photos.length;
    for (const file of Array.from(files)) {
      const { blob, width, height } = await shrink(file);
      await add({
        id: newId(), inspection_id: id, category: g.cat, caption: g.caption, blob, width, height, taken_at: new Date().toISOString(),
        lat: pos?.coords.latitude ?? null, lng: pos?.coords.longitude ?? null, sort: sort++, uploaded: false, deleted: false, error: null,
      });
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    if (gallery.current) gallery.current.value = "";
  };

  const chips: [string, string, number][] = [
    ["all", "Toate", photos.length],
    ...(rooms.length ? [["rooms", "Încăperi", groups.filter((g) => g.kind === "room").reduce((s, g) => s + g.list.length, 0)] as [string, string, number]] : []),
    ...groups.filter((g) => g.kind === "cat" && (g.list.length || g.required)).map((g) => [g.key, g.title.split(" / ")[0], g.list.length] as [string, string, number]),
  ];

  return (
    <>
      <header className="sHead">
        <div className="sHeadRow">
          <button type="button" className="iIconBtn" onClick={() => ctx.go(`${base}/fisa`)} aria-label="Înapoi la fișă"><Icon.back /></button>
          <span className="sHeadText"><b>Fotografii · {photos.length}</b><small>Cu dată și locație{photos.length ? ` · ${photos.length - onPhone} trimise${onPhone ? `, ${onPhone} pe telefon` : ""}` : ""}</small></span>
        </div>
        <nav className="sNav" aria-label="Categorii">
          {chips.map(([k, l, n]) => <button key={k} type="button" aria-current={filter === k ? "step" : undefined} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l} · {n}</button>)}
        </nav>
      </header>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFiles(e.target.files)} />
      <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />

      <div className="sBody">
        {missing.length > 0 && !ro && <p className="iNote warn">Obligatoriu: cel puțin o fotografie la „{missing.map((c) => c.title).join("”, „")}”.</p>}
        {shown.map((g) => (
          <section key={g.key} className="pGroup">
            <span className="pGroupHead"><b>{g.title}{g.required && <span className="iReq"> · obligatoriu</span>}</b><small>{g.list.length} foto</small></span>
            <div className="pTiles">
              {g.list.map((p) => (
                <button key={p.id} type="button" className="pTile" onClick={() => setView(p)} aria-label="Deschide fotografia">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.src} alt="" loading="lazy" />
                  {p.local && !p.local.uploaded && <span className="pTag">PE TELEFON</span>}
                  {p.local?.error && <span className="pTag err">EROARE</span>}
                </button>
              ))}
              {!ro && <button type="button" className="pAdd" aria-label={`Fotografiază: ${g.title}`} onClick={() => take(g)} disabled={busy}>+</button>}
            </div>
          </section>
        ))}
      </div>

      <div className="sFoot">
        {!ro ? (
          <>
            <label className="pTarget"><small>Următoarea poză merge la</small>
              <select value={tgt.key} onChange={(e) => setTarget(e.target.value)}>
                {rooms.length > 0 && <optgroup label="Încăperi">{groups.filter((g) => g.kind === "room").map((g) => <option key={g.key} value={g.key}>{g.title}{g.list.length ? "" : " · fără foto"}</option>)}</optgroup>}
                <optgroup label="Categorii">{groups.filter((g) => g.kind === "cat").map((g) => <option key={g.key} value={g.key}>{g.title}</option>)}</optgroup>
              </select>
            </label>
            <div className="pShootRow">
              <button type="button" className="sNext" onClick={() => take(tgt)} disabled={busy}><Icon.camera />{busy ? "Se pregătesc…" : "Fotografiază"}</button>
              <button type="button" className="pGallery" onClick={() => take(tgt, true)} disabled={busy}>Galerie</button>
            </div>
            <a className="pOn" href={`${base}/semnatura`}>Mai departe: semnătură și trimitere →</a>
          </>
        ) : (
          <a className="sNext" href={`${base}/semnatura`}>Semnătură și trimitere →</a>
        )}
      </div>

      {view && (
        <div className="iViewer" role="dialog" aria-modal="true" aria-label="Fotografie">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={view.src} alt="" />
          {view.caption && <p className="pCaption">{view.caption}</p>}
          <div className="iViewerBar">
            <button type="button" className="iBtn ghost light" onClick={() => setView(null)}>Închide</button>
            {!ro && (
              <button type="button" className="iBtn danger" onClick={async () => { if (confirm("Ștergi fotografia?")) { await remove(view); setView(null); } }}>
                <Icon.trash />Șterge
              </button>
            )}
          </div>
          {view.local?.error && <p className="iNote err">{view.local.error}</p>}
        </div>
      )}
    </>
  );
}
