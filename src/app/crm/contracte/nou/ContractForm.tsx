"use client";

import { useEffect, useState } from "react";
import { PersonPicker, type PickPerson } from "@/components/PersonPicker";
import { AssetsEditor } from "@/components/AssetsEditor";
import { emptyAsset, type AssetForm } from "@/lib/asset-labels";

export type PickedClient = { id: string; kind: string; name: string; cui: string | null; phone: string | null; email: string | null; city: string | null; reports?: number; last_contract?: string | null };
type Bank = { id: string; name: string; code: string | null };
type Existing = { id: string; number: string; fee: number | null; purpose: string | null; report_type: string | null };

const KIND: Record<string, string> = { person: "PF", company: "PJ", bank: "Bancă", ifn: "IFN", uat: "UAT", broker: "Broker", anaf: "ANAF", other: "Altul" };
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });

/** The client of direct work: searched in the CRM, or a new person / company. */
function ClientPicker({ value, onChange, fresh, setFresh }: {
  value: PickedClient | null; onChange: (c: PickedClient | null) => void;
  fresh: { on: boolean; kind: "person" | "company"; name: string; cui: string; phone: string; email: string; city: string } ; setFresh: (f: typeof fresh) => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PickedClient[] | null>(null);
  const [anaf, setAnaf] = useState("");
  useEffect(() => {
    if (q.trim().length < 2) { setHits(null); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/crm/clients/search?q=${encodeURIComponent(q.trim())}`).catch(() => null);
      const d = (await r?.json().catch(() => null)) as { results?: PickedClient[] } | null;
      setHits(d?.results ?? []);
    }, 220);
    return () => clearTimeout(t);
  }, [q]);
  const setF = (k: keyof typeof fresh) => (e: React.ChangeEvent<HTMLInputElement>) => setFresh({ ...fresh, [k]: e.target.value });
  const lookup = async () => {
    if (!fresh.cui.trim()) return setAnaf("Scrie întâi CUI-ul.");
    setAnaf("Se caută la ANAF…");
    const r = await fetch(`/api/crm/anaf?cui=${encodeURIComponent(fresh.cui)}`).catch(() => null);
    const d = (await r?.json().catch(() => null)) as (Record<string, unknown> & { error?: string }) | null;
    if (!r?.ok || !d) return setAnaf(d?.error ?? "ANAF nu răspunde. Completează manual.");
    setFresh({ ...fresh, cui: String(d.cui ?? fresh.cui), name: (d.name as string) || fresh.name, city: (d.city as string) ?? fresh.city, phone: fresh.phone || ((d.phone as string) ?? "") });
    setAnaf(`${d.inactive ? "Atenție: firmă inactivă la ANAF. " : ""}Date preluate de la ANAF${d.vat_payer ? " · plătitor de TVA" : ""}.`);
  };

  if (value) return (
    <div className="ctPicked">
      <span className="ctPickedAv" aria-hidden>{KIND[value.kind] ?? "?"}</span>
      <span className="who">
        <b>{value.name}</b>
        <span className="muted">{[value.cui && `CUI ${value.cui}`, value.phone, value.email, value.city].filter(Boolean).join(" · ") || "fără date de contact"}</span>
      </span>
      <button type="button" className="btn btnGhost btnSm" onClick={() => { onChange(null); setQ(""); }}>Schimbă</button>
    </div>
  );
  return (
    <>
      <div className="segment" role="group" aria-label="Client" style={{ maxWidth: 420 }}>
        <button type="button" aria-pressed={!fresh.on} onClick={() => setFresh({ ...fresh, on: false })}>Client existent</button>
        <button type="button" aria-pressed={fresh.on} onClick={() => setFresh({ ...fresh, on: true })}>Client nou</button>
      </div>
      {!fresh.on ? (
        <>
          <label className="field">Caută clientul după nume, CUI, telefon sau email
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ex. Popescu, 12345678, 0722…" autoFocus />
          </label>
          {hits && (hits.length === 0 ? (
            <p className="hint">Niciun client găsit. <button type="button" className="linkBtn" onClick={() => setFresh({ ...fresh, on: true, name: q.trim() })}>Adaugă „{q.trim()}” ca client nou →</button></p>
          ) : (
            <ul className="pickList">
              {hits.map((h) => (
                <li key={h.id}>
                  <button type="button" onClick={() => onChange(h)}>
                    <b>{h.name} <span className="ctKindTag">{KIND[h.kind] ?? h.kind}</span></b>
                    <span className="muted">{[h.cui && `CUI ${h.cui}`, h.phone, h.email, h.city].filter(Boolean).join(" · ")}</span>
                    <span className="muted">{h.reports ? `${h.reports} ${h.reports === 1 ? "raport" : "rapoarte"}` : "fără rapoarte"}{h.last_contract ? ` · ultimul contract ${h.last_contract.split("-").reverse().join(".")}` : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          ))}
        </>
      ) : (
        <>
          <div className="segment" role="group" aria-label="Tip client" style={{ maxWidth: 360 }}>
            <button type="button" aria-pressed={fresh.kind === "person"} onClick={() => setFresh({ ...fresh, kind: "person" })}>Persoană fizică</button>
            <button type="button" aria-pressed={fresh.kind === "company"} onClick={() => setFresh({ ...fresh, kind: "company" })}>Persoană juridică</button>
          </div>
          {fresh.kind === "company" && (
            <div className="formRow">
              <label className="field">CUI
                <span style={{ display: "flex", gap: 8 }}>
                  <input className="input mono" value={fresh.cui} onChange={setF("cui")} placeholder="ex. RO12345678" />
                  <button type="button" className="btn btnNavy" style={{ flexShrink: 0 }} onClick={lookup}>Preia de la ANAF</button>
                </span>
              </label>
            </div>
          )}
          {anaf && fresh.kind === "company" && <p className="hint">{anaf}</p>}
          <div className="formRow">
            <label className="field">{fresh.kind === "company" ? "Denumire firmă" : "Nume și prenume"}<input className="input" value={fresh.name} onChange={setF("name")} /></label>
            <label className="field">Telefon<input className="input" type="tel" value={fresh.phone} onChange={setF("phone")} /></label>
          </div>
          <div className="formRow">
            <label className="field">Email<input className="input" type="email" value={fresh.email} onChange={setF("email")} /></label>
            <label className="field">Localitate <small>(opțional)</small><input className="input" value={fresh.city} onChange={setF("city")} /></label>
          </div>
          <p className="hint">Dacă există deja un client cu același CUI, email sau telefon, se folosește acela (fără dubluri).</p>
        </>
      )}
    </>
  );
}

/** New contract: direct work under a classic contract (accepted now, or with an offer first), or a framework contract with a bank. */
export function ContractForm(p: {
  base: string; me: string; next: string; initialKind: "classic" | "framework"; evaluators: PickPerson[]; banks: Bank[]; purposes: string[]; reportKinds: string[];
  client: PickedClient | null; existing: Existing | null;
}) {
  const [kind, setKind] = useState(p.initialKind);
  const [mode, setMode] = useState<"accepted" | "offer">("accepted");
  const [client, setClient] = useState<PickedClient | null>(p.client);
  const [fresh, setFresh] = useState({ on: false, kind: "person" as "person" | "company", name: "", cui: "", phone: "", email: "", city: "" });
  const [f, setF] = useState({
    fee: p.existing?.fee ? String(p.existing.fee) : "", purpose: p.existing?.purpose ?? "", report_type: p.existing?.report_type ?? "Raport de evaluare", ordered_on: today(),
    evaluator_id: p.evaluators.some((e) => e.id === p.me) ? p.me : "", verifier_id: "", due_on: "", urgent: false, inspection_notes: "", notes: "",
  });
  const [fw, setFw] = useState({ client_id: "", number: "", signed_on: today(), fee: "", report_type: "Raport de evaluare", purpose: "Garantare bancară", notes: "" });
  const [assets, setAssets] = useState<AssetForm[]>([{ ...emptyAsset(), full_address: "", is_main: true }]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const setW = (k: keyof typeof fw) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setFw({ ...fw, [k]: e.target.value });
  const who = client ? { name: client.name, phone: client.phone ?? "", email: client.email ?? "" } : { name: fresh.name, phone: fresh.phone, email: fresh.email };

  const post = async (body: Record<string, unknown>) => {
    setBusy(true); setMsg("");
    const r = await fetch("/api/crm/contracts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string; report?: string | null; order?: string; contract?: string | { id: string } | null } | undefined;
    if (!r?.ok || !d) { setBusy(false); setMsg(d?.error || "Nu am putut salva. Încearcă din nou."); return null; }
    return d;
  };

  const submitClassic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client && !fresh.on) return setMsg("Alege clientul (sau adaugă unul nou).");
    if (!client && !fresh.name.trim()) return setMsg("Completează numele clientului nou.");
    if (!client && !fresh.phone.trim() && !fresh.email.trim()) return setMsg("Completează telefonul sau emailul clientului.");
    if (mode === "offer" && !who.email.trim()) return setMsg("Pentru ofertă e nevoie de emailul clientului.");
    for (const [n, a] of assets.entries()) {
      if (!a.type.trim()) return setMsg(`Bunul ${n + 1}: alege tipul.`);
      if (!a.city.trim() && !a.full_address.trim() && a.category !== "BUN MOBIL") return setMsg(`Bunul ${n + 1}: completează localitatea sau adresa.`);
      if (a.contact_kind !== "client" && !a.contact_name.trim()) return setMsg(`Bunul ${n + 1}: completează persoana de contact la inspecție (sau alege „Clientul”).`);
    }
    if (mode === "accepted" && !f.evaluator_id) return setMsg("Alege evaluatorul principal.");
    const d = await post({
      kind: "classic", mode, contract_id: p.existing?.id, ...f,
      ...(client ? { client_id: client.id } : { client: { kind: fresh.kind, name: fresh.name, cui: fresh.cui, phone: fresh.phone, email: fresh.email, city: fresh.city } }),
      assets: assets.map((a, i) => ({ ...a, is_main: i === 0, ...(a.contact_kind === "client" ? { contact_name: who.name, contact_phone: who.phone } : {}) })),
    });
    if (!d) return;
    location.href = d.report ? `${p.base}/rapoarte/${d.report}?tab=inspectii&alocare=1` : `${p.base}/comenzi/${d.order}#oferta`;
  };

  const submitFramework = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fw.client_id) return setMsg("Alege banca.");
    if (!fw.number.trim()) return setMsg("Completează numărul contractului cadru.");
    const d = await post({ kind: "framework", ...fw });
    if (d?.contract) location.href = `${p.base}/contracte/${typeof d.contract === "string" ? d.contract : d.contract.id}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 940 }}>
      {!p.existing && (
        <div className="ctKindPick" role="group" aria-label="Tip contract">
          <button type="button" aria-pressed={kind === "classic"} onClick={() => { setKind("classic"); setMsg(""); }}>
            <b>Contract clasic</b><span>Lucrare directă VALUEFY pentru un client: un contract, un raport. Nr. {p.next}, automat.</span>
          </button>
          <button type="button" aria-pressed={kind === "framework"} onClick={() => { setKind("framework"); setMsg(""); }}>
            <b>Contract cadru</b><span>Acord cu o bancă, cu tarife standard. Comenzile băncii se adaugă apoi din pagina contractului.</span>
          </button>
        </div>
      )}

      {kind === "classic" ? (
        <form onSubmit={submitClassic} noValidate style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {!p.existing && (
            <section className="card">
              <h2>Cum pornește lucrarea</h2>
              <div className="ctKindPick ctModePick" role="group" aria-label="Pornire">
                <button type="button" aria-pressed={mode === "accepted"} onClick={() => setMode("accepted")}>
                  <b>Acceptată · creez raportul acum</b><span>Clientul a acceptat (telefon, email, la birou). Se generează contractul nr. {p.next} și raportul, apoi aloci inspecțiile.</span>
                </button>
                <button type="button" aria-pressed={mode === "offer"} onClick={() => setMode("offer")}>
                  <b>Trimit întâi o ofertă</b><span>Se deschide editorul de ofertă. Când clientul o acceptă, contractul și raportul se creează singure.</span>
                </button>
              </div>
            </section>
          )}

          <section className="card">
            <h2>Client</h2>
            {p.existing && client ? (
              <div className="ctPicked"><span className="ctPickedAv" aria-hidden>{KIND[client.kind] ?? "?"}</span>
                <span className="who"><b>{client.name}</b><span className="muted">Clientul contractului nr. {p.existing.number}</span></span></div>
            ) : <ClientPicker value={client} onChange={setClient} fresh={fresh} setFresh={setFresh} />}
          </section>

          <section className="card">
            <div className="cardHead"><h2>Contract</h2><span className="ctNo">{p.existing ? `Nr. ${p.existing.number} · existent` : mode === "accepted" ? `Nr. ${p.next} · automat` : "Nr. la acceptarea ofertei"}</span></div>
            <div className="formRow">
              <label className="field">Onorariu fără TVA (lei)<input className="input" inputMode="decimal" value={f.fee} onChange={set("fee")} placeholder={mode === "offer" ? "se stabilește în ofertă" : "ex. 1500"} /></label>
              <label className="field">Scop
                <select className="select" value={f.purpose} onChange={set("purpose")}>
                  <option value="">Alege…</option>
                  {p.purposes.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </label>
              <label className="field">Tip raport
                <select className="select" value={f.report_type} onChange={set("report_type")}>
                  {p.reportKinds.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </label>
            </div>
            <div className="formRow">
              <label className="field">Data <small>(contract / comandă)</small><input className="input" type="date" value={f.ordered_on} onChange={set("ordered_on")} /></label>
              <label className="check" style={{ alignSelf: "end", paddingBottom: 8 }}><input type="checkbox" checked={f.urgent} onChange={(e) => setF({ ...f, urgent: e.target.checked })} /><span>Urgent</span></label>
            </div>
          </section>

          <section className="card">
            <h2>Bunuri evaluate</h2>
            <p className="hint">Fiecare bun separat (apartament, loc de parcare, boxă, teren): are valoarea și inspecția lui. Primul e bunul principal.</p>
            <AssetsEditor assets={assets} setAssets={setAssets} client={{ name: who.name, phone: who.phone }} />
            <label className="field">Observații pentru inspecție <small>(opțional)</small><textarea className="textarea" rows={2} value={f.inspection_notes} onChange={set("inspection_notes")} /></label>
          </section>

          {mode === "accepted" && (
            <section className="card">
              <h2>Raport și echipă</h2>
              <div className="formRow">
                <div className="field">Evaluator principal
                  <PersonPicker label="Evaluator principal" value={f.evaluator_id} onChange={(v) => setF({ ...f, evaluator_id: v })} people={p.evaluators} me={p.me} />
                </div>
                <div className="field">Verificator <small>(opțional)</small>
                  <PersonPicker label="Verificator" value={f.verifier_id} onChange={(v) => setF({ ...f, verifier_id: v })} people={p.evaluators.filter((x) => x.id !== f.evaluator_id)} me={p.me}
                    extras={[{ value: "", label: "Mai târziu", hint: "se alege după creare" }]} placeholder="Mai târziu" />
                </div>
                <label className="field">Termen predare <small>(opțional)</small><input className="input" type="date" value={f.due_on} onChange={set("due_on")} /></label>
              </div>
              <p className="hint">Inspecțiile le aloci după creare: se deschide raportul cu fereastra de alocare, bun cu bun.</p>
            </section>
          )}
          <section className="card">
            <label className="field">Note interne <small>(opțional)</small><textarea className="textarea" rows={2} value={f.notes} onChange={set("notes")} /></label>
          </section>

          {msg && <div role="alert" className="error">{msg}</div>}
          <div className="actions">
            <button type="submit" className="btn btnGold" disabled={busy}>
              {busy ? "Se creează…" : p.existing ? "Creează raportul pe contract" : mode === "accepted" ? `Creează contractul nr. ${p.next} și raportul` : "Continuă la ofertă →"}
            </button>
            <a className="btn btnGhost" href={p.existing ? `${p.base}/contracte/${p.existing.id}` : `${p.base}/contracte`}>Renunță</a>
          </div>
        </form>
      ) : (
        <form onSubmit={submitFramework} noValidate style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <section className="card">
            <h2>Contract cadru</h2>
            <div className="formRow">
              <label className="field">Banca
                <select className="select" value={fw.client_id} onChange={setW("client_id")}>
                  <option value="">Alege banca…</option>
                  {p.banks.map((b) => <option key={b.id} value={b.id}>{b.name}{b.code ? ` (${b.code})` : ""}</option>)}
                </select>
              </label>
              <label className="field">Număr contract<input className="input mono" value={fw.number} onChange={setW("number")} placeholder="numărul din contractul semnat" /></label>
              <label className="field">Data semnării<input className="input" type="date" value={fw.signed_on} onChange={setW("signed_on")} /></label>
            </div>
            <div className="formRow">
              <label className="field">Tarif standard fără TVA (lei) <small>(opțional)</small><input className="input" inputMode="decimal" value={fw.fee} onChange={setW("fee")} /></label>
              <label className="field">Tip raport
                <select className="select" value={fw.report_type} onChange={setW("report_type")}>{p.reportKinds.map((x) => <option key={x} value={x}>{x}</option>)}</select>
              </label>
              <label className="field">Scop
                <select className="select" value={fw.purpose} onChange={setW("purpose")}>{p.purposes.map((x) => <option key={x} value={x}>{x}</option>)}</select>
              </label>
            </div>
            <label className="field">Note <small>(opțional)</small><textarea className="textarea" rows={2} value={fw.notes} onChange={setW("notes")} placeholder="ex. facturare lunară pe borderou / individual la predare" /></label>
            <p className="hint">Grila de tarife pe tip de proprietate (preluată automat la procesarea comenzilor) o adăugăm în pasul următor.</p>
          </section>
          {msg && <div role="alert" className="error">{msg}</div>}
          <div className="actions">
            <button type="submit" className="btn btnGold" disabled={busy}>{busy ? "Se salvează…" : "Salvează contractul cadru"}</button>
            <a className="btn btnGhost" href={`${p.base}/contracte`}>Renunță</a>
          </div>
        </form>
      )}
    </div>
  );
}
