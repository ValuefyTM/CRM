"use client";
// New work from a framework contract (bank) or a collaboration: 1 where it comes from, 2 the client (searched in the
// CRM, or added), 3 the assets, 4 the report and its team. A bar at the bottom sums it up and says what is missing.
import { PersonPicker, type PickPerson } from "@/components/PersonPicker";
import { useEffect, useMemo, useRef, useState } from "react";
import { PURPOSES } from "@/lib/order-labels";
import { assetProfile, capType, emptyAsset, type AssetForm } from "@/lib/asset-labels";
import { AssetsEditor, newUid } from "@/components/AssetsEditor";
import type { DraftDoc } from "@/components/AssetDocs";
import { docKindLabel } from "@/lib/doc-kinds";
import { SafeImg } from "@/app/crm/rapoarte/[id]/ReportActions";

type Contract = { id: string; number: string | null; bank: string; bank_code: string | null; fee: number | null; report_type: string | null; purpose: string | null; logo?: string | null };
type Collab = { id: string; number: string | null; firm: string; share: number | null; logo?: string | null };
type Hit = { id: string; kind: string; name: string; cui: string | null; phone: string | null; email: string | null; city: string | null; reports: number };
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

/** The client's name, searched in the CRM as it is typed: a match fills in phone and email; otherwise a new client. */
function ClientSearch({ value, onType, onPick, invalid }: { value: string; onType: (v: string) => void; onPick: (h: Hit) => void; invalid?: boolean }) {
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) { setHits([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/crm/clients/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal }).then((r) => r.json() as Promise<{ results?: Hit[] }>).then((d) => {
        setHits((d.results ?? []).filter((h) => h.kind === "person" || h.kind === "company")); setHi(0);
      }).catch(() => {});
    }, 220);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [value]);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  const pick = (h: Hit) => { onPick(h); setOpen(false); };
  return (
    <div className="nwSearch" ref={box}>
      <svg className="nwSearchIcon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input className="input" value={value} aria-invalid={invalid || undefined} aria-label="Nume client" placeholder="Caută după nume, telefon, CUI sau scrie un client nou" autoComplete="off"
        onFocus={() => setOpen(true)} onChange={(e) => { onType(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (!open || !hits.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(hits.length - 1, h + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
          else if (e.key === "Enter") { e.preventDefault(); pick(hits[hi]); }
          else if (e.key === "Escape") setOpen(false);
        }} />
      {open && hits.length > 0 && (
        <div className="nwSearchPanel" role="listbox">
          {hits.map((h, i) => (
            <button key={h.id} type="button" role="option" aria-selected={i === hi} className={`nwSearchHit${i === hi ? " hi" : ""}`} onMouseDown={(e) => { e.preventDefault(); pick(h); }} onMouseEnter={() => setHi(i)}>
              <span className={`nwKind ${h.kind}`}>{h.kind === "company" ? "PJ" : "PF"}</span>
              <span><b>{h.name}</b><small>{[h.phone, h.email, h.cui && `CUI ${h.cui}`, h.city].filter(Boolean).join(" · ") || "fără date de contact"}</small></span>
              {h.reports > 0 && <em>{h.reports} {h.reports === 1 ? "raport" : "rapoarte"}</em>}
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

/** Bank (framework contract) or collaboration order: the statement line and the report file, in one form. */
export function ContractOrderForm(p: {
  base: string; me: string; initialKind: "bank" | "collab"; initialContract?: string | null; contracts: Contract[]; collabs: Collab[]; evaluators: PickPerson[]; inspectors: PickPerson[];
  nextOrder: number;
}) {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });
  const [kind, setKind] = useState(p.initialKind);
  const preset = p.contracts.find((c) => c.id === p.initialContract) ?? (p.contracts.length === 1 ? p.contracts[0] : null);
  const [f, setF] = useState({
    contract_id: preset?.id ?? "", collaboration_id: "", bank_ref: "", bank_branch: "", ordered_on: today, report_type: kindOf(preset?.report_type), purpose: preset?.purpose || "Garantare bancară",
    fee: preset?.fee ? String(preset.fee) : "", client_id: "", client_kind: "person" as "person" | "company", client_name: "", client_phone: "", client_email: "", client_cui: "",
    inspection_notes: "", notes: "", evaluator_id: p.evaluators.some((e) => e.id === p.me) ? p.me : "", verifier_id: "", inspector_id: "", due_on: inThreeDays(), urgent: false,
  });
  const [picked, setPicked] = useState<Hit | null>(null);
  const [assets, setAssets] = useState<AssetForm[]>([{ ...emptyAsset(), uid: newUid(), full_address: "", is_main: true }]);
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
  const feeNum = parseFloat(f.fee.replace(",", "."));

  const bankOpts: Opt[] = useMemo(() => p.contracts.map((c) => ({ id: c.id, title: c.bank, logo: c.logo, short: (c.bank_code ?? initials(c.bank)).slice(0, 4).toUpperCase(),
    sub: [c.number && `contract ${c.number}`, c.fee ? `${c.fee.toLocaleString("ro-RO")} lei` : null, c.report_type].filter(Boolean).join(" · ") || "contract cadru" })), [p.contracts]);
  const collabOpts: Opt[] = useMemo(() => p.collabs.map((c) => ({ id: c.id, title: c.firm, logo: c.logo, short: initials(c.firm).slice(0, 3),
    sub: [c.number, c.share != null ? `cota VALUEFY ${Math.round(c.share * 100)}%` : null].filter(Boolean).join(" · ") || "colaborare" })), [p.collabs]);

  const pickContract = (id: string) => {
    const c = p.contracts.find((x) => x.id === id);
    setF({ ...f, contract_id: id, fee: c?.fee ? String(c.fee) : f.fee, report_type: c?.report_type ? kindOf(c.report_type) : f.report_type, purpose: c?.purpose || f.purpose });
    setErrors((x) => ({ ...x, source: "" }));
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
    if (!f.client_name.trim()) e.client_name = "Completează numele clientului.";
    if (f.client_phone.replace(/\D/g, "").length < 9) e.client_phone = "Completează telefonul clientului.";
    assets.forEach((a, i) => {
      if (!a.type.trim()) e[`asset${i}`] = `Bunul ${i + 1}: alege tipul.`;
      else if (assetProfile(a.category, a.type).address && !a.city.trim() && !a.full_address.trim()) e[`asset${i}`] = `Bunul ${i + 1}: completează adresa sau localitatea.`;
      else if (a.contact_kind !== "client" && !a.contact_name.trim()) e[`asset${i}`] = `Bunul ${i + 1}: completează persoana de contact la inspecție.`;
    });
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
    const r = await fetch("/api/crm/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, kind, assets: assets.map((a, i) => ({
      ...a, is_main: i === 0, ...(a.contact_kind === "client" ? { contact_name: f.client_name, contact_phone: f.client_phone } : {}),
    })) }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { report?: string; error?: string; inspections?: number; assets?: string[] } | undefined;
    if (!r?.ok || !d?.report) { setBusy(false); setMsg(d?.error || "Nu am putut salva. Încearcă din nou."); return; }
    // The documents dropped under each asset go to the new report, on the asset they belong to.
    const queue = assets.flatMap((a, i) => (drafts[a.uid ?? ""] ?? []).map((x, j) => ({ ...x, key: `${a.uid}:${j}`, asset: d.assets?.[i] ?? "" })));
    const failed: string[] = [];
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

  const sourceDone = !now.source && !now.bank_ref;
  const clientDone = !now.client_name && !now.client_phone;
  const assetsDone = assets.every((_, i) => !now[`asset${i}`]);
  const err = (k: string) => errors[k] ? <span className="fieldErr" role="alert">{errors[k]}</span> : null;
  const source = kind === "bank" ? contract?.bank : collab?.firm;

  return (
    <form onSubmit={submit} noValidate className="nwForm">
      <div className="nwTop">
        <section className="card nwCard">
          <Step n={1} title="Sursa lucrării" sub="De unde vine comanda" done={sourceDone} />
          <div className="segment nwSeg" role="group" aria-label="Tip lucrare">
            <button type="button" aria-pressed={kind === "bank"} onClick={() => setKind("bank")}>Bancă · contract cadru</button>
            <button type="button" aria-pressed={kind === "collab"} onClick={() => setKind("collab")}>Colaborare · firmă de evaluare</button>
          </div>
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
          {kind === "bank" && <label className="field"><span className="fLabel">Agenție / sucursală <small>(opțional)</small></span><input className="input" value={f.bank_branch} onChange={set("bank_branch")} placeholder="ex. Timișoara Iosefin" /></label>}
          <div className="formRow">
            <label className="field">Utilizarea desemnată
              <select className="select" value={f.purpose} onChange={set("purpose")}>
                {!USES.includes(f.purpose) && f.purpose && <option value={f.purpose}>{f.purpose}</option>}
                {USES.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <label className="field">Onorariu fără TVA
              <span className="nwSuffix"><input className="input" inputMode="decimal" value={f.fee} onChange={set("fee")} placeholder={contract?.fee ? String(contract.fee) : "0"} /><em>lei</em></span>
            </label>
          </div>
          <div className="field">Tip raport
            <div className="segment nwSeg" role="group" aria-label="Tip raport">
              {REPORT_KINDS.map((k) => <button key={k} type="button" aria-pressed={f.report_type === k} onClick={() => setF({ ...f, report_type: k })}>{k}</button>)}
            </div>
          </div>
          {kind === "collab" && collab?.share != null && Number.isFinite(feeNum) && <p className="nwInfo">Cota VALUEFY: <b>{Math.round(collab.share * 100)}%</b> · {(feeNum * collab.share).toLocaleString("ro-RO", { maximumFractionDigits: 2 })} lei</p>}
        </section>

        <section className="card nwCard">
          <Step n={2} title="Client" sub="Cine comandă evaluarea" done={clientDone} />
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
            <label className="field"><span className="fLabel">Email <small>(opțional)</small></span><input className="input" type="email" value={f.client_email} onChange={set("client_email")} placeholder="nume@exemplu.ro" /></label>
          </div>
          {f.client_kind === "company" && <label className="field"><span className="fLabel">CUI <small>(opțional)</small></span><input className="input mono" value={f.client_cui} onChange={set("client_cui")} placeholder="ex. 12345678" disabled={!!picked} /></label>}
        </section>
      </div>

      <section className="card nwCard">
        <Step n={3} title="Bunuri evaluate" sub="Fiecare bun separat: are valoarea și inspecția lui. Primul e bunul principal." done={assetsDone} />
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
            <PersonPicker label="Evaluator principal" value={f.evaluator_id} onChange={(v) => { setF({ ...f, evaluator_id: v }); setErrors((x) => ({ ...x, evaluator_id: "" })); }} people={p.evaluators} me={p.me} />
            {err("evaluator_id")}
          </div>
          <div className="field"><span className="fLabel">Verificator <small>(opțional)</small></span>
            <PersonPicker label="Verificator" value={f.verifier_id} onChange={(v) => setF({ ...f, verifier_id: v })} people={p.evaluators.filter((x) => x.id !== f.evaluator_id)} me={p.me}
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
