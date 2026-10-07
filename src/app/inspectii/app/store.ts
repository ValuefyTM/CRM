// What the phone keeps (IndexedDB): the last list and details from the server, the sheets being filled in, the photos
// not sent yet and the schedulings made without signal. Everything is sent by sync.ts when the signal is back.
import type { Answers, SheetType } from "@/lib/insp-forms";

export type InspStatus = "to_schedule" | "scheduled" | "done" | "cancelled";
export type Insp = {
  id: string; status: InspStatus; scheduled_at: string | null; done_at: string | null; duration_min: number | null;
  sheet_type: SheetType; property_label: string; address: string; city: string | null; county: string | null;
  lat: number | null; lng: number | null; cf_number: string | null; cad: string | null; usable_area: number | null; year_built: number | null;
  contact_kind: string | null; contact_name: string | null; contact_phone: string | null; notes: string | null;
  report_number: string | null; report_label: string | null; purpose: string | null; client: string | null; bank: string | null;
  reschedule_count: number; contact_notified_at: string | null; started_at: string | null;
  sheet_status: "draft" | "submitted" | null; updated_at: string | null;
};
export type ServerSheet = {
  id: string; status: "draft" | "submitted"; sheet_type: SheetType; answers: Answers; present_person: string | null; present_role: string | null;
  present_phone: string | null; has_signature: boolean; submitted_at: string | null; updated_at: string | null;
};
export type ServerPhoto = { id: string; category: string; caption: string | null; url: string; taken_at: string | null; width: number | null; height: number | null };

/** The sheet as it is being filled in on the phone. */
export type Draft = {
  id: string; // inspection id
  sheet_type: SheetType;
  answers: Answers;
  present_person: string; present_role: string; present_phone: string;
  signature: string | null; // PNG data URL, until sent
  lat: number | null; lng: number | null; accuracy_m: number | null;
  updated_at: string;
  dirty: boolean; // changed since the last time it reached the server
  submit: boolean; // the inspector pressed "Trimite fișa"
  submitted: boolean; // the server accepted the sheet
  error: string | null;
};

/** A photo taken on the phone (kept until the server has it). */
export type LocalPhoto = {
  id: string; inspection_id: string; category: string; caption: string | null; blob: Blob; width: number; height: number;
  taken_at: string; lat: number | null; lng: number | null; sort: number;
  uploaded: boolean; deleted: boolean; error: string | null;
};

/** A scheduling made on the phone, waiting to be sent. */
export type ScheduleOp = {
  id: string; inspection_id: string; created_at: string;
  body: { scheduled_at: string; duration_min: number; contact_name: string; contact_phone: string; notes: string; reason: string; contact_notified: boolean };
  error: string | null;
};

const DB = "vf-insp";
const STORES = ["kv", "drafts", "photos", "ops"] as const;
type Store = (typeof STORES)[number];

let dbp: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === "kv" ? undefined : "id" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => { dbp = null; reject(r.error); };
  });
  return dbp;
}

function tx<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req ? (req.result as T) : (undefined as T));
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export const kvGet = <T>(key: string) => tx<T | undefined>("kv", "readonly", (s) => s.get(key));
export const kvSet = (key: string, value: unknown) => tx("kv", "readwrite", (s) => { s.put(value, key); });

export const getDraft = (id: string) => tx<Draft | undefined>("drafts", "readonly", (s) => s.get(id));
export const putDraft = (d: Draft) => tx("drafts", "readwrite", (s) => { s.put(d); });
export const allDrafts = () => tx<Draft[]>("drafts", "readonly", (s) => s.getAll());
export const deleteDraft = (id: string) => tx("drafts", "readwrite", (s) => { s.delete(id); });

export const putPhoto = (p: LocalPhoto) => tx("photos", "readwrite", (s) => { s.put(p); });
export const allPhotos = () => tx<LocalPhoto[]>("photos", "readonly", (s) => s.getAll());
export const deletePhoto = (id: string) => tx("photos", "readwrite", (s) => { s.delete(id); });

export const putOp = (o: ScheduleOp) => tx("ops", "readwrite", (s) => { s.put(o); });
export const allOps = () => tx<ScheduleOp[]>("ops", "readonly", (s) => s.getAll());
export const deleteOp = (id: string) => tx("ops", "readwrite", (s) => { s.delete(id); });

/** Signs out: nothing of the previous user stays on the phone. */
export async function wipe() {
  const db = await open();
  await Promise.all(STORES.map((s) => new Promise<void>((res) => { const t = db.transaction(s, "readwrite"); t.objectStore(s).clear(); t.oncomplete = () => res(); t.onerror = () => res(); })));
}

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

// ---------- dates (visits are Bucharest local time "YYYY-MM-DDTHH:MM"; the phone is assumed to be in Romania) ----------

export const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localStamp = (d: Date) => `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const parseLocal = (s: string) => {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0)) : null;
};
const WD = ["duminică", "luni", "marți", "miercuri", "joi", "vineri", "sâmbătă"];
const MO = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"];
export const MONTHS = MO;
export const fmtDay = (d: Date) => `${WD[d.getDay()]}, ${d.getDate()} ${MO[d.getMonth()]}`;
export const fmtTime = (s: string | null) => (s && s.length >= 16 ? s.slice(11, 16) : "");
export function fmtWhen(s: string | null) {
  const d = s ? parseLocal(s) : null;
  if (!d) return "Neprogramată";
  const today = new Date();
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 864e5);
  const day = diff === 0 ? "Azi" : diff === 1 ? "Mâine" : diff === -1 ? "Ieri" : fmtDay(d).replace(/^./, (c) => c.toUpperCase());
  return `${day}, ${fmtTime(s)}`;
}
