"use client";
// Listing on valuefy.ro/imobiliare: texts (Romanian + English), report badge, publishing and photos. The link-preview
// image (WhatsApp, Facebook…) is redrawn and stored after each save and whenever the cover photo changes.

import { useEffect, useMemo, useRef, useState } from "react";
import { LISTING_STATUSES, LISTING_TYPES, photoUrl, siteUrl, type Listing } from "@/lib/listing-format";
import { uploadShareImage } from "@/lib/social-card";

type Form = {
  title: string; type: string; city: string; zone: string; price: string; surface: string; land: string; rooms: string; baths: string;
  floor: string; year: string; status: string; features: string; description: string; hasReport: boolean; report_date: string; published: boolean;
  title_en: string; description_en: string; features_en: string;
};

const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));

function toForm(l?: Listing): Form {
  return {
    title: s(l?.title), type: l?.type ?? "", city: s(l?.city), zone: s(l?.zone), price: s(l?.price), surface: s(l?.surface), land: s(l?.land),
    rooms: s(l?.rooms), baths: s(l?.baths), floor: s(l?.floor), year: s(l?.year), status: s(l?.status),
    features: (l?.features ?? []).join("\n"), description: (l?.description ?? []).join("\n\n"),
    hasReport: !!l?.report, report_date: l?.report?.date ?? "", published: l?.published ?? false,
    title_en: s(l?.en?.title), description_en: (l?.en?.description ?? []).join("\n\n"), features_en: (l?.en?.features ?? []).join("\n"),
  };
}

const lines = (v: string) => v.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
const paras = (v: string) => v.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);

/** Resize in the browser: max 1600 px, JPEG ~0.82 — keeps photos small for the database. */
async function resize(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("resize failed"))), "image/jpeg", 0.82));
}

