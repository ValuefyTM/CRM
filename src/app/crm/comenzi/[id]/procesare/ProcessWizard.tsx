"use client";

import { useEffect, useRef, useState } from "react";
import { ASSET_CATEGORIES, capType, emptyAsset, type AssetForm } from "@/lib/asset-labels";
import { PURPOSES } from "@/lib/order-labels";

type Person = { id: string; name: string; role: string };
type OrderInfo = {
  id: string; bank: string | null; ref: string | null; client: string | null; phone: string | null; email: string | null; branch: string | null; link: string | null;
  contract_id: string | null; fee: number | null; report_type: string | null; purpose: string | null; urgent: boolean; source: string; city: string | null; address: string | null;
};
type Extracted = {
  client: { name: string | null; kind: "person" | "company" | null; phone: string | null; email: string | null; cui: string | null };
  contact: { name: string | null; phone: string | null };
  bank: { branch: string | null; consultant: string | null; product: string | null; report_type: string | null; deadline: string | null };
  assets: { category: string | null; type: string | null; county: string | null; city: string | null; full_address: string | null; cf_number: string | null; cad_building: string | null;
    cad_land: string | null; usable_area: number | null; land_area: number | null; rooms: number | null; year_built: number | null }[];
  notes: string | null;
};

const STEPS = ["Captură din aplicația băncii", "Client", "Bunuri evaluate", "Dosar și echipă"];
const s = (v: unknown) => (v == null ? "" : String(v));

/**
 * Processing a bank order in four steps. The screenshot of the bank's app (pasted with Ctrl+V or chosen) is read
 * automatically to fill in the next steps; every field stays editable, and the steps also work without it.
 */
