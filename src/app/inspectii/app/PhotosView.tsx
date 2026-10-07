"use client";

import { useRef, useState } from "react";
import type { Ctx } from "./InspApp";
import { newId } from "./store";
import { position, shrink, useDetail, useDraft, usePhotos, type ShownPhoto } from "./hooks";
import { Icon, TopBar, type Local } from "./ui";
import { photoCategories } from "@/lib/insp-forms";

/** Photos by category, taken with the phone camera. Kept on the phone until they reach the server. */
export function PhotosView({ ctx, id, item }: { ctx: Ctx; id: string; item: Local | undefined }) {
  const { detail } = useDetail(ctx, id);
  const { draft } = useDraft(ctx, id, item, detail);
  const { photos, add, remove } = usePhotos(ctx, id, detail);
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<ShownPhoto | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const cat = useRef("exterior");
  const ro = !!draft?.submitted || !!draft?.submit;

  if (!draft) return (<><TopBar title="Fotografii" onBack={ctx.back} /><div className="iPad"><p className="iEmpty">Se încarcă…</p></div></>);
  const cats = photoCategories(draft.sheet_type);

  const take = (k: string, fromGallery = false) => { cat.current = k; (fromGallery ? gallery : input).current?.click(); };
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const k = cat.current;
    setBusy(k);
    const pos = await position(4000);
    let sort = photos.length;
    for (const file of Array.from(files)) {
      const { blob, width, height } = await shrink(file);
      await add({
        id: newId(), inspection_id: id, category: k, caption: null, blob, width, height, taken_at: new Date().toISOString(),
        lat: pos?.coords.latitude ?? null, lng: pos?.coords.longitude ?? null, sort: sort++, uploaded: false, deleted: false, error: null,
      });
    }
    setBusy(null);
    if (input.current) input.current.value = "";
    if (gallery.current) gallery.current.value = "";
  };

  const missingRequired = cats.filter((c) => c.required && !photos.some((p) => p.category === c.k));

  return (
    <>
      <TopBar title="Fotografii" sub={`${photos.length} ${photos.length === 1 ? "fotografie" : "fotografii"}`} onBack={() => ctx.go(`#/i/${encodeURIComponent(id)}/fisa`)} />
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFiles(e.target.files)} />
      <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      <div className="iPad withCta">
        {missingRequired.length > 0 && !ro && <p className="iNote warn">Obligatoriu: cel puțin o fotografie la „{missingRequired.map((c) => c.label).join("”, „")}”.</p>}
        {cats.map((c) => {
          const list = photos.filter((p) => p.category === c.k);
          return (
            <section key={c.k} className="iBox">
              <div className="iCardHead">
                <h3>{c.label}{c.required && <span className="iReq"> · obligatoriu</span>}</h3>
                <span className="muted">{list.length || ""}</span>
              </div>
              {list.length > 0 && (
                <div className="iThumbs">
                  {list.map((p) => (
                    <button key={p.id} type="button" className="iThumb" onClick={() => setView(p)} aria-label="Deschide fotografia">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.src} alt="" loading="lazy" />
                      {p.local && !p.local.uploaded && <span className="iThumbTag" title="Netrimisă"><Icon.upload /></span>}
                      {p.local?.error && <span className="iThumbTag err">!</span>}
                    </button>
                  ))}
                </div>
              )}
              {!ro && (
                <div className="iRow2 wide">
                  <button type="button" className="iBtn ghost" onClick={() => take(c.k)} disabled={busy !== null}>
                    <Icon.camera />{busy === c.k ? "Se pregătesc…" : list.length ? "Mai fotografiază" : "Fotografiază"}
                  </button>
                  <button type="button" className="iBtn ghost" onClick={() => take(c.k, true)} disabled={busy !== null}>Din galerie</button>
                </div>
              )}
            </section>
          );
        })}
      </div>
      <div className="iCta">
        <a className="iBtn big acc" href={`#/i/${encodeURIComponent(id)}/semnatura`}>Semnătură și trimitere →</a>
      </div>
      {view && (
        <div className="iViewer" role="dialog" aria-modal="true" aria-label="Fotografie">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={view.src} alt="" />
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
