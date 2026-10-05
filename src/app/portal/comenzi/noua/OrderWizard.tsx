"use client";

import { useRef, useState } from "react";
import { ACCEPT, AREA_FIELDS, BANKS, DOCS, MAX_FILE_MB, PROPERTY_TYPES, PURPOSES, propertyLabel, type PropertyType } from "@/lib/order-labels";

type Me = { kind: "partner" | "client"; name: string; phone: string; email: string };
type Upload = { kind: string; file: File };

const STEPS = ["Proprietatea", "Scop și termen", "Client și inspecție", "Documente și trimitere"];
const STEPS_CLIENT = ["Proprietatea", "Scop și termen", "Contact și inspecție", "Documente și trimitere"];
const ICON: Record<PropertyType, string> = { apartment: "▦", house: "⌂", land: "▱", commercial: "▤", industrial: "▥", other: "◇" };

const digits = (s: string) => s.replace(/\D/g, "").length;
const okEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/** "Comandă nouă" — four steps from the design handoff (§6). Documents are optional: missing ones mark the order "Documente lipsă". */
export function OrderWizard({ me, base }: { me: Me; base: string }) {
  const self = me.kind === "client";
  const [step, setStep] = useState(0);
  const [f, setF] = useState({
    property_type: "" as PropertyType | "", city: "", address: "", surface_area: "", rooms: "", land_area: "",
    purpose: "", bank: "", urgent: false,
    client_name: self ? me.name : "", client_phone: self ? me.phone : "", client_email: "",
    other_contact: false, contact_name: "", contact_phone: "", inspection_notes: "", may_contact_client: true, notes: "",
  });
  const [files, setFiles] = useState<Upload[]>([]);
  const [error, setError] = useState("");
  const [bad, setBad] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const type = f.property_type || null;
  const area = type ? AREA_FIELDS[type] : null;
  const docs = type ? DOCS[type] : [];
  const required = docs.filter((d) => !d.optional);
  const haveReq = required.filter((d) => files.some((u) => u.kind === d.key)).length;
  const titles = self ? STEPS_CLIENT : STEPS;

  const check = (s: number) => {
    const b: string[] = [];
    let msg = "";
    if (s === 0) {
      if (!f.property_type) msg = "Alege tipul proprietății.";
      if (!f.city.trim()) b.push("city");
      if (!f.address.trim()) b.push("address");
      if (!msg && b.length) msg = "Completează localitatea și adresa.";
    }
    if (s === 1 && !f.purpose) msg = "Alege scopul evaluării.";
    if (s === 2) {
      if (!self && !f.client_name.trim()) b.push("client_name");
      if (digits(f.client_phone) < 9) b.push("client_phone");
      if (!self && f.client_email.trim() && !okEmail(f.client_email)) b.push("client_email");
      if (f.other_contact) {
        if (!f.contact_name.trim()) b.push("contact_name");
        if (digits(f.contact_phone) < 9) b.push("contact_phone");
      }
      if (b.length) msg = b.includes("client_email") && b.length === 1 ? "Adresa de email a clientului nu pare validă." : "Completează câmpurile marcate. Telefonul are cel puțin 9 cifre.";
    }
    setBad(b); setError(msg);
    return !msg;
  };
  const next = () => { if (check(step)) { setStep(step + 1); window.scrollTo({ top: 0 }); } };
  const back = () => { setError(""); setBad([]); setStep(step - 1); };

  const pick = (kind: string, list: FileList | null) => {
    if (!list?.length) return;
    const add = [...list];
    const big = add.find((x) => x.size > MAX_FILE_MB * 1024 * 1024);
    if (big) return setError(`„${big.name}” depășește ${MAX_FILE_MB} MB.`);
    setError("");
    setFiles((cur) => (kind === "other" ? [...cur, ...add.map((file) => ({ kind, file }))] : [...cur.filter((u) => u.kind !== kind), { kind, file: add[0] }]));
  };

  const submit = async () => {
    if (![0, 1, 2].every(check)) return;
    setBusy("Se trimite comanda…"); setError("");
    const r = await fetch("/api/portal/orders", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, surface_area: f.surface_area, rooms: f.rooms, land_area: f.land_area }),
    });
    const d = (await r.json().catch(() => ({}))) as { error?: string; id?: string };
    if (!r.ok || !d.id) { setBusy(""); return setError(d.error || "Nu am putut trimite comanda. Încearcă din nou."); }
    let failed = 0;
    for (const [i, u] of files.entries()) {
      setBusy(`Se încarcă documentele… ${i + 1} din ${files.length}`);
      const fd = new FormData();
      fd.set("kind", u.kind); fd.set("file", u.file);
      const up = await fetch(`/api/portal/orders/${d.id}/documents`, { method: "POST", body: fd }).catch(() => null);
      if (!up?.ok) failed++;
    }
    location.href = `${base}/comenzi/${d.id}?nou=${failed ? `eroare-${failed}` : "1"}`;
  };

  const inv = (k: string) => (bad.includes(k) ? { "aria-invalid": true as const } : {});

  return (
    <div className="wizard">
      <div className="wizardHead">
        <span className="eyebrow">Comandă nouă · pasul {step + 1} din 4</span>
        <h2>{titles[step]}</h2>
        <div className="progress" aria-hidden>{titles.map((_, i) => <i key={i} data-on={i <= step || undefined} />)}</div>
      </div>

      <div className="wizardBody">
        {step === 0 && (
          <>
            <div className="typeGrid" role="radiogroup" aria-label="Tipul proprietății">
              {PROPERTY_TYPES.map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={f.property_type === k} className="typeCard" onClick={() => setF((p) => ({ ...p, property_type: k }))}>
                  <span aria-hidden>{ICON[k]}</span>{l}
                </button>
              ))}
            </div>
            <div className="grid2">
              <label className="field">Localitate *<input className="input" value={f.city} onChange={set("city")} placeholder="ex. Timișoara" {...inv("city")} /></label>
              <label className="field span2">Adresă *<input className="input" value={f.address} onChange={set("address")} placeholder="Stradă, număr, bloc, apartament" {...inv("address")} /></label>
              {area?.surface && <label className="field"><span>Suprafață utilă (mp) <small>(opțional)</small></span><input className="input" inputMode="decimal" value={f.surface_area} onChange={set("surface_area")} placeholder="ex. 72" /></label>}
              {area?.rooms && <label className="field"><span>Camere <small>(opțional)</small></span><input className="input" inputMode="numeric" value={f.rooms} onChange={set("rooms")} placeholder="ex. 3" /></label>}
              {area?.land && <label className="field"><span>Suprafață teren (mp) <small>(opțional)</small></span><input className="input" inputMode="decimal" value={f.land_area} onChange={set("land_area")} placeholder="ex. 500" /></label>}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="field">Scopul evaluării *
              <div className="chips" role="radiogroup" aria-label="Scopul evaluării">
                {PURPOSES.map((p) => (
                  <button key={p} type="button" role="radio" aria-checked={f.purpose === p} className="chip" onClick={() => setF((x) => ({ ...x, purpose: p }))}>{p}</button>
                ))}
              </div>
            </div>
            {f.purpose === "Credit bancar" && (
              <label className="field" style={{ maxWidth: 360 }}>Banca
                <select className="select" value={f.bank} onChange={set("bank")}>
                  <option value="">Alege banca</option>
                  {BANKS.map((b) => <option key={b}>{b}</option>)}
                </select>
              </label>
            )}
            <div className="field">Termen
              <div className="grid2">
                {[[false, "Standard", "~5 zile lucrătoare de la inspecție"], [true, "Urgent", "~2 zile lucrătoare · tarif majorat"]].map(([u, l, d]) => (
                  <button key={String(u)} type="button" className="typeCard" aria-pressed={f.urgent === u} onClick={() => setF((x) => ({ ...x, urgent: u as boolean }))} style={{ alignItems: "flex-start", textAlign: "left" }}>
                    <b>{l as string}</b><small className="muted">{d as string}</small>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            {self ? (
              <div className="grid2">
                <label className="field">Telefon pentru programarea inspecției *<input className="input" type="tel" value={f.client_phone} onChange={set("client_phone")} {...inv("client_phone")} /></label>
                <p className="hint" style={{ alignSelf: "end" }}>Comanda se face pe numele <b>{me.name || me.email}</b> ({me.email}).</p>
              </div>
            ) : (
              <div className="grid2">
                <label className="field span2">Nume client *<input className="input" value={f.client_name} onChange={set("client_name")} placeholder="Persoană fizică sau firmă" {...inv("client_name")} /></label>
                <label className="field">Telefon client *<input className="input" type="tel" value={f.client_phone} onChange={set("client_phone")} {...inv("client_phone")} /></label>
                <label className="field"><span>Email client <small>(opțional)</small></span><input className="input" type="email" value={f.client_email} onChange={set("client_email")} placeholder="pentru ofertă și raport" {...inv("client_email")} /></label>
              </div>
            )}
            <div className="section">Date pentru inspecție</div>
            <label className="check"><input type="checkbox" checked={f.other_contact} onChange={(e) => setF((x) => ({ ...x, other_contact: e.target.checked }))} />Persoana de contact la inspecție este alta decât {self ? "mine" : "clientul"}</label>
            {f.other_contact && (
              <div className="grid2">
                <label className="field">Nume persoană de contact *<input className="input" value={f.contact_name} onChange={set("contact_name")} {...inv("contact_name")} /></label>
                <label className="field">Telefon persoană de contact *<input className="input" type="tel" value={f.contact_phone} onChange={set("contact_phone")} {...inv("contact_phone")} /></label>
              </div>
            )}
            <label className="field"><span>Alte observații pentru inspecție <small>(opțional)</small></span><textarea className="textarea" rows={3} value={f.inspection_notes} onChange={set("inspection_notes")} placeholder="ex. acces, program, cheia la administrator" /></label>
            {!self && <label className="check"><input type="checkbox" checked={f.may_contact_client} onChange={(e) => setF((x) => ({ ...x, may_contact_client: e.target.checked }))} />Evaluatorul poate contacta direct clientul / persoana de contact</label>}
          </>
        )}

        {step === 3 && (
          <>
            <div className="cardHead">
              <p className="hint" style={{ maxWidth: 440 }}>Încarcă documentele pe care le ai acum. Poți trimite comanda și fără ele și le adaugi ulterior din pagina comenzii.</p>
              <span className={`pill ${haveReq === required.length ? "pillOk" : "pillWarn"}`}><i />{haveReq} din {required.length} obligatorii</span>
            </div>
            <ul className="docList">
              {docs.map((d) => {
                const u = files.find((x) => x.kind === d.key);
                return (
                  <li key={d.key}>
                    <span className={`docDot ${u ? "ok" : ""}`} aria-hidden>{u ? "✓" : ""}</span>
                    <span className="who"><b>{d.label}</b>{d.optional && <small className="muted">opțional</small>}{u && <span className="muted">{u.file.name}</span>}</span>
                    <FileButton label={u ? "Înlocuiește" : "↑ Încarcă"} onPick={(l) => pick(d.key, l)} />
                  </li>
                );
              })}
              <li>
                <span className="docDot" aria-hidden>+</span>
                <span className="who"><b>Alte documente</b>{files.filter((x) => x.kind === "other").map((x, i) => <span key={i} className="muted">{x.file.name} <button type="button" className="linkBtn" onClick={() => setFiles((c) => c.filter((y) => y !== x))}>șterge</button></span>)}</span>
                <FileButton label="↑ Adaugă" multiple onPick={(l) => pick("other", l)} />
              </li>
            </ul>
            <dl className="summary">
              <div><dt>Proprietate</dt><dd>{type ? propertyLabel(type) : "—"}{f.surface_area ? ` · ${f.surface_area} mp` : ""}{f.rooms ? ` · ${f.rooms} camere` : ""}</dd></div>
              <div><dt>Adresă</dt><dd>{f.address}, {f.city}</dd></div>
              <div><dt>Scop</dt><dd>{f.purpose}{f.bank ? ` · ${f.bank}` : ""}</dd></div>
              <div><dt>Termen</dt><dd>{f.urgent ? "Urgent" : "Standard"}</dd></div>
              <div><dt>Client</dt><dd>{f.client_name || me.email}</dd></div>
              <div><dt>Telefon</dt><dd>{f.client_phone}</dd></div>
              {f.other_contact && <div><dt>Contact inspecție</dt><dd>{f.contact_name} · {f.contact_phone}</dd></div>}
              <div><dt>Documente</dt><dd>{files.length ? `${files.length} fișier${files.length > 1 ? "e" : ""}` : "niciunul încă"}</dd></div>
            </dl>
            <label className="field"><span>Observații <small>(opțional)</small></span><textarea className="textarea" rows={3} value={f.notes} onChange={set("notes")} placeholder="Orice ar trebui să știm despre comandă" /></label>
          </>
        )}
      </div>

      <div className="wizardFoot">
        {error && <div role="alert" className="error">{error}</div>}
        <div className="actions" style={{ justifyContent: "space-between" }}>
          {step > 0 ? <button type="button" className="btn btnGhost" onClick={back} disabled={!!busy}>← Înapoi</button> : <a href={base || "/"} className="btn btnGhost">Renunță</a>}
          {step < 3
            ? <button type="button" className="btn btnNavy" onClick={next}>Continuă →</button>
            : <button type="button" className="btn btnGold" onClick={submit} disabled={!!busy}>{busy || "Trimite comanda ✓"}</button>}
        </div>
      </div>
    </div>
  );
}

function FileButton({ label, multiple, onPick }: { label: string; multiple?: boolean; onPick: (l: FileList | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="btn btnGhost btnSm" onClick={() => ref.current?.click()}>{label}</button>
      <input ref={ref} type="file" hidden accept={ACCEPT} multiple={multiple} onChange={(e) => { onPick(e.target.files); e.target.value = ""; }} />
    </>
  );
}
