"use client";
// New work from a framework contract (bank) or a collaboration: 1 where it comes from, 2 the client (searched in the
// CRM, or added), 3 the assets, 4 the report and its team. A bar at the bottom sums it up and says what is missing.
import { billingLabel } from "@/lib/billing-modes";
import { isAvFirm } from "@/lib/av-labels";
import { PersonPicker, type PickPerson } from "@/components/PersonPicker";
import { dutyIn } from "@/lib/labels";

import { useEffect, useMemo, useRef, useState } from "react";
import { PURPOSES } from "@/lib/order-labels";
import { assetProfile, capType, emptyAsset, type AssetForm } from "@/lib/asset-labels";
import { feeKindLabel, feeKindOf, gridRate, netFromGrid, parseFeeGrid } from "@/lib/fee-grid";
import { AssetsEditor, newUid } from "@/components/AssetsEditor";
import { NoteParentPick } from "@/components/NoteParentPick";
import type { DraftDoc } from "@/components/AssetDocs";
import { docKindLabel } from "@/lib/doc-kinds";
import { SafeImg } from "@/app/crm/rapoarte/[id]/ReportActions";
import { ClientSearch, type ClientHit as Hit } from "@/components/ClientSearch";
import { ReferralPick, type Referral } from "@/components/ReferralPick";
import { IdCardDrop, uploadIdCard, type IdScan } from "@/components/IdCardDrop";

type Contract = { id: string; number: string | null; bank_id?: string | null; bank: string; bank_code: string | null; fee: number | null; report_type: string | null; purpose: string | null; logo?: string | null; billing_mode?: string | null; fee_grid?: string | null };
type Collab = { id: string; number: string | null; firm: string; share: number | null; logo?: string | null; billing_mode?: string | null };
type Opt = { id: string; title: string; sub: string; logo?: string | null; short: string };

const initials = (s: string) => s.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 3).map((w) => w[0]).join("").toUpperCase() || "?";
const Logo = ({ src, short, size = 34 }: { src?: string | null; short: string; size?: number }) => (
  <span className="nwLogo" style={{ width: size, height: size }}>{src ? <SafeImg src={src} alt="" fallback={<b>{short}</b>} /> : <b>{short}</b>}</span>
);

