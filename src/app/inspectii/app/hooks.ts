"use client";
// The sheet and photos of one inspection: what the phone keeps, completed with what the server already has.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Ctx } from "./InspApp";
import { allPhotos, getDraft, putDraft, putPhoto, type Draft, type LocalPhoto, type ServerPhoto } from "./store";
import { AuthExpired, cachedDetail, fetchDetail, type DetailData } from "./sync";
import type { Local } from "./ui";

export function useDetail(ctx: Ctx, id: string) {
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let off = false;
    cachedDetail(id).then((d) => { if (!off && d) setDetail(d); });
    fetchDetail(id)
      .then((d) => { if (off) return; if (d) setDetail(d); else if (navigator.onLine) cachedDetail(id).then((c) => { if (!off && !c) setMissing(true); }); })
      .catch((e) => { if (e instanceof AuthExpired) location.href = `${ctx.base}/login`; });
    return () => { off = true; };
  }, [id, ctx.base, ctx.lastSync]);
  return { detail, missing };
}

const blank = (item: Local | undefined, id: string): Draft => ({
  id, sheet_type: item?.sheet_type ?? "apartament", answers: {}, present_person: item?.contact_name ?? "", present_role: item?.contact_kind === "owner" ? "owner" : "",
  present_phone: item?.contact_phone ?? "", signature: null, lat: null, lng: null, accuracy_m: null, updated_at: new Date().toISOString(),
  dirty: false, submit: false, submitted: false, error: null,
});

/** The sheet being filled in. Every change is saved on the phone at once and sent a few seconds later (when there is signal). */
export function useDraft(ctx: Ctx, id: string, item: Local | undefined, detail: DetailData | null) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const cur = useRef<Draft | null>(null);
  const from = useRef<"" | "phone" | "server" | "blank">("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { sync, reload } = ctx;
  const set = (d: Draft) => { cur.current = d; setDraft(d); };

  // Loaded once: what the phone has, else the sheet saved on the server, else an empty sheet.
  useEffect(() => {
    if (from.current === "phone" || from.current === "server") return;
    let off = false;
    getDraft(id).then((d) => {
      if (off || from.current === "phone" || from.current === "server") return;
      if (d) { from.current = "phone"; return set(d); }
      const s = detail?.sheet;
      if (s && !cur.current?.dirty) {
        from.current = "server";
        set({
          ...blank(item, id), sheet_type: s.sheet_type, answers: s.answers ?? {}, present_person: s.present_person ?? "", present_role: s.present_role ?? "",
          present_phone: s.present_phone ?? "", submitted: s.status === "submitted", updated_at: s.updated_at ?? new Date().toISOString(),
        });
      } else if (!cur.current && (item || detail)) { from.current = "blank"; set(blank(item ?? detail?.inspection, id)); }
    });
    return () => { off = true; };
  }, [id, item, detail]);

  // What sync did meanwhile (sent, refused, accepted) comes back from the phone storage; the answers on screen are kept.
  useEffect(() => {
    getDraft(id).then((d) => {
      const c = cur.current;
      if (d && c && (d.submitted !== c.submitted || d.submit !== c.submit || d.error !== c.error || d.dirty !== c.dirty)) {
        set({ ...c, submitted: d.submitted, submit: d.submit, error: d.error, dirty: d.dirty && c.dirty, signature: d.signature });
      }
    });
  }, [id, ctx.pending, ctx.lastSync]);

  const update = useCallback((patch: Partial<Draft>) => {
    const c = cur.current;
    if (!c || c.submitted) return;
    const next: Draft = { ...c, ...patch, updated_at: new Date().toISOString(), dirty: true, error: null };
    from.current = "phone";
    set(next);
    putDraft(next).then(() => reload());
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (navigator.onLine) sync(); }, 4000);
  }, [reload, sync]);

  return { draft, update };
}

export type ShownPhoto = { id: string; category: string; caption: string | null; src: string; local: LocalPhoto | null; server: ServerPhoto | null };

/** Photos of the inspection: on the server and taken on the phone (not sent yet). */
export function usePhotos(ctx: Ctx, id: string, detail: DetailData | null) {
  const [local, setLocal] = useState<LocalPhoto[]>([]);
  const urls = useRef(new Map<string, string>());

  const load = useCallback(async () => setLocal((await allPhotos()).filter((p) => p.inspection_id === id)), [id]);
  useEffect(() => { load(); }, [load, ctx.pending.photos.length, ctx.lastSync]);
  useEffect(() => () => { for (const u of urls.current.values()) URL.revokeObjectURL(u); }, []);

  const src = (p: LocalPhoto) => {
    let u = urls.current.get(p.id);
    if (!u) { u = URL.createObjectURL(p.blob); urls.current.set(p.id, u); }
    return u;
  };
  const deleted = new Set(local.filter((p) => p.deleted).map((p) => p.id));
  const shown: ShownPhoto[] = [
    ...(detail?.photos ?? []).filter((p) => !deleted.has(p.id) && !local.some((l) => l.id === p.id && !l.deleted)).map((p) => ({ id: p.id, category: p.category, caption: p.caption, src: p.url, local: null, server: p })),
    ...local.filter((p) => !p.deleted).sort((a, b) => a.taken_at.localeCompare(b.taken_at)).map((p) => ({ id: p.id, category: p.category, caption: p.caption, src: src(p), local: p, server: null })),
  ];

  const add = async (p: LocalPhoto) => { await putPhoto(p); await load(); await ctx.reload(); if (navigator.onLine) ctx.sync(); };
  const remove = async (s: ShownPhoto) => {
    if (s.local) await putPhoto({ ...s.local, deleted: true });
    else if (s.server) await putPhoto({ id: s.id, inspection_id: id, category: s.category, caption: s.caption, blob: new Blob(), width: 0, height: 0, taken_at: new Date().toISOString(), lat: null, lng: null, sort: 0, uploaded: true, deleted: true, error: null });
    await load(); await ctx.reload(); if (navigator.onLine) ctx.sync();
  };
  return { photos: shown, add, remove };
}

/** Shrinks a camera photo to at most 2000 px (JPEG ~85%), so it uploads quickly on a weak signal. */
export async function shrink(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const MAX = 2000;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const k = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
    if (blob) return { blob, width: w, height: h };
  } catch { /* fall back to the original file */ }
  return { blob: file, width: 0, height: 0 };
}

/** Current position, if the phone allows it (used for photos and the signature). */
export function position(timeout = 10000): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout, maximumAge: 120000 });
  });
}
