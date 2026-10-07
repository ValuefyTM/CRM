// Sends what was done on the phone (schedulings, photos, sheets) and refreshes the inspections list.
import {
  allDrafts, allOps, allPhotos, deleteOp, deletePhoto, getDraft, kvGet, kvSet, putDraft, putOp, putPhoto,
  type Insp, type ServerPhoto, type ServerSheet,
} from "./store";

export class AuthExpired extends Error {}
class Offline extends Error {}

type Json = Record<string, unknown>;

async function call<T = Json>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new Offline();
  }
  if (res.status === 401) throw new AuthExpired();
  const data = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok) {
    if (res.status >= 500) throw new Offline(); // try again later
    return { ok: false, status: res.status, error: (data.error as string) || "Cererea nu a putut fi trimisă." };
  }
  return { ok: true, data: data as T };
}

export type ListData = { inspections: Insp[]; at: string };
export type DetailData = { inspection: Insp; sheet: ServerSheet | null; photos: ServerPhoto[] };

export async function fetchList(): Promise<ListData | null> {
  try {
    const r = await call<ListData>("/api/insp/inspections");
    if (!r.ok) return null;
    await kvSet("list", r.data);
    return r.data;
  } catch (e) {
    if (e instanceof Offline) return null;
    throw e;
  }
}

export async function fetchDetail(id: string): Promise<DetailData | null> {
  try {
    const r = await call<DetailData>(`/api/insp/inspections/${encodeURIComponent(id)}`);
    if (!r.ok) return null;
    await kvSet(`detail:${id}`, r.data);
    return r.data;
  } catch (e) {
    if (e instanceof Offline) return null;
    throw e;
  }
}

export const cachedList = () => kvGet<ListData>("list");
export const cachedDetail = (id: string) => kvGet<DetailData>(`detail:${id}`);

let running: Promise<SyncResult> | null = null;
export type SyncResult = { offline: boolean; sent: number; errors: number };

/** One pass: schedulings, then photos, then sheets (a sheet is submitted only after all its photos are sent). */
export function syncAll(): Promise<SyncResult> {
  if (running) return running;
  running = (async () => {
    let sent = 0, errors = 0;
    try {
      for (const op of (await allOps()).sort((a, b) => a.created_at.localeCompare(b.created_at))) {
        if (op.error) { errors++; continue; }
        const r = await call(`/api/insp/inspections/${encodeURIComponent(op.inspection_id)}/schedule`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(op.body),
        });
        if (r.ok) { await deleteOp(op.id); sent++; } else { await putOp({ ...op, error: r.error }); errors++; }
      }

      const photos = await allPhotos();
      for (const p of photos) {
        if (p.deleted) {
          if (p.uploaded) {
            const r = await call(`/api/insp/inspections/${encodeURIComponent(p.inspection_id)}/photos/${encodeURIComponent(p.id)}`, { method: "DELETE" });
            if (!r.ok && r.status !== 404) { await putPhoto({ ...p, error: r.error }); errors++; continue; }
          }
          await deletePhoto(p.id);
          continue;
        }
        if (p.uploaded || p.error) { if (p.error) errors++; continue; }
        const f = new FormData();
        f.set("file", p.blob, `${p.id}.jpg`);
        f.set("id", p.id); f.set("category", p.category); f.set("caption", p.caption ?? ""); f.set("taken_at", p.taken_at);
        f.set("width", String(p.width)); f.set("height", String(p.height)); f.set("sort", String(p.sort));
        if (p.lat != null && p.lng != null) { f.set("lat", String(p.lat)); f.set("lng", String(p.lng)); }
        const r = await call(`/api/insp/inspections/${encodeURIComponent(p.inspection_id)}/photos`, { method: "POST", body: f });
        if (r.ok) { await putPhoto({ ...p, uploaded: true, error: null }); sent++; } else { await putPhoto({ ...p, error: r.error }); errors++; }
      }

      const left = await allPhotos();
      for (const d of await allDrafts()) {
        if (d.submitted || (!d.dirty && !d.submit) || d.error) { if (d.error) errors++; continue; }
        const pending = left.some((p) => p.inspection_id === d.id && !p.deleted && !p.uploaded);
        const submit = d.submit && !pending;
        const stamp = d.updated_at;
        const r = await call<{ sheet: ServerSheet }>(`/api/insp/inspections/${encodeURIComponent(d.id)}/sheet`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sheet_type: d.sheet_type, answers: d.answers, present_person: d.present_person, present_role: d.present_role, present_phone: d.present_phone,
            signature: d.signature, lat: d.lat, lng: d.lng, accuracy_m: d.accuracy_m, submit,
          }),
        });
        const now = await getDraft(d.id); // the inspector may have kept typing meanwhile
        if (!now) continue;
        if (r.ok) {
          const changed = now.updated_at !== stamp;
          await putDraft({ ...now, dirty: changed, submitted: submit, signature: changed ? now.signature : null, error: null });
          sent++;
        } else if (r.status === 409) {
          await putDraft({ ...now, dirty: false, submitted: true, error: null }); // already sent from another device
        } else {
          // A refused submission goes back to the inspector (e.g. missing photo); a refused draft is kept for later.
          await putDraft({ ...now, submit: false, error: r.error });
          errors++;
        }
      }
      await fetchList();
      return { offline: false, sent, errors };
    } catch (e) {
      if (e instanceof Offline) return { offline: true, sent, errors };
      throw e;
    } finally {
      running = null;
    }
  })();
  return running;
}