export function ProcessWizard(p: {
  order: OrderInfo; base: string; me: string; canRead: boolean; screens: { id: string; name: string; href: string }[];
  contracts: { id: string; label: string; fee: number | null }[]; evaluators: Person[]; inspectors: Person[];
}) {
  const o = p.order;
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [read, setRead] = useState<"" | "busy" | "done" | "error">("");
  const [readMsg, setReadMsg] = useState("");
  const [client, setClient] = useState({ kind: "person", name: o.client ?? "", phone: o.phone ?? "", email: o.email ?? "", cui: "", contact_name: "", contact_phone: "" });
  const [bank, setBank] = useState({ branch: o.branch ?? "", consultant: "", purpose: o.purpose ?? "Credit bancar", report_type: o.report_type ?? "", notes: "" });
  const [assets, setAssets] = useState<AssetForm[]>([{ ...emptyAsset({ city: o.city }), full_address: o.address ?? "", is_main: true }]);
  const [dos, setDos] = useState({
    contract_id: o.contract_id ?? "", fee: o.fee ? String(o.fee) : "", urgent: o.urgent, evaluator_id: p.evaluators.some((e) => e.id === p.me) ? p.me : "",
    verifier_id: "", inspector_id: "", inspection_due: "", due_on: "", instructions: "",
  });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Ctrl+V of a screenshot anywhere on the first step.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (step !== 0) return;
      const imgs = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (imgs.length) { e.preventDefault(); add(imgs); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });
  const add = (list: File[]) => setFiles((cur) => [...cur, ...list.filter((f) => /^image\/(png|jpeg|webp|gif)$/.test(f.type))].slice(0, 4));

  const fill = (x: Extracted) => {
    setClient((c) => ({
      ...c, kind: x.client.kind ?? c.kind, name: x.client.name ?? c.name, phone: x.client.phone ?? c.phone, email: x.client.email ?? c.email, cui: x.client.cui ?? c.cui,
      contact_name: x.contact.name ?? c.contact_name, contact_phone: x.contact.phone ?? c.contact_phone,
    }));
    setBank((b) => ({ ...b, branch: x.bank.branch ?? b.branch, consultant: x.bank.consultant ?? b.consultant, report_type: x.bank.report_type ?? b.report_type,
      notes: [b.notes, x.bank.product && `Produs: ${x.bank.product}`, x.notes].filter(Boolean).join("\n") }));
    if (x.bank.deadline && /^\d{4}-\d{2}-\d{2}$/.test(x.bank.deadline)) setDos((d) => ({ ...d, due_on: x.bank.deadline! }));
    if (x.assets.length) setAssets(x.assets.map((a, i) => ({
      ...emptyAsset(), category: a.category ?? "REZIDENTIAL", type: (a.type ?? "").toUpperCase(), county: s(a.county), city: s(a.city), full_address: s(a.full_address),
      cf_number: s(a.cf_number), cad_building: s(a.cad_building), cad_land: s(a.cad_land), usable_area: s(a.usable_area), year_built: s(a.year_built),
      description: [a.rooms ? `${a.rooms} camere` : "", a.land_area ? `teren ${a.land_area} mp` : ""].filter(Boolean).join(" · "), is_main: i === 0,
    })));
  };

  const readScreens = async () => {
    if (!files.length) return setReadMsg("Adaugă întâi o captură.");
    setRead("busy"); setReadMsg("");
    const f = new FormData();
    files.forEach((x) => f.append("files", x));
    const r = await fetch(`/api/crm/orders/${o.id}/extract`, { method: "POST", body: f }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { data?: Extracted | null; error?: string; stored?: number } | undefined;
    if (r?.ok && d && d.data === null) { setRead("done"); setFiles([]); setReadMsg(`${d.stored} ${d.stored === 1 ? "captură salvată" : "capturi salvate"} la comandă. Completează datele în pașii următori.`); setStep(1); return; }
    if (!r?.ok || !d?.data) { setRead("error"); setReadMsg(d?.error || "Nu am putut citi capturile. Completează datele manual."); return; }
    fill(d.data);
    setRead("done");
    setReadMsg(`Am completat ${d.data.assets.length || "0"} ${d.data.assets.length === 1 ? "bun" : "bunuri"} și datele clientului. Verifică fiecare câmp în pașii următori.`);
    setStep(1);
  };

  const check = (i: number) => {
    if (i >= 1 && !client.name.trim()) return "Completează numele clientului.";
    if (i >= 2) for (const [n, a] of assets.entries()) {
      if (!a.type.trim()) return `Bunul ${n + 1}: alege tipul.`;
      if (!a.city.trim() && !a.full_address.trim() && a.category !== "BUN MOBIL") return `Bunul ${n + 1}: completează localitatea sau adresa.`;
    }
    return "";
  };
  const go = (to: number) => { const e = to > step ? check(step) : ""; if (e) return setMsg(e); setMsg(""); setStep(to); };

  const submit = async () => {
    const e = check(3) || (!dos.evaluator_id ? "Alege evaluatorul principal." : "");
    if (e) return setMsg(e);
    setBusy(true); setMsg("");
    const r = await fetch(`/api/crm/orders/${o.id}/process`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client, bank, assets: assets.map((a, i) => ({ ...a, is_main: i === 0 })), dossier: dos }),
    }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { report?: string; error?: string; inspectionError?: string | null } | undefined;
    setBusy(false);
    if (!r?.ok || !d?.report) return setMsg(d?.error || "Nu am putut procesa comanda. Încearcă din nou.");
    if (d.inspectionError) alert(`Dosarul s-a deschis, dar inspecția nu a fost alocată: ${d.inspectionError}`);
    location.href = `${p.base}/rapoarte/${d.report}`;
  };

  const setA = (i: number, k: keyof AssetForm, v: string) => setAssets(assets.map((a, j) => (j === i ? { ...a, [k]: v, ...(k === "category" ? { type: "" } : {}) } : a)));

  return (
    <div className="wizard">
      <ol className="wizSteps" aria-label="Pași">
        {STEPS.map((l, i) => (
          <li key={l} className={i < step ? "past" : i === step ? "on" : ""}>
            <button type="button" onClick={() => go(i)} disabled={i > step + 1}><span className="dot">{i < step ? "✓" : i + 1}</span>{l}</button>
          </li>
        ))}
      </ol>

      <section className="card">
        <div className="note" style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
          <span><b>{o.bank ?? "Bancă"} {o.ref}</b>{o.client ? ` · ${o.client}` : ""}{o.report_type ? ` · ${o.report_type}` : ""}</span>
          {o.link && <a className="rowLink" href={o.link} target="_blank" rel="noopener noreferrer">Deschide cererea în aplicația băncii ↗</a>}
        </div>

        {step === 0 && (
          <>
            <h2>Captură din aplicația băncii</h2>
            <p className="hint">Deschide cererea în aplicația băncii, fă o captură de ecran (sau mai multe: date client, bun, documente) și lipește-o aici cu <b>Ctrl+V</b>, ori alege fișierele. {p.canRead ? "Citesc datele și completez pașii următori; tu verifici." : "Citirea automată nu e configurată încă: capturile se păstrează la comandă, iar datele le completezi manual."}</p>
            <div className={`dropZone${files.length ? " has" : ""}`} onClick={() => fileInput.current?.click()} onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); add([...e.dataTransfer.files]); }} role="button" tabIndex={0}>
              {files.length ? (
                <div className="thumbs">
                  {files.map((f, i) => (
                    <figure key={i}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={URL.createObjectURL(f)} alt={f.name} />
                      <button type="button" aria-label="Scoate" onClick={(e) => { e.stopPropagation(); setFiles(files.filter((_, j) => j !== i)); }}>×</button>
                    </figure>
                  ))}
                </div>
              ) : <span>Lipește captura (Ctrl+V), trage-o aici sau <u>alege fișiere</u> · până la 4 imagini PNG / JPG</span>}
              <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => { add([...(e.target.files ?? [])]); e.target.value = ""; }} />
            </div>
            {p.screens.length > 0 && <p className="hint">Capturi salvate deja la comandă: {p.screens.map((x, i) => <a key={x.id} className="rowLink" href={x.href} target="_blank" rel="noopener">{i ? ", " : ""}{x.name}</a>)}</p>}
            {readMsg && <div role={read === "error" ? "alert" : "status"} className={read === "error" ? "error" : "okMsg"}>{readMsg}</div>}
            <div className="actions">
              {p.canRead
                ? <button type="button" className="btn btnGold" disabled={!files.length || read === "busy"} onClick={readScreens}>{read === "busy" ? "Citesc capturile…" : "Citește datele din capturi"}</button>
                : files.length > 0 && <button type="button" className="btn btnGold" disabled={read === "busy"} onClick={readScreens}>{read === "busy" ? "Se salvează…" : "Salvează capturile și continuă"}</button>}
              <button type="button" className="btn btnGhost" onClick={() => go(1)}>Completez manual →</button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2>Client</h2>
            {readMsg && read === "done" && <div role="status" className="okMsg">{readMsg}</div>}
            <div className="segment" role="group" aria-label="Tip client" style={{ maxWidth: 380 }}>
              <button type="button" aria-pressed={client.kind === "person"} onClick={() => setClient({ ...client, kind: "person" })}>Persoană fizică</button>
              <button type="button" aria-pressed={client.kind === "company"} onClick={() => setClient({ ...client, kind: "company" })}>Persoană juridică</button>
            </div>
            <div className="formRow">
              <label className="field">{client.kind === "company" ? "Denumire firmă" : "Nume și prenume"}<input className="input" value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} /></label>
              {client.kind === "company" && <label className="field">CUI<input className="input mono" value={client.cui} onChange={(e) => setClient({ ...client, cui: e.target.value })} /></label>}
            </div>
            <div className="formRow">
              <label className="field">Telefon<input className="input" type="tel" value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} /></label>
              <label className="field">Email<input className="input" type="email" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} /></label>
            </div>
            <div className="formRow">
              <label className="field">Contact la inspecție <small>(dacă nu e clientul)</small><input className="input" value={client.contact_name} onChange={(e) => setClient({ ...client, contact_name: e.target.value })} /></label>
              <label className="field">Telefon contact<input className="input" type="tel" value={client.contact_phone} onChange={(e) => setClient({ ...client, contact_phone: e.target.value })} /></label>
            </div>
            <div className="section">Banca</div>
            <div className="formRow">
              <label className="field">Agenție / sucursală<input className="input" value={bank.branch} onChange={(e) => setBank({ ...bank, branch: e.target.value })} /></label>
              <label className="field">Consultant bancă <small>(nume, telefon)</small><input className="input" value={bank.consultant} onChange={(e) => setBank({ ...bank, consultant: e.target.value })} /></label>
            </div>
            <div className="formRow">
              <label className="field">Scop
                <select className="select" value={bank.purpose} onChange={(e) => setBank({ ...bank, purpose: e.target.value })}>{PURPOSES.map((x) => <option key={x} value={x}>{x}</option>)}</select>
              </label>
              <label className="field">Tip cerere / raport<input className="input" value={bank.report_type} onChange={(e) => setBank({ ...bank, report_type: e.target.value })} /></label>
            </div>
            <label className="field">Observații <small>(opțional)</small><textarea className="textarea" rows={2} value={bank.notes} onChange={(e) => setBank({ ...bank, notes: e.target.value })} /></label>
          </>
        )}

        {step === 2 && (
          <>
            <div className="cardHead"><h2>Bunuri evaluate</h2><button type="button" className="btn btnGhost btnSm" onClick={() => setAssets([...assets, { ...emptyAsset({ county: assets[0]?.county, city: assets[0]?.city }), is_main: false }])}>+ Încă un bun</button></div>
            <p className="hint">Fiecare bun (apartament, loc de parcare, boxă, teren) separat: are valoarea și inspecția lui. Primul e bunul principal.</p>
            {assets.map((a, i) => {
              const types = ASSET_CATEGORIES.find(([c]) => c === a.category)?.[2] ?? [];
              return (
                <div key={i} className="assetBox">
                  <div className="cardHead">
                    <b>{i === 0 ? "Bun principal" : `Bunul ${i + 1}`}{a.type ? ` · ${capType(a.type)}` : ""}</b>
                    {assets.length > 1 && <button type="button" className="linkBtn danger" onClick={() => setAssets(assets.filter((_, j) => j !== i))}>Scoate</button>}
                  </div>
                  <div className="formRow">
                    <label className="field">Categorie<select className="select" value={a.category} onChange={(e) => setA(i, "category", e.target.value)}>{ASSET_CATEGORIES.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select></label>
                    <label className="field">Tip
                      {types.length && (types.includes(a.type) || !a.type)
                        ? <select className="select" value={a.type} onChange={(e) => setA(i, "type", e.target.value === "__other" ? " " : e.target.value)}>
                            <option value="">Alege…</option>{types.map((t) => <option key={t} value={t}>{capType(t)}</option>)}<option value="__other">Alt tip…</option>
                          </select>
                        : <input className="input" value={a.type.trim()} onChange={(e) => setA(i, "type", e.target.value.toUpperCase())} placeholder="ex. SPATIU DE BIROURI" />}
                    </label>
                  </div>
                  <div className="formRow">
                    <label className="field">Județ<input className="input" value={a.county} onChange={(e) => setA(i, "county", e.target.value)} /></label>
                    <label className="field">Localitate<input className="input" value={a.city} onChange={(e) => setA(i, "city", e.target.value)} /></label>
                  </div>
                  <label className="field">Adresa completă<input className="input" value={a.full_address} onChange={(e) => setA(i, "full_address", e.target.value)} /></label>
                  <div className="formRow">
                    <label className="field">Nr. CF<input className="input mono" value={a.cf_number} onChange={(e) => setA(i, "cf_number", e.target.value)} /></label>
                    <label className="field">Nr. cad. construcție<input className="input mono" value={a.cad_building} onChange={(e) => setA(i, "cad_building", e.target.value)} /></label>
                    <label className="field">Nr. cad. teren<input className="input mono" value={a.cad_land} onChange={(e) => setA(i, "cad_land", e.target.value)} /></label>
                  </div>
                  <div className="formRow">
                    <label className="field">Suprafață utilă (mp)<input className="input" inputMode="decimal" value={a.usable_area} onChange={(e) => setA(i, "usable_area", e.target.value)} /></label>
                    <label className="field">An construcție<input className="input" inputMode="numeric" value={a.year_built} onChange={(e) => setA(i, "year_built", e.target.value)} /></label>
                    <label className="field">Descriere<input className="input" value={a.description} onChange={(e) => setA(i, "description", e.target.value)} placeholder="ex. 3 camere · teren 450 mp" /></label>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {step === 3 && (
          <>
            <h2>Dosar și echipă</h2>
            <div className="formRow">
              {o.source === "bank" && (
                <label className="field">Contract cadru
                  <select className="select" value={dos.contract_id} onChange={(e) => { const c = p.contracts.find((x) => x.id === e.target.value); setDos({ ...dos, contract_id: e.target.value, fee: dos.fee || (c?.fee ? String(c.fee) : "") }); }}>
                    <option value="">Fără contract</option>{p.contracts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </label>
              )}
              <label className="field">Onorariu fără TVA (lei)<input className="input" inputMode="decimal" value={dos.fee} onChange={(e) => setDos({ ...dos, fee: e.target.value })} /></label>
            </div>
            <div className="formRow">
              <label className="field">Evaluator principal
                <select className="select" value={dos.evaluator_id} onChange={(e) => setDos({ ...dos, evaluator_id: e.target.value })}>
                  <option value="">Alege…</option>{p.evaluators.map((x) => <option key={x.id} value={x.id}>{x.id === p.me ? `${x.name} (eu)` : x.name}</option>)}
                </select>
              </label>
              <label className="field">Verificator <small>(opțional)</small>
                <select className="select" value={dos.verifier_id} onChange={(e) => setDos({ ...dos, verifier_id: e.target.value })}>
                  <option value="">Mai târziu</option>{p.evaluators.filter((x) => x.id !== dos.evaluator_id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
              <label className="field">Termen predare raport<input className="input" type="date" value={dos.due_on} onChange={(e) => setDos({ ...dos, due_on: e.target.value })} /></label>
            </div>
            <div className="formRow">
              <label className="field">Inspecțiile le face <small>(opțional, pentru {assets.length === 1 ? "bun" : `toate cele ${assets.length} bunuri`})</small>
                <select className="select" value={dos.inspector_id} onChange={(e) => setDos({ ...dos, inspector_id: e.target.value })}>
                  <option value="">Le aloc mai târziu</option>{p.inspectors.map((x) => <option key={x.id} value={x.id}>{x.id === p.me ? `${x.name} (eu)` : x.name} · {x.role}</option>)}
                </select>
              </label>
              <label className="field">Inspecție până la<input className="input" type="date" value={dos.inspection_due} onChange={(e) => setDos({ ...dos, inspection_due: e.target.value })} disabled={!dos.inspector_id} /></label>
            </div>
            {dos.inspector_id && <label className="field">Instrucțiuni pentru inspector <small>(opțional)</small><textarea className="textarea" rows={2} value={dos.instructions} onChange={(e) => setDos({ ...dos, instructions: e.target.value })} /></label>}
            <label className="check"><input type="checkbox" checked={dos.urgent} onChange={(e) => setDos({ ...dos, urgent: e.target.checked })} /><span>Urgent</span></label>
            <div className="summaryBox">
              <b>{client.name || "—"}</b>{client.phone ? ` · ${client.phone}` : ""}
              <span className="muted block">{assets.length} {assets.length === 1 ? "bun" : "bunuri"}: {assets.map((a) => capType(a.type) || "bun").join(", ")}</span>
            </div>
          </>
        )}

        {msg && <div role="alert" className="error">{msg}</div>}
        {step > 0 && (
          <div className="actions" style={{ justifyContent: "space-between" }}>
            <button type="button" className="btn btnGhost" onClick={() => go(step - 1)}>← Înapoi</button>
            {step < 3
              ? <button type="button" className="btn btnNavy" onClick={() => go(step + 1)}>Continuă →</button>
              : <button type="button" className="btn btnGold" disabled={busy} onClick={submit}>{busy ? "Se procesează…" : "Procesează și deschide dosarul"}</button>}
          </div>
        )}
      </section>
    </div>
  );
}
