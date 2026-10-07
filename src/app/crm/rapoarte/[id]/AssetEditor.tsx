"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { APPROACHES, ASSET_CATEGORIES, capType, type AssetForm } from "@/lib/asset-labels";

type Hit = { id: string; type: string | null; category: string | null; full_address: string | null; city: string | null; cf_number: string | null; cad_building: string | null; usable_area: number | null; reports: number; last_report: string | null };

async function send(url: string, init: RequestInit) {
  const r = await fetch(url, init).catch(() => null);
  const d = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
  return r?.ok ? null : d?.error || "Nu am putut salva. Încearcă din nou.";
}

/**
 * "+ Adaugă bun" / "Modifică": one asset of the report — a new property, or one already in the CRM (found by CF,
 * cadastral number or address, so its valuation history follows it) — with its own value and approach.
 */
export function AssetEditor({ report, initial, shared = 0, label, className }: { report: string; initial: AssetForm; shared?: number; label: string; className?: string }) {
  const editing = !!initial.id;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"new" | "find">("new");
  const [f, setF] = useState(initial);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [picked, setPicked] = useState<Hit | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof AssetForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const types = ASSET_CATEGORIES.find(([c]) => c === f.category)?.[2] ?? [];
  // A type outside the list (Glide history) is edited as free text.
  const custom0 = !!initial.type && !(ASSET_CATEGORIES.find(([c]) => c === initial.category)?.[2] ?? []).includes(initial.type);
  const [other, setOther] = useState(custom0);

  useEffect(() => {
    if (mode !== "find" || q.trim().length < 3) { setHits(null); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/crm/properties?q=${encodeURIComponent(q.trim())}`).catch(() => null);
      setHits(r?.ok ? ((await r.json()) as Hit[]) : []);
    }, 300);
    return () => clearTimeout(t);
  }, [q, mode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "find" && !picked) return setMsg("Caută și alege proprietatea din CRM.");
    if (mode === "new" && !f.type.trim()) return setMsg("Alege tipul bunului.");
    setBusy(true); setMsg("");
    const body = mode === "find" && picked ? { ...f, property_id: picked.id, type: picked.type ?? "" } : f;
    const error = await send(`/api/crm/reports/${report}/assets${editing ? `?asset=${encodeURIComponent(initial.id!)}` : ""}`,
      { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (error) return setMsg(error);
    location.reload();
  };

  return (
    <>
      <button type="button" className={className ?? (editing ? "linkBtn" : "btn btnNavy btnSm")} onClick={() => { setF(initial); setOther(custom0); setPicked(null); setQ(""); setMode("new"); setMsg(""); setOpen(true); }}>{label}</button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="assetTitle" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <form className="vfModalBox" style={{ width: "min(720px, 100%)" }} onSubmit={submit} noValidate>
            <h2 id="assetTitle">{editing ? "Modifică bunul" : "Adaugă un bun în raport"}</h2>
            {!editing && (
              <div className="segment" role="group" aria-label="Proprietate" style={{ maxWidth: 460 }}>
                <button type="button" aria-pressed={mode === "new"} onClick={() => setMode("new")}>Proprietate nouă</button>
                <button type="button" aria-pressed={mode === "find"} onClick={() => setMode("find")}>Din CRM (evaluată deja)</button>
              </div>
            )}
            {editing && shared > 0 && <div className="note">Proprietatea apare și în alte {shared} rapoarte: datele ei (adresă, CF, suprafețe) se schimbă și acolo. Valoarea și abordarea sunt doar ale acestui raport.</div>}

            {mode === "find" && !editing ? (
              <>
                <label className="field">Caută după nr. CF, nr. cadastral sau adresă
                  <input className="input" value={q} onChange={(e) => { setQ(e.target.value); setPicked(null); }} placeholder="ex. 412345 sau Str. Florilor" autoFocus />
                </label>
                {hits && (hits.length === 0 ? <p className="hint">Nicio proprietate găsită. Adaug-o ca proprietate nouă.</p> : (
                  <ul className="pickList">
                    {hits.map((h) => (
                      <li key={h.id}>
                        <button type="button" aria-pressed={picked?.id === h.id} onClick={() => setPicked(h)}>
                          <b>{capType(h.type) || "Proprietate"}{h.usable_area ? ` · ${h.usable_area} mp` : ""}</b>
                          <span className="muted">{[h.full_address ?? h.city, h.cf_number && `CF ${h.cf_number}`, h.cad_building && `cad. ${h.cad_building}`].filter(Boolean).join(" · ")}</span>
                          <span className="muted">{h.reports ? `evaluată în ${h.reports} ${h.reports === 1 ? "raport" : "rapoarte"}${h.last_report ? `, ultima dată ${h.last_report.split("-").reverse().join(".")}` : ""}` : "fără rapoarte"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ))}
              </>
            ) : (
              <>
                <div className="formRow">
                  <label className="field">Categorie
                    <select className="select" value={f.category} onChange={(e) => { setF({ ...f, category: e.target.value, type: "" }); setOther(false); }}>
                      {ASSET_CATEGORIES.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
                    </select>
                  </label>
                  <label className="field">Tip
                    {other || types.length === 0
                      ? <input className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value.toUpperCase() })} placeholder="ex. SPATIU DE BIROURI" />
                      : (
                        <select className="select" value={f.type} onChange={(e) => { if (e.target.value === "__other") { setOther(true); setF({ ...f, type: "" }); } else setF({ ...f, type: e.target.value }); }}>
                          <option value="">Alege…</option>
                          {types.map((t) => <option key={t} value={t}>{capType(t)}</option>)}
                          <option value="__other">Alt tip…</option>
                        </select>
                      )}
                  </label>
                  <label className="field">Stadiu
                    <select className="select" value={f.construction} onChange={set("construction")}><option value="existing">Existent</option><option value="under_construction">În construcție</option></select>
                  </label>
                </div>
                <div className="formRow">
                  <label className="field">Județ<input className="input" value={f.county} onChange={set("county")} /></label>
                  <label className="field">Localitate<input className="input" value={f.city} onChange={set("city")} /></label>
                </div>
                <label className="field">Adresa completă<input className="input" value={f.full_address} onChange={set("full_address")} placeholder="Strada, număr, bloc, scară, etaj, apartament" /></label>
                <div className="formRow">
                  <label className="field">Nr. CF<input className="input mono" value={f.cf_number} onChange={set("cf_number")} /></label>
                  <label className="field">Nr. cad. construcție<input className="input mono" value={f.cad_building} onChange={set("cad_building")} /></label>
                  <label className="field">Nr. cad. teren<input className="input mono" value={f.cad_land} onChange={set("cad_land")} /></label>
                </div>
                <div className="formRow">
                  <label className="field">Suprafață utilă (mp)<input className="input" inputMode="decimal" value={f.usable_area} onChange={set("usable_area")} /></label>
                  <label className="field">An construcție<input className="input" inputMode="numeric" value={f.year_built} onChange={set("year_built")} /></label>
                </div>
                <label className="field">Descriere <small>(opțional)</small><textarea className="textarea" rows={2} value={f.description} onChange={set("description")} /></label>
                {!editing && <p className="hint">Dacă nr. CF sau nr. cadastral există deja în CRM, bunul se leagă de proprietatea existentă (cu istoricul ei).</p>}
              </>
            )}

            <div className="section">În acest raport</div>
            <div className="formRow">
              <label className="field">Valoare (opțional)<input className="input" inputMode="decimal" value={f.value} onChange={set("value")} /></label>
              <label className="field">Abordare<select className="select" value={f.approach} onChange={set("approach")}>{APPROACHES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            </div>
            <label className="check"><input type="checkbox" checked={f.is_main} onChange={(e) => setF({ ...f, is_main: e.target.checked })} /><span>Bun principal al raportului</span></label>
            <label className="field">Note <small>(opțional)</small><input className="input" value={f.notes} onChange={set("notes")} /></label>
            {msg && <div role="alert" className="error">{msg}</div>}
            <div className="actions">
              <button type="submit" className="btn btnNavy" disabled={busy}>{busy ? "Se salvează…" : editing ? "Salvează" : "Adaugă bunul"}</button>
              <button type="button" className="btn btnGhost" onClick={() => setOpen(false)}>Renunță</button>
            </div>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
}

export function RemoveAsset({ report, asset, name }: { report: string; asset: string; name: string }) {
  return (
    <button type="button" className="linkBtn danger" onClick={async () => {
      if (!confirm(`Scoți „${name}” din raport? Proprietatea rămâne în CRM, cu celelalte evaluări ale ei.`)) return;
      const error = await send(`/api/crm/reports/${report}/assets?asset=${encodeURIComponent(asset)}`, { method: "DELETE" });
      if (error) return alert(error);
      location.reload();
    }}>Scoate</button>
  );
}
