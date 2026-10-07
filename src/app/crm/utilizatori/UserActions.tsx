"use client";
// Profile photo (upload, cropped to a square on the page, or remove) and deleting an account.
import { useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import type { Presence } from "@/lib/presence";

/** Center square of the picture, 400 × 400 JPEG: small and quick to upload. */
async function square(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  const s = Math.min(bmp.width, bmp.height), out = Math.min(400, s);
  const c = document.createElement("canvas");
  c.width = out; c.height = out;
  c.getContext("2d")!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, out, out);
  bmp.close?.();
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.88));
  if (!blob) throw new Error("crop");
  return blob;
}

export function ProfileCard(p: {
  id: string; name: string; sub: string; seen: string | null; presence: Presence | null; photo: string | null; canEdit: boolean; note?: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState(p.photo);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setMsg("");
    try {
      const body = new FormData();
      body.set("file", new File([await square(f)], "avatar.jpg", { type: "image/jpeg" }));
      const r = await fetch(`/api/crm/users/${encodeURIComponent(p.id)}/avatar`, { method: "POST", body });
      const d = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!r.ok || !d.url) setMsg(d.error || "Fotografia nu a putut fi salvată.");
      else setPhoto(d.url);
    } catch { setMsg("Fișierul nu pare o fotografie. Alege un JPG sau PNG."); }
    setBusy(false);
  };
  const remove = async () => {
    if (!confirm("Ștergi fotografia de profil?")) return;
    setBusy(true);
    const r = await fetch(`/api/crm/users/${encodeURIComponent(p.id)}/avatar`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (r?.ok) setPhoto(null); else setMsg("Fotografia nu a putut fi ștearsă.");
  };
  return (
    <section className="card profileCard">
      <div className="profileTop">
        <div className="profilePic">
          <Avatar id={p.id} name={p.name} size={84} presence={p.presence} photo={photo} />
          {p.canEdit && (
            <button type="button" className="profileCam" aria-label="Schimbă fotografia" disabled={busy} onClick={() => input.current?.click()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
            </button>
          )}
        </div>
        <div className="profileText">
          <h2>{p.name}</h2>
          <span className="muted">{p.sub}</span>
          {p.seen && <span className={`pSeen ${p.presence ?? ""}`}><i />{p.seen}</span>}
          {p.canEdit && (
            <span className="actions" style={{ marginTop: 6 }}>
              <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Se încarcă…" : photo ? "Schimbă fotografia" : "Adaugă fotografie"}</button>
              {photo && <button type="button" className="linkBtn danger" disabled={busy} onClick={remove}>Șterge fotografia</button>}
            </span>
          )}
          {msg && <span role="alert" className="error inlineErr">{msg}</span>}
        </div>
      </div>
      {p.note && <div className="note">{p.note}</div>}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
    </section>
  );
}

export function DeleteUser({ id, name, back, compact }: { id: string; name: string; back?: string; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className={compact ? "iconBtn danger" : "btn btnDanger btnSm"} disabled={busy} title="Șterge utilizatorul" aria-label={`Șterge ${name}`}
      onClick={async () => {
        if (!confirm(`Ștergi contul lui ${name}?\n\nNu se mai poate autentifica și dispare din liste. Dacă apare în rapoarte, comenzi sau inspecții, numele rămâne acolo în istoric.`)) return;
        setBusy(true);
        const r = await fetch(`/api/crm/users/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
        const d = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
        setBusy(false);
        if (!r?.ok) return alert(d?.error || "Contul nu a putut fi șters.");
        if (back) location.href = back; else location.reload();
      }}>
      {compact ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" /></svg>
      ) : busy ? "Se șterge…" : "Șterge utilizatorul"}
    </button>
  );
}