/** A list of banks / firms with their logos (in place of a plain select). */
function LogoSelect({ value, onChange, options, placeholder, invalid }: { value: string; onChange: (v: string) => void; options: Opt[]; placeholder: string; invalid?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const cur = options.find((o) => o.id === value);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  const list = options.filter((o) => !q.trim() || `${o.title} ${o.sub}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="nwPick" ref={box}>
      <button type="button" className={`nwPickBtn${invalid ? " invalid" : ""}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        {cur ? <><Logo src={cur.logo} short={cur.short} /><span><b>{cur.title}</b><small>{cur.sub}</small></span></> : <span className="muted">{placeholder}</span>}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="nwPickPanel" role="listbox">
          {options.length > 6 && <input className="input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută…" aria-label="Caută" />}
          {list.length === 0 ? <p className="hint" style={{ margin: 8 }}>Nimic găsit.</p> : list.map((o) => (
            <button key={o.id} type="button" role="option" aria-selected={o.id === value} className="nwPickOpt" onClick={() => { onChange(o.id); setOpen(false); setQ(""); }}>
              <Logo src={o.logo} short={o.short} /><span><b>{o.title}</b><small>{o.sub}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const Step = ({ n, title, sub, done }: { n: number; title: string; sub?: string; done?: boolean }) => (
  <div className="nwStepHead"><span className={`nwNum${done ? " done" : ""}`}>{done ? "✓" : n}</span><span><h2>{title}</h2>{sub && <small>{sub}</small>}</span></div>
);
const Req = () => <span className="req" aria-label="obligatoriu">*</span>;

// The designated use of the report (the bank's "credit" is a bank guarantee); the kind of report, in three.
const USES = ["Garantare bancară", ...PURPOSES.filter((x) => x !== "Credit bancar")];
const REPORT_KINDS = ["Raport de evaluare", "Notă de evaluare", "Notă de inspecție"];
const kindOf = (t: string | null | undefined) => REPORT_KINDS.find((k) => k.toLowerCase() === (t ?? "").trim().toLowerCase()) ?? "Raport de evaluare";
/** Now + 3 days, as a local date and time for <input type="datetime-local"> (Bucharest). */
const inThreeDays = () => {
  const d = new Date(Date.now() + 3 * 86400000);
  const s = d.toLocaleString("sv-SE", { timeZone: "Europe/Bucharest", hour12: false });
  return s.slice(0, 16).replace(" ", "T");
};

const PARTY_KIND: Record<string, string> = { ifn: "IFN", uat: "instituție publică", anaf: "ANAF", broker: "broker", other: "altă entitate" };

/** Bank (framework contract) or collaboration order: the statement line and the report file, in one form. */
export function ContractOrderForm(p: {
  base: string; me: string; initialKind: "bank" | "collab"; initialContract?: string | null; contracts: Contract[]; collabs: Collab[]; evaluators: PickPerson[]; inspectors: PickPerson[];
  nextOrder: number;
  /** Only bank orders (someone accredited on contracts, without the whole Comenzi module). */
  bankOnly?: boolean;
  /** The firm's VAT (Setări → Facturare): a grid "cu TVA" is turned into the net fee. */
  vatPercent?: number;
  /** may add a collaborator on the spot (clients.A) */
  canAddReferral?: boolean;
  /** the designated users a report can be made for (banks, IFN, institutions) */
  parties?: { id: string; name: string; kind: string }[];
}) {
  const [referral, setReferral] = useState<Referral | null>(null);
  const [idScan, setIdScan] = useState<IdScan | null>(null);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });
  const [kind, setKind] = useState(p.initialKind);
  const preset = p.contracts.find((c) => c.id === p.initialContract) ?? (p.contracts.length === 1 ? p.contracts[0] : null);
  const [f, setF] = useState({
    contract_id: preset?.id ?? "", collaboration_id: "", bank_ref: "", bank_branch: "", ordered_on: today, report_type: kindOf(preset?.report_type), purpose: preset?.purpose || "Garantare bancară",
    fee: preset?.fee ? String(preset.fee) : "", fee_later: false, report_number: "", client_id: "", client_kind: "person" as "person" | "company", client_name: "", client_phone: "", client_email: "", client_cui: "",
    recipient_id: "", client_only: false, inspection_notes: "", notes: "", evaluator_id: p.evaluators.some((e) => e.id === p.me && dutyIn(e.duties, "evaluator")) ? p.me : "", verifier_id: "", inspector_id: "", due_on: inThreeDays(), urgent: false,
  });
  // The fee field unlocked by hand (an exception to the grid).
  const [feeFree, setFeeFree] = useState(false);
  const [picked, setPicked] = useState<Hit | null>(null);
  const [assets, setAssets] = useState<AssetForm[]>([{ ...emptyAsset(), uid: newUid(), full_address: "", is_main: true }]);
  // a valuation note: the client's initial report it belongs to (its property fills the asset)
  const [parent, setParent] = useState<string | null>(null);
  const note = f.report_type === "Notă de evaluare";
  const [drafts, setDrafts] = useState<Record<string, DraftDoc[]>>({});
  // Which dropped documents the inspector may open ("<asset uid>:<index>"), chosen when the inspector is picked.
  const [inspDocs, setInspDocs] = useState<string[] | null>(null);
  const [docModal, setDocModal] = useState(false);
  const draftList = assets.flatMap((a, i) => (drafts[a.uid ?? ""] ?? []).map((x, j) => ({ key: `${a.uid}:${j}`, name: x.file.name, kind: x.kind, asset: i === 0 ? "Bun principal" : `Bunul ${i + 1}` })));
  const chosenDocs = inspDocs ?? draftList.map((d) => d.key);
  const [phase, setPhase] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { setF({ ...f, [k]: e.target.value }); setErrors((x) => ({ ...x, [k]: "" })); };
  const contract = p.contracts.find((c) => c.id === f.contract_id);
  const collab = p.collabs.find((c) => c.id === f.collaboration_id);
  // the designated user: the one chosen, else (bank work) the contract's bank; none when only the client uses the report
  const recipient = f.client_only ? "" : f.recipient_id || (kind === "bank" ? contract?.bank_id ?? "" : "");
  const avOrder = kind === "collab" && isAvFirm(collab?.firm);
  const feeNum = parseFloat(f.fee.replace(",", "."));
  // The fee grid of the contract: the fee comes from the kind of the main asset. Locked until the type is chosen; a type
  // the grid has no fee for opens the field and asks for the fee (or "Completez mai târziu").
  const vat = p.vatPercent ?? 21;
  const grid = kind === "bank" ? parseFeeGrid(contract?.fee_grid) : null;
  const mainKind = feeKindOf(assets[0]?.category, assets[0]?.type);
  const gridNet = grid && assets[0]?.type ? netFromGrid(grid, mainKind, vat) : null;
  const feeLocked = kind === "bank" && !!contract && !feeFree && (!assets[0]?.type ? true : gridNet != null);
  const feeState = kind !== "bank" || !contract ? "free" : !assets[0]?.type ? "wait" : gridNet != null ? "grid" : grid ? "missing" : "free";
  const gridSet = useRef<string | null>(null); // the fee last written from the grid (cleared when the kind leaves the grid)
  useEffect(() => {
    if (kind !== "bank" || !contract) return;
    if (gridNet != null && !feeFree) { gridSet.current = String(gridNet); setF((x) => ({ ...x, fee: String(gridNet), fee_later: false })); }
    else if (gridNet == null && gridSet.current != null) { const last = gridSet.current; gridSet.current = null; setF((x) => (x.fee === last ? { ...x, fee: "" } : x)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, contract?.id, mainKind, gridNet]);

  const bankOpts: Opt[] = useMemo(() => p.contracts.map((c) => ({ id: c.id, title: c.bank, logo: c.logo, short: (c.bank_code ?? initials(c.bank)).slice(0, 4).toUpperCase(),
    sub: [c.number && `contract ${c.number}`, c.fee ? `${c.fee.toLocaleString("ro-RO")} lei` : null, c.report_type].filter(Boolean).join(" · ") || "contract cadru" })), [p.contracts]);
  const collabOpts: Opt[] = useMemo(() => p.collabs.map((c) => ({ id: c.id, title: c.firm, logo: c.logo, short: initials(c.firm).slice(0, 3),
    sub: [c.number, c.share != null ? `cota VALUEFY ${Math.round(c.share * 100)}%` : null].filter(Boolean).join(" · ") || "colaborare" })), [p.collabs]);

  const pickContract = (id: string) => {
    const c = p.contracts.find((x) => x.id === id);
    // A contract with a grid: the fee comes from the main asset's kind (effect above); otherwise its standard fee.
    setF({ ...f, contract_id: id, fee: parseFeeGrid(c?.fee_grid) ? "" : c?.fee ? String(c.fee) : f.fee, fee_later: false, report_type: c?.report_type ? kindOf(c.report_type) : f.report_type, purpose: c?.purpose || f.purpose });
    setFeeFree(false);
    setErrors((x) => ({ ...x, source: "", fee: "" }));
  };
  const pickClient = (h: Hit) => {
    setPicked(h);
    setF({ ...f, client_id: h.id, client_name: h.name, client_kind: h.kind === "company" ? "company" : "person", client_phone: h.phone ?? f.client_phone, client_email: h.email ?? f.client_email, client_cui: h.cui ?? "" });
    setErrors((x) => ({ ...x, client_name: "", client_phone: "" }));
  };

  // What is still missing (also counted in the bar at the bottom).
  const check = () => {
    const e: Record<string, string> = {};
    if (kind === "bank" && !f.contract_id) e.source = "Alege banca și contractul cadru.";
    if (kind === "collab" && !f.collaboration_id) e.source = "Alege firma colaboratoare.";
    if (kind === "bank" && !f.bank_ref.trim()) e.bank_ref = "Completează numărul comenzii.";
    // Bank orders: the fee is required (from the grid, or typed), unless left for later.
    if (kind === "bank" && contract && !f.fee_later && !(Number.isFinite(feeNum) && feeNum > 0)) e.fee = feeState === "wait" ? "Alege tipul bunului principal: tariful se preia din grila contractului." : feeState === "missing" ? `Tipul „${capType(assets[0]?.type)}” nu e în grila contractului: completează tariful sau bifează „Completez mai târziu”.` : "Completează tariful sau bifează „Completez mai târziu”.";
    if (!f.client_name.trim()) e.client_name = "Completează numele clientului.";
    if (f.client_phone.replace(/\D/g, "").length < 9) e.client_phone = "Completează telefonul clientului.";
    // Appraisal & Valuation process the order in their CRM: the client's email is required there
    if (avOrder && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.client_email.trim())) e.client_email = "Emailul clientului e obligatoriu la Appraisal & Valuation.";
    assets.forEach((a, i) => {
      if (!a.type.trim()) e[`asset${i}`] = `Bunul ${i + 1}: alege tipul.`;
      else if (assetProfile(a.category, a.type).address && !a.city.trim() && !a.full_address.trim()) e[`asset${i}`] = `Bunul ${i + 1}: completează adresa sau localitatea.`;
      else if (a.contact_kind !== "client" && !a.contact_name.trim()) e[`asset${i}`] = `Bunul ${i + 1}: completează persoana de contact la inspecție.`;
    });
    if (!f.client_only && !recipient) e.recipient = "Alege utilizatorul desemnat (banca) sau bifează „Doar clientul”.";
    if (!f.evaluator_id) e.evaluator_id = "Alege evaluatorul principal.";
    return e;
  };
  const now = check();
  const missing = Object.values(now);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = check();
    setErrors(e);
    if (Object.keys(e).length) {
      setMsg("");
      setTimeout(() => document.querySelector(".nwForm .fieldErr")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
      return;
    }
    setBusy(true); setMsg("");
    const r = await fetch("/api/crm/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, recipient_id: recipient, kind, referral_id: referral?.id ?? "", parent_report_id: note ? parent ?? "" : "", assets: assets.map((a, i) => ({
      ...a, is_main: i === 0, ...(a.contact_kind === "client" ? { contact_name: f.client_name, contact_phone: f.client_phone } : {}),
    })) }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { report?: string; client?: string; error?: string; inspections?: number; assets?: string[] } | undefined;
    if (!r?.ok || !d?.report) { setBusy(false); setMsg(d?.error || "Nu am putut salva. Încearcă din nou."); return; }
    // the identity card read on the form: kept at the client (photos, CNP, address)
    const failed: string[] = [];
    if (idScan && d.client) { setPhase("Se salvează CI-ul la client…"); if (!(await uploadIdCard(d.client, idScan))) failed.push("CI client"); }
    // The documents dropped under each asset go to the new report, on the asset they belong to.
    const queue = assets.flatMap((a, i) => (drafts[a.uid ?? ""] ?? []).map((x, j) => ({ ...x, key: `${a.uid}:${j}`, asset: d.assets?.[i] ?? "" })));
    const ids: Record<string, string> = {};
    for (const [n, x] of queue.entries()) {
      setPhase(`Se încarcă actele ${n + 1} / ${queue.length}…`);
      const body = new FormData();
      body.set("file", x.file); body.set("kind", "source"); body.set("doc_type", x.kind);
      if (x.asset) body.set("asset", x.asset);
      const u = await fetch(`/api/crm/reports/${d.report}/documents`, { method: "POST", body }).catch(() => null);
      const j = (await u?.json().catch(() => null)) as { id?: string } | null;
      if (!u?.ok || !j?.id) failed.push(x.file.name); else ids[x.key] = j.id;
    }
    // The inspector sees the documents ticked for them.
    if (f.inspector_id && d.inspections && queue.length) {
      await fetch(`/api/crm/reports/${d.report}/inspections`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_refs: chosenDocs.map((k) => ids[k]).filter(Boolean) }) }).catch(() => null);
    }
    setBusy(false);
    if (failed.length) alert(`Raportul a fost creat, dar nu s-au încărcat: ${failed.join(", ")}. Le poți adăuga din raport, la Documente.`);
    location.href = `${p.base}/rapoarte/${d.report}?tab=inspectii${d.inspections ? "" : "&alocare=1"}`;
  };

  const sourceDone = !now.source && !now.bank_ref && !now.fee;
  const clientDone = !now.client_name && !now.client_phone;
  const assetsDone = assets.every((_, i) => !now[`asset${i}`]);
  const err = (k: string) => errors[k] ? <span className="fieldErr" role="alert">{errors[k]}</span> : null;
  const source = kind === "bank" ? contract?.bank : collab?.firm;

  return (
    <form onSubmit={submit} noValidate className="nwForm">
      <div className="nwTop">
        <section className="card nwCard">
          <Step n={1} title="Sursa lucrării" sub="De unde vine comanda" done={sourceDone} />
          {!p.bankOnly && (
            <div className="segment nwSeg" role="group" aria-label="Tip lucrare">
              <button type="button" aria-pressed={kind === "bank"} onClick={() => setKind("bank")}>Bancă · contract cadru</button>
              <button type="button" aria-pressed={kind === "collab"} onClick={() => setKind("collab")}>Colaborare · firmă de evaluare</button>
            </div>
          )}
          <div className="field"><span className="fLabel">{kind === "bank" ? "Banca și contractul cadru" : "Firma colaboratoare"} <Req /></span>
            {kind === "bank"
              ? <LogoSelect value={f.contract_id} onChange={pickContract} options={bankOpts} placeholder="Alege banca…" invalid={!!errors.source} />
              : <LogoSelect value={f.collaboration_id} onChange={(v) => { setF({ ...f, collaboration_id: v }); setErrors((x) => ({ ...x, source: "" })); }} options={collabOpts} placeholder="Alege firma…" invalid={!!errors.source} />}
            {err("source")}
          </div>
          {kind === "bank" && p.contracts.length === 0 && <div className="note">Nu există contracte cadru în CRM. Se adaugă la clientul băncii.</div>}
          <div className="formRow">
            {kind === "bank" ? (
              <label className="field"><span className="fLabel">Nr. comandă <Req /></span>
                <input className="input mono" value={f.bank_ref} onChange={set("bank_ref")} aria-invalid={!!errors.bank_ref || undefined} placeholder="din aplicația băncii" />
                {err("bank_ref")}
              </label>
            ) : (
              <div className="field"><span className="fLabel">Nr. comandă <small>(automat)</small></span>
                <span className="nwAuto mono">CO-{p.nextOrder}<small>se atribuie la înregistrare</small></span>
              </div>
            )}
            <label className="field">Data comenzii<input className="input" type="date" value={f.ordered_on} onChange={set("ordered_on")} /></label>
          </div>
          {/* VALUEFY's reports are numbered automatically; a collaborating firm's report carries that firm's number. */}
          {kind === "collab" && (
            <label className="field"><span className="fLabel">Nr. raport {collab ? <small>(al firmei {collab.firm} · opțional, se poate completa și din raport)</small> : <small>(al firmei colaboratoare · opțional)</small>}</span>
              <input className="input mono" value={f.report_number} onChange={set("report_number")} placeholder="ex. 71290" maxLength={30} /></label>
          )}
          {kind === "bank" && <p className="nwInfo">Nr. raport: <b>automat</b> · următorul din seria VALUEFY, la înregistrare</p>}
          {kind === "bank" && <label className="field"><span className="fLabel">Agenție / sucursală <small>(opțional)</small></span><input className="input" value={f.bank_branch} onChange={set("bank_branch")} placeholder="ex. Timișoara Iosefin" /></label>}
          <div className="formRow">
            <label className="field">Utilizarea desemnată
              <select className="select" value={f.purpose} onChange={set("purpose")}>
                {!USES.includes(f.purpose) && f.purpose && <option value={f.purpose}>{f.purpose}</option>}
                {USES.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <div className="field"><span className="fLabel">Onorariu fără TVA {kind === "bank" && contract && <Req />}</span>
              <span className="nwSuffix"><input className="input" inputMode="decimal" value={f.fee} onChange={set("fee")} readOnly={feeLocked} aria-invalid={!!errors.fee || undefined} aria-label="Onorariu fără TVA"
                placeholder={feeState === "wait" ? "după tipul bunului principal" : feeState === "missing" ? "tarif negociat" : contract?.fee ? String(contract.fee) : "0"} disabled={f.fee_later} /><em>lei</em></span>
              {feeState === "wait" && <small className="muted">Se preia din grila contractului după ce alegi tipul bunului principal (pasul 3).</small>}
              {feeState === "grid" && !feeFree && <small className="muted">Din grila contractului: {feeKindLabel(mainKind).toLowerCase()}{grid?.vat ? ` · ${gridRate(grid, mainKind)?.toLocaleString("ro-RO")} lei cu TVA` : ""} · <button type="button" className="linkBtn" onClick={() => setFeeFree(true)}>alt tarif</button></small>}
              {feeState === "grid" && feeFree && <small className="muted">Tarif diferit de grilă · <button type="button" className="linkBtn" onClick={() => { setFeeFree(false); setF({ ...f, fee: String(gridNet), fee_later: false }); }}>înapoi la grilă</button></small>}
              {feeState === "missing" && <small className="muted">Tipul „{capType(assets[0]?.type)}” nu are tarif în grila contractului: scrie tariful convenit.</small>}
              {kind === "bank" && contract && feeState !== "wait" && feeState !== "grid" && (
                <label className="check" style={{ marginTop: 4 }}><input type="checkbox" checked={f.fee_later} onChange={(e) => { setF({ ...f, fee_later: e.target.checked, fee: e.target.checked ? "" : f.fee }); setErrors((x) => ({ ...x, fee: "" })); }} /><span>Completez mai târziu <small className="muted">· la facturare</small></span></label>
              )}
              {err("fee")}
            </div>
          </div>
          <div className="field">Tip raport
            <div className="segment nwSeg" role="group" aria-label="Tip raport">
              {REPORT_KINDS.map((k) => <button key={k} type="button" aria-pressed={f.report_type === k} onClick={() => setF({ ...f, report_type: k })}>{k}</button>)}
            </div>
          </div>
          {(kind === "collab" ? collab : contract) && (() => {
            const m = billingLabel((kind === "collab" ? collab : contract)?.billing_mode);
            const href = kind === "collab" ? `${p.base}/contracte?tip=colaborare` : `${p.base}/contracte/${contract!.id}`;
            return <p className="nwInfo">Facturare: {m ? <b>{m.toLowerCase()}</b> : <><b className="errTxt">nesetată</b>{href && <> · <a className="link" href={href} target="_blank" rel="noopener">setează pe {kind === "collab" ? "colaborare" : "contract"}</a></>}</>}</p>;
          })()}
          {kind === "collab" && collab?.share != null && Number.isFinite(feeNum) && <p className="nwInfo">Cota VALUEFY: <b>{Math.round(collab.share * 100)}%</b> · {(feeNum * collab.share).toLocaleString("ro-RO", { maximumFractionDigits: 2 })} lei</p>}
        </section>

        <section className="card nwCard">
          <Step n={2} title="Client" sub="Cine comandă evaluarea" done={clientDone} />
          <IdCardDrop base={p.base} matched={f.client_id} onChange={setIdScan}
            onRead={(c) => { if (!picked && c.name) { setF((x) => ({ ...x, client_kind: "person", client_name: c.name })); setErrors((x) => ({ ...x, client_name: "" })); } }}
            onMatch={(m) => pickClient({ ...m })} />
          <div className="segment nwSeg" role="group" aria-label="Tip client">
            <button type="button" aria-pressed={f.client_kind === "person"} disabled={!!picked} onClick={() => setF({ ...f, client_kind: "person" })}>Persoană fizică</button>
            <button type="button" aria-pressed={f.client_kind === "company"} disabled={!!picked} onClick={() => setF({ ...f, client_kind: "company" })}>Persoană juridică</button>
          </div>
          <div className="field"><span className="fLabel">{f.client_kind === "company" ? "Denumire firmă" : "Nume și prenume"} <Req /></span>
            <ClientSearch value={f.client_name} invalid={!!errors.client_name} onPick={pickClient}
              onType={(v) => { const off = picked && v !== picked.name; setF({ ...f, client_name: v, client_id: off ? "" : f.client_id }); if (off) setPicked(null); setErrors((x) => ({ ...x, client_name: "" })); }} />
            {err("client_name")}
          </div>
          {f.client_name.trim().length >= 2 && (picked
            ? <div className="nwClient ok"><span className={`nwKind ${picked.kind}`}>{picked.kind === "company" ? "PJ" : "PF"}</span><span><b>Client existent</b><small>{picked.reports ? `${picked.reports} ${picked.reports === 1 ? "raport" : "rapoarte"} în CRM · ` : ""}telefonul și emailul s-au completat din fișa lui</small></span>
                <button type="button" className="linkBtn" onClick={() => { setPicked(null); setF({ ...f, client_id: "" }); }}>alt client</button></div>
            : <div className="nwClient new"><span className="nwKind new">+</span><span><b>Client nou</b><small>nu e în CRM: se adaugă la înregistrare, ca {f.client_kind === "company" ? "persoană juridică" : "persoană fizică"}</small></span></div>)}
          <div className="formRow">
            <label className="field"><span className="fLabel">Telefon <Req /></span>
              <input className="input" type="tel" value={f.client_phone} onChange={set("client_phone")} aria-invalid={!!errors.client_phone || undefined} placeholder="07xx xxx xxx" />
              {err("client_phone")}
            </label>
            <label className="field"><span className="fLabel">Email {avOrder ? <small>(obligatoriu la Appraisal & Valuation)</small> : <small>(opțional)</small>}</span><input className="input" type="email" value={f.client_email} onChange={set("client_email")} placeholder="nume@exemplu.ro" aria-invalid={!!errors.client_email || undefined} />{errors.client_email && <small className="errTxt">{errors.client_email}</small>}</label>
          </div>
          {f.client_kind === "company" && <label className="field"><span className="fLabel">CUI <small>(opțional)</small></span><input className="input mono" value={f.client_cui} onChange={set("client_cui")} placeholder="ex. 12345678" disabled={!!picked} /></label>}
          <div className="field">
            <span className="fLabel">Utilizator desemnat {!f.client_only && <Req />}</span>
            <label className="check"><input type="checkbox" checked={f.client_only} onChange={(e) => { setF({ ...f, client_only: e.target.checked }); setErrors((x) => ({ ...x, recipient: "" })); }} /><span>Doar clientul folosește raportul</span></label>
            {!f.client_only && (
              <select className="select" value={recipient} aria-invalid={!!errors.recipient || undefined} aria-label="Utilizator desemnat"
                onChange={(e) => { setF({ ...f, recipient_id: e.target.value }); setErrors((x) => ({ ...x, recipient: "" })); }}>
                <option value="">— alege banca / instituția —</option>
                {(p.parties ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}{x.kind !== "bank" ? ` · ${PARTY_KIND[x.kind] ?? x.kind}` : ""}</option>)}
              </select>
            )}
            {kind === "bank" && contract?.bank_id && !f.client_only && recipient === contract.bank_id && <small className="muted">banca contractului cadru · o poți schimba</small>}
            {err("recipient")}
          </div>
          <ReferralPick value={referral} onChange={setReferral} canAdd={!!p.canAddReferral} />
        </section>
      </div>

      <section className="card nwCard">
        <Step n={3} title="Bunuri evaluate" sub="Fiecare bun separat: are valoarea și inspecția lui. Primul e bunul principal." done={assetsDone} />
        {note && (
          <div className="npBox">
            <div className="npHead"><b>Raportul inițial</b><small>nota se leagă de el și folosește același bun, fără o proprietate nouă</small></div>
            <NoteParentPick client={f.client_id} value={parent} onPick={(c) => {
              setParent(c?.id ?? null);
              if (c?.asset) setAssets([{ ...c.asset, uid: newUid(), is_main: true, contact_kind: assets[0]?.contact_kind ?? "client", contact_name: assets[0]?.contact_name ?? "", contact_phone: assets[0]?.contact_phone ?? "" }, ...assets.slice(1)]);
            }} />
          </div>
        )}
        <AssetsEditor assets={assets} setAssets={(a) => { setAssets(a); setErrors((x) => Object.fromEntries(Object.entries(x).filter(([k]) => !k.startsWith("asset")))); }}
          client={{ name: f.client_name, phone: f.client_phone }} docs={{ files: drafts, set: (uid, files) => setDrafts((d) => ({ ...d, [uid]: files })) }} />
        {assets.map((_, i) => <span key={i} style={{ display: "contents" }}>{err(`asset${i}`)}</span>)}
        <label className="field"><span className="fLabel">Observații pentru inspecție <small>(opțional · le vede inspectorul)</small></span>
          <textarea className="textarea" rows={2} value={f.inspection_notes} onChange={set("inspection_notes")} placeholder="ex. cheia la administrator, sunați cu o zi înainte" /></label>
      </section>

      <section className="card nwCard">
        <Step n={4} title="Raport și echipă" sub="Doar evaluatorul principal e obligatoriu; restul se pot alege și după creare." done={!now.evaluator_id} />
        <div className="nwTeam">
          <div className="field"><span className="fLabel">Evaluator principal <Req /></span>
            <PersonPicker label="Evaluator principal" value={f.evaluator_id} onChange={(v) => { setF({ ...f, evaluator_id: v }); setErrors((x) => ({ ...x, evaluator_id: "" })); }} people={p.evaluators.filter((x) => dutyIn(x.duties, "evaluator"))} me={p.me} />
            {err("evaluator_id")}
          </div>
          <div className="field"><span className="fLabel">Verificator <small>(opțional)</small></span>
            <PersonPicker label="Verificator" value={f.verifier_id} onChange={(v) => setF({ ...f, verifier_id: v })} people={p.evaluators.filter((x) => x.id !== f.evaluator_id && dutyIn(x.duties, "verifier"))} me={p.me}
              extras={[{ value: "", label: "Mai târziu", hint: "se alege după creare" }]} placeholder="Mai târziu" />
          </div>
          <div className="field"><span className="fLabel">Inspector <small>(opțional · pentru toate bunurile)</small></span>
            <PersonPicker label="Inspector" value={f.inspector_id} onChange={(v) => { setF({ ...f, inspector_id: v }); if (v && draftList.length) setDocModal(true); }} people={p.inspectors} me={p.me}
              extras={[{ value: "", label: "Mai târziu", hint: "aloci inspecțiile din raport, bun cu bun" }]} placeholder="Mai târziu" />
            {f.inspector_id && draftList.length > 0 && <button type="button" className="linkBtn nwDocsLink" onClick={() => setDocModal(true)}>Acte vizibile inspectorului: {chosenDocs.length} din {draftList.length}</button>}
          </div>
        </div>
        <div className="formRow">
          <label className="field"><span className="fLabel">Termen predare raport <small>(implicit 3 zile de la adăugare)</small></span>
            <input className="input" type="datetime-local" value={f.due_on} onChange={set("due_on")} min={`${today}T00:00`} /></label>
          <div className="field">Prioritate
            <label className={`nwUrgent${f.urgent ? " on" : ""}`}><input type="checkbox" checked={f.urgent} onChange={(e) => setF({ ...f, urgent: e.target.checked })} /><span>Urgent</span><small>apare marcat în liste</small></label>
          </div>
        </div>
        <label className="field"><span className="fLabel">Note interne <small>(opțional)</small></span><textarea className="textarea" rows={2} value={f.notes} onChange={set("notes")} /></label>
      </section>

      {docModal && (
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="nwDocsT" onClick={(e) => { if (e.target === e.currentTarget) setDocModal(false); }}>
          <div className="vfModalBox" style={{ maxWidth: 520 }}>
            <h2 id="nwDocsT">Ce acte vede inspectorul?</h2>
            <p className="hint">Bifează actele pe care inspectorul le poate deschide în aplicația de inspecții. Se pot schimba și din raport.</p>
            <div className="daBox">
              <div className="daHead"><b>Acte trase la bunuri</b>
                <button type="button" className="linkBtn" onClick={() => setInspDocs(chosenDocs.length === draftList.length ? [] : draftList.map((d) => d.key))}>{chosenDocs.length === draftList.length ? "Niciunul" : "Toate"}</button></div>
              <ul className="daList">
                {draftList.map((d) => (
                  <li key={d.key}><label className="check">
                    <input type="checkbox" checked={chosenDocs.includes(d.key)} onChange={(e) => setInspDocs(e.target.checked ? [...chosenDocs, d.key] : chosenDocs.filter((k) => k !== d.key))} />
                    <span><b>{d.name}</b><small>{docKindLabel(d.kind)} · {d.asset}</small></span>
                  </label></li>
                ))}
              </ul>
            </div>
            <div className="actions"><button type="button" className="btn btnNavy" onClick={() => setDocModal(false)}>Gata</button></div>
          </div>
        </div>
      )}
      {msg && <div role="alert" className="error">{msg}</div>}
      <div className="nwBar">
        <div className="nwSum">
          <span>{source ? <b>{source}</b> : <span className="muted">fără sursă</span>}{kind === "bank" ? (f.bank_ref ? ` · ${f.bank_ref}` : "") : ` · CO-${p.nextOrder}`}</span>
          <span>{f.client_name ? <b>{f.client_name}</b> : <span className="muted">fără client</span>}</span>
          <span>{assets.length} {assets.length === 1 ? "bun" : "bunuri"}{assets[0]?.type ? ` · ${capType(assets[0].type)}` : ""}</span>
          {missing.length > 0 ? <span className="nwMissing" title={missing.join("\n")}>{missing.length === 1 ? "Mai lipsește 1 câmp obligatoriu" : `Mai lipsesc ${missing.length} câmpuri obligatorii`}</span>
            : <span className="nwReady">Gata de înregistrat</span>}
        </div>
        <div className="actions">
          <a className="btn btnGhost" href={`${p.base}/comenzi?tab=banci`}>Renunță</a>
          <button type="submit" className="btn btnGold" disabled={busy}>{busy ? phase || "Se înregistrează…" : "Înregistrează și creează raportul"}</button>
        </div>
      </div>
    </form>
  );
}