export function ListingEditor({ base, listing, canDelete }: { base: string; listing?: Listing; canDelete: boolean }) {
  const [f, setF] = useState<Form>(toForm(listing));
  const [photos, setPhotos] = useState<string[]>(listing?.photoIds ?? []);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [upload, setUpload] = useState("");
  const [slug, setSlug] = useState(listing?.slug ?? "");
  const [live, setLive] = useState(listing?.published ?? false); // published as last saved
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  // The listing with the current form values — used to draw the link-preview image.
  const current = useMemo<Listing | null>(() => {
    if (!listing) return null;
    const num = (v: string) => (v.trim() ? Number(v.replace(",", ".")) || undefined : undefined);
    return {
      ...listing, slug,
      title: f.title, type: f.type, city: f.city, zone: f.zone, price: num(f.price) ?? 0, surface: num(f.surface), land: num(f.land),
      rooms: num(f.rooms), baths: num(f.baths), floor: f.floor || undefined, year: num(f.year), status: f.status || undefined,
      features: lines(f.features), description: paras(f.description),
      en: { title: f.title_en.trim() || undefined, description: paras(f.description_en), features: lines(f.features_en) },
      report: f.hasReport && f.report_date ? { date: f.report_date } : undefined, published: f.published,
      photoIds: photos, photos: photos.map(photoUrl),
    };
  }, [listing, f, photos, slug]);

  // Keep the stored link-preview image in sync: on first open when missing, and whenever the cover photo changes.
  const syncedCover = useRef<string | undefined>(listing?.hasSocial ? listing.photoIds[0] : "__none__");
  const syncShare = () => { if (current) uploadShareImage(current).catch(() => {}); };
  useEffect(() => {
    if (!current || syncedCover.current === photos[0]) return;
    syncedCover.current = photos[0];
    syncShare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos[0]]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("save");
    setMsg(null);
    const body = {
      ...f, features: lines(f.features),
      title_en: f.title_en, description_en: f.description_en, features_en: lines(f.features_en),
      report_date: f.hasReport ? f.report_date : "",
    };
    const r = await fetch(listing ? `/api/crm/listings/${listing.id}` : "/api/crm/listings", {
      method: listing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string; id?: string; slug?: string; en?: { title: string; description: string; features: string[] } } | undefined;
    setBusy("");
    if (!r?.ok) return setMsg({ ok: false, text: d?.error || "Nu am putut salva. Verifică conexiunea și încearcă din nou." });
    if (!listing && d?.id) { location.href = `${base}/anunturi/${d.id}?nou=1`; return; }
    setMsg({ ok: true, text: "Modificările au fost salvate." });
    setLive(f.published);
    if (d?.slug) setSlug(d.slug);
    // The server may have filled in the English texts by translating automatically.
    if (d?.en && !f.title_en.trim() && !f.description_en.trim() && (d.en.title || d.en.description)) {
      const en = d.en;
      setF((p) => ({ ...p, title_en: en.title, description_en: en.description, features_en: en.features.join("\n") }));
      setMsg({ ok: true, text: "Salvat. Varianta în engleză a fost tradusă automat." });
    }
    syncShare();
  };

  const [enMsg, setEnMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const translate = async () => {
    if (!f.title.trim() && !f.description.trim()) return setEnMsg({ ok: false, text: "Completează întâi titlul și descrierea în română." });
    const hasEnglish = f.title_en.trim() || f.description_en.trim() || f.features_en.trim();
    if (hasEnglish && !confirm("Înlocuiești textele în engleză cu traducerea automată?")) return;
    setBusy("translate");
    setEnMsg(null);
    try {
      const r = await fetch("/api/crm/listings/translate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: f.title, description: paras(f.description), features: lines(f.features) }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string; title?: string; description?: string[]; features?: string[] };
      if (!r.ok || !d.title) return setEnMsg({ ok: false, text: d.error || "Traducerea automată nu a reușit. Încearcă din nou." });
      setF((p) => ({ ...p, title_en: d.title ?? "", description_en: (d.description ?? []).join("\n\n"), features_en: (d.features ?? []).join("\n") }));
      setEnMsg({ ok: true, text: "Tradus. Verifică textul, apoi salvează." });
    } catch {
      setEnMsg({ ok: false, text: "Traducerea automată nu a reușit. Verifică conexiunea și încearcă din nou." });
    } finally {
      setBusy("");
    }
  };

  const addPhotos = async (files: FileList | null) => {
    if (!listing || !files?.length) return;
    const list = Array.from(files).filter((x) => x.type.startsWith("image/"));
    for (let i = 0; i < list.length; i++) {
      setUpload(`Se încarcă ${i + 1} din ${list.length}…`);
      try {
        const blob = await resize(list[i]);
        const fd = new FormData();
        fd.append("photos", new File([blob], list[i].name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }));
        const r = await fetch(`/api/crm/listings/${listing.id}/photos`, { method: "POST", body: fd });
        const d = (await r.json().catch(() => ({}))) as { ids?: string[]; error?: string };
        if (r.ok && d.ids) setPhotos((p) => [...p, ...d.ids!]);
        else setMsg({ ok: false, text: d.error || `Nu am putut încărca ${list[i].name}.` });
      } catch {
        setMsg({ ok: false, text: `Fișierul ${list[i].name} nu a putut fi procesat.` });
      }
    }
    setUpload("");
  };

  const saveOrder = async (next: string[]) => {
    setPhotos(next);
    if (listing) await fetch(`/api/crm/listings/${listing.id}/photos`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: next }) });
  };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= photos.length) return;
    const next = [...photos];
    [next[i], next[j]] = [next[j], next[i]];
    saveOrder(next);
  };
  const remove = async (id: string) => {
    if (!confirm("Ștergi această fotografie?")) return;
    const r = await fetch(`/api/crm/listings/photos/${id}`, { method: "DELETE" });
    if (r.ok) setPhotos((p) => p.filter((x) => x !== id));
  };
  const deleteListing = async () => {
    if (!listing || !confirm(`Ștergi definitiv anunțul „${listing.title}” și fotografiile lui?`)) return;
    const r = await fetch(`/api/crm/listings/${listing.id}`, { method: "DELETE" });
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    if (r.ok) location.href = `${base}/anunturi`;
    else setMsg({ ok: false, text: d.error || "Nu am putut șterge anunțul." });
  };
  // Drafts are not visible on the site: a preview link opens them anyway (valid 7 days).
  const preview = async () => {
    if (!listing) return;
    const w = window.open("", "_blank");
    const r = await fetch(`/api/crm/listings/${listing.id}/preview`, { method: "POST" }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { url?: string; error?: string } | undefined;
    if (d?.url && w) w.location.href = d.url;
    else { w?.close(); setMsg({ ok: false, text: d?.error || "Nu am putut deschide previzualizarea." }); }
  };

  // Read ?nou=1 after mount so server and client render the same markup.
  const [isNew, setIsNew] = useState(false);
  useEffect(() => setIsNew(new URLSearchParams(location.search).has("nou")), []);

  return (
    <>
      {isNew && <div className="okMsg">Anunțul a fost creat ca ciornă. Adaugă fotografiile, apoi bifează „Publicat pe site” și salvează.</div>}
      {listing && (
        <div className="actions">
          {live
            ? <a className="btn btnGhost btnSm" href={siteUrl(slug)} target="_blank" rel="noopener">Vezi pe valuefy.ro ↗</a>
            : <button type="button" className="btn btnGhost btnSm" onClick={preview}>Previzualizează pe site ↗</button>}
          <span className="muted">valuefy.ro/imobiliare/{slug}</span>
        </div>
      )}

      <form className="card" onSubmit={save}>
        <h2>Informații</h2>
        <div className="grid2">
          <label className="field span2">Titlu anunț *<input className="input" value={f.title} onChange={set("title")} placeholder="ex. Apartament 3 camere, renovat, zona Complex Studențesc" required /></label>
          <label className="field">Tip *
            <select className="select" value={f.type} onChange={set("type")} required>
              <option value="">Alege</option>
              {LISTING_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="field">Preț (EUR) *<input className="input" inputMode="numeric" value={f.price} onChange={set("price")} placeholder="ex. 142000" required /></label>
          <label className="field">Localitate *<input className="input" value={f.city} onChange={set("city")} placeholder="ex. Timișoara" required /></label>
          <label className="field"><span>Zonă / cartier <small>(opțional)</small></span><input className="input" value={f.zone} onChange={set("zone")} placeholder="ex. Complex Studențesc" /></label>
        </div>
        <div className="grid3">
          <label className="field">Suprafață utilă (m²)<input className="input" inputMode="decimal" value={f.surface} onChange={set("surface")} /></label>
          <label className="field">Teren (m²)<input className="input" inputMode="decimal" value={f.land} onChange={set("land")} /></label>
          <label className="field">An construcție<input className="input" inputMode="numeric" value={f.year} onChange={set("year")} /></label>
          <label className="field">Camere<input className="input" inputMode="numeric" value={f.rooms} onChange={set("rooms")} /></label>
          <label className="field">Băi<input className="input" inputMode="numeric" value={f.baths} onChange={set("baths")} /></label>
          <label className="field">Etaj<input className="input" value={f.floor} onChange={set("floor")} placeholder="ex. 3 din 4" /></label>
          <label className="field">Etichetă
            <select className="select" value={f.status} onChange={set("status")}>
              <option value="">Fără</option>
              {LISTING_STATUSES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <label className="field"><span>Descriere <small>(lasă un rând liber între paragrafe)</small></span>
          <textarea className="textarea" value={f.description} onChange={set("description")} rows={7} />
        </label>
        <label className="field"><span>Dotări <small>(câte una pe rând, ex. Centrală proprie)</small></span>
          <textarea className="textarea" value={f.features} onChange={set("features")} rows={5} />
        </label>

        <div className="section">Varianta în engleză</div>
        <p className="hint">Apare pe site-ul în engleză. Dacă lași câmpurile goale, se traduc automat la salvare.</p>
        <div className="actions">
          <button type="button" className="btn btnGhost btnSm" onClick={translate} disabled={busy === "translate"}>
            {busy === "translate" ? "Se traduce…" : "Tradu automat din română"}
          </button>
        </div>
        {enMsg && <div role={enMsg.ok ? "status" : "alert"} className={enMsg.ok ? "okMsg" : "error"}>{enMsg.text}</div>}
        <label className="field">Titlu (EN)<input className="input" value={f.title_en} onChange={set("title_en")} lang="en" placeholder="ex. Renovated 3-room flat, Complex Studențesc area" /></label>
        <label className="field">Descriere (EN)<textarea className="textarea" value={f.description_en} onChange={set("description_en")} rows={7} lang="en" /></label>
        <label className="field">Dotări (EN)<textarea className="textarea" value={f.features_en} onChange={set("features_en")} rows={5} lang="en" /></label>

        <div className="section">Raport de evaluare și publicare</div>
        <label className="check"><input type="checkbox" checked={f.hasReport} onChange={set("hasReport")} />Proprietatea are raport de evaluare</label>
        {f.hasReport && <label className="field" style={{ maxWidth: 240 }}>Luna raportului<input className="input" type="month" value={f.report_date} onChange={set("report_date")} required /></label>}
        <p className="hint">Pe site apare insigna „Raport de evaluare” și butonul „Solicită raportul”. Cererile ajung pe email și la „Cereri primite”.</p>
        <label className="check lstPublish"><input type="checkbox" checked={f.published} onChange={set("published")} /><span><b>Publicat pe site</b> — anunțul este vizibil pe valuefy.ro</span></label>

        {msg && <div role={msg.ok ? "status" : "alert"} className={msg.ok ? "okMsg" : "error"}>{msg.text}</div>}
        <div className="actions">
          <button type="submit" className="btn btnGold" disabled={busy === "save"}>{busy === "save" ? "Se salvează…" : listing ? "Salvează" : "Creează anunțul"}</button>
          {listing && canDelete && <button type="button" className="btn btnDanger" onClick={deleteListing}>Șterge anunțul</button>}
        </div>
      </form>

      <section className="card">
        <h2>Fotografii</h2>
        {!listing ? (
          <p className="hint">Creează întâi anunțul, apoi poți adăuga fotografii.</p>
        ) : (
          <>
            <p className="hint">Prima fotografie este coperta și apare în imaginea de previzualizare a linkului. Fotografiile se micșorează automat înainte de încărcare.</p>
            <label className="btn btnGhost btnSm lstUpload">
              <input type="file" accept="image/*" multiple onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} disabled={!!upload} />
              {upload || "+ Adaugă fotografii"}
            </label>
            {photos.length > 0 && (
              <ul className="lstPhotos">
                {photos.map((id, i) => (
                  <li key={id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoUrl(id)} alt="" />
                    {i === 0 && <span className="lstCover">Copertă</span>}
                    <div className="lstPhotoBtns">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Mută mai în față">←</button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === photos.length - 1} aria-label="Mută mai în spate">→</button>
                      <button type="button" onClick={() => remove(id)} aria-label="Șterge fotografia">✕</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </>
  );
}
