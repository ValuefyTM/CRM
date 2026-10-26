"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Draft, Market } from "@/lib/drafting";

type Mode = "new" | "shorter" | "longer" | "rewrite";
const api = (report: string) => `/api/crm/reports/${encodeURIComponent(report)}/redactare`;

async function send(report: string, method: "POST" | "PATCH", body: Record<string, unknown>) {
  const res = await fetch(api(report), { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const d = (await res?.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
  return res?.ok ? { ok: true as const, d } : { ok: false as const, error: d?.error ?? "Nu s-a putut salva. Încearcă din nou." };
}

async function toClipboard(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** The text with the missing bits ("[de completat: …]") in red. */
function Marked({ text }: { text: string }) {
  return <>{text.split(/(\[de completat:[^\]]*\])/i).map((p, i) => (/^\[de completat:/i.test(p) ? <mark key={i} className="drMiss">{p}</mark> : <span key={i}>{p}</span>))}</>;
}

const when = (s: string | null) => (s ? new Date(s).toLocaleString("ro-RO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

/** A field written with AI: write it, copy it into the bank's application, edit it, make it shorter / longer, rewrite it. */
export function DraftField({ report, asset, field, label, brd, limit, sources, draft, enabled, canEdit, focus }: {
  report: string; asset: string; field: string; label: string; brd?: string; limit: number; sources: string; draft: Draft | null; enabled: boolean; canEdit: boolean; focus?: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(draft?.text ?? "");
  const [edit, setEdit] = useState<string | null>(null);
  const [busy, setBusy] = useState<Mode | "save" | "copy" | "example" | null>(null);
  const [msg, setMsg] = useState("");
  const [wish, setWish] = useState<string | null>(null);
  const [copied, setCopied] = useState(draft?.state === "copied");
  const stale = draft?.state === "stale";

  const write = async (mode: Mode, w = "") => {
    setBusy(mode); setMsg("");
    const r = await send(report, "POST", { asset, field, mode, wish: w });
    setBusy(null);
    if (!r.ok) return setMsg(r.error);
    setText(String(r.d.text ?? "")); setCopied(false); setWish(null);
    router.refresh();
  };
  const copy = async () => {
    setBusy("copy");
    const ok = await toClipboard(text);
    if (ok) { await send(report, "PATCH", { asset, field, copied: true }); setCopied(true); router.refresh(); } else setMsg("Copierea nu a mers: selectează textul și copiază-l manual.");
    setBusy(null);
  };
  const save = async () => {
    if (edit == null) return;
    setBusy("save");
    const r = await send(report, "PATCH", { asset, field, text: edit });
    setBusy(null);
    if (!r.ok) return setMsg(r.error);
    setText(edit); setEdit(null); setCopied(false); router.refresh();
  };
  const example = async () => {
    setBusy("example");
    const r = await send(report, "PATCH", { asset, field, example: true });
    setBusy(null);
    setMsg(r.ok ? "Textul a fost salvat ca exemplu de stil în machetă." : r.error);
  };
  const n = text.length;

  return (
    <section id={field} className={`card drField${focus ? " focus" : ""}${copied ? " done" : ""}`}>
      <div className="cardHead">
        <h2>{label}</h2>
        <span className="drMeta">
          {stale && <span className="pill pillWarn"><i />de rescris: s-au schimbat parametrii pieței</span>}
          {copied && <span className="pill pillOk"><i />copiat</span>}
          {draft?.gen_at && <span>scris cu AI · {when(draft.gen_at)}</span>}
          {limit > 0 && <span className={`mono${n > limit ? " drOver" : ""}`}>{n.toLocaleString("ro-RO")} / {limit.toLocaleString("ro-RO")}</span>}
        </span>
      </div>
      {brd && <p className="drBrd">În aplicația băncii: <b>{brd}</b> · din {sources}</p>}
      {edit != null ? (
        <textarea className="drEdit" value={edit} onChange={(e) => setEdit(e.target.value)} rows={Math.min(18, Math.max(6, Math.ceil(edit.length / 110)))} aria-label={`Textul câmpului ${label}`} />
      ) : text ? (
        <p className="drText"><Marked text={text} /></p>
      ) : (
        <p className="drEmpty">{enabled ? "Încă nescris. AI-ul îl scrie din datele de mai sus și din dreapta." : "Scrierea cu AI nu este configurată; scrie textul manual."}</p>
      )}
      {draft?.missing && draft.missing.length > 0 && text && edit == null && <p className="drMissList">Lipsește: {draft.missing.join(", ")}</p>}
      {wish != null && (
        <div className="drWish">
          <input value={wish} onChange={(e) => setWish(e.target.value)} placeholder="Ce să schimbe (opțional): ex. mai puțin tehnic, începe cu zona…" aria-label="Indicație pentru rescriere"
            onKeyDown={(e) => { if (e.key === "Enter") write("rewrite", wish); }} />
          <button type="button" className="btn btnGold btnSm" disabled={!!busy} onClick={() => write("rewrite", wish)}>{busy === "rewrite" ? "Se rescrie…" : "Rescrie"}</button>
          <button type="button" className="btn btnGhost btnSm" onClick={() => setWish(null)}>Renunță</button>
        </div>
      )}
      {canEdit && (
        <div className="drActs">
          {edit != null ? (
            <>
              <button type="button" className="btn btnGold btnSm" disabled={!!busy} onClick={save}>{busy === "save" ? "Se salvează…" : "Salvează"}</button>
              <button type="button" className="btn btnGhost btnSm" onClick={() => setEdit(null)}>Renunță</button>
            </>
          ) : (
            <>
              {text ? <button type="button" className="btn btnGold btnSm" disabled={!!busy} onClick={copy}>{busy === "copy" ? "…" : copied ? "Copiază din nou" : "Copiază"}</button>
                : enabled && <button type="button" className="btn btnGold btnSm" disabled={!!busy} onClick={() => write("new")}>{busy === "new" ? "Se scrie…" : "Scrie cu AI"}</button>}
              <button type="button" className="btn btnGhost btnSm" disabled={!!busy} onClick={() => setEdit(text)}>{text ? "Editează" : "Scrie manual"}</button>
              {text && enabled && <>
                <button type="button" className="btn btnGhost btnSm" disabled={!!busy} onClick={() => write("shorter")}>{busy === "shorter" ? "…" : "Mai scurt"}</button>
                <button type="button" className="btn btnGhost btnSm" disabled={!!busy} onClick={() => write("longer")}>{busy === "longer" ? "…" : "Mai detaliat"}</button>
                <button type="button" className="btn btnGhost btnSm" disabled={!!busy} onClick={() => (stale ? write("new") : setWish(""))}>{stale ? (busy === "new" ? "Se scrie…" : "Scrie din nou") : "Rescrie"}</button>
              </>}
              {text && copied && <button type="button" className="drLink" disabled={!!busy} onClick={example}>{busy === "example" ? "…" : "Salvează ca exemplu"}</button>}
            </>
          )}
          {msg && <span className="drMsg" role="status">{msg}</span>}
        </div>
      )}
    </section>
  );
}

/** Short values (from the CRM and the sheet), each with its copy button. */
export function FactsField({ report, asset, field, label, brd, values, copied: start, canEdit, focus }: {
  report: string; asset: string; field: string; label: string; brd?: string; values: { label: string; value: string }[]; copied: string[]; canEdit: boolean; focus?: boolean;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(start);
  const [flash, setFlash] = useState("");
  const has = values.filter((v) => v.value);
  const one = async (v: { label: string; value: string }) => {
    if (!(await toClipboard(v.value))) return;
    setFlash(v.label); setTimeout(() => setFlash(""), 1400);
    if (!canEdit || copied.includes(v.label)) return;
    setCopied([...copied, v.label]);
    await send(report, "PATCH", { asset, field, copied: true, value: v.label });
    router.refresh();
  };
  const all = async () => {
    if (!(await toClipboard(has.map((v) => `${v.label}: ${v.value}`).join("\n")))) return;
    setFlash("*"); setTimeout(() => setFlash(""), 1400);
    if (!canEdit) return;
    setCopied(has.map((v) => v.label));
    await send(report, "PATCH", { asset, field, copied: true });
    router.refresh();
  };
  return (
    <section id={field} className={`card drField${focus ? " focus" : ""}`}>
      <div className="cardHead">
        <h2>{label}</h2>
        <span className="drMeta"><span>{has.filter((v) => copied.includes(v.label)).length} din {has.length} copiate</span>
          {has.length > 0 && <button type="button" className="btn btnGhost btnSm" onClick={all}>{flash === "*" ? "Copiat ✓" : "Copiază tot"}</button>}</span>
      </div>
      {brd && <p className="drBrd">În aplicația băncii: <b>{brd}</b></p>}
      <div className="drFacts">
        {values.map((v) => (
          <div key={v.label} className={`drFact${v.value ? "" : " miss"}${copied.includes(v.label) ? " done" : ""}`}>
            <span><small>{v.label}</small><b>{v.value || "lipsește din fișă"}</b></span>
            {v.value && <button type="button" onClick={() => one(v)} aria-label={`Copiază ${v.label}`}>{flash === v.label ? "✓" : copied.includes(v.label) ? "Din nou" : "Copiază"}</button>}
          </div>
        ))}
      </div>
    </section>
  );
}

/** A text of the legal check (ownership right, inventory of the documents), to copy. */
export function LegalField({ report, asset, field, label, brd, text, copied: start, docsHref, canEdit, focus }: {
  report: string; asset: string; field: string; label: string; brd?: string; text: string; copied: boolean; docsHref: string; canEdit: boolean; focus?: boolean;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(start);
  const copy = async () => {
    if (!(await toClipboard(text))) return;
    setCopied(true);
    if (canEdit) { await send(report, "PATCH", { asset, field, copied: true }); router.refresh(); }
  };
  return (
    <section id={field} className={`card drField${focus ? " focus" : ""}`}>
      <div className="cardHead"><h2>{label}</h2><span className="drMeta">{copied && <span className="pill pillOk"><i />copiat</span>}<span>din analiza juridică</span></span></div>
      {brd && <p className="drBrd">În aplicația băncii: <b>{brd}</b></p>}
      {text ? <p className="drText" style={{ whiteSpace: "pre-line" }}>{text}</p>
        : <p className="drEmpty">Analiza juridică nu a fost rulată pentru acest bun. <a className="link" href={docsHref}>Rulează-o din Acte & livrare →</a></p>}
      {text && <div className="drActs"><button type="button" className="btn btnGold btnSm" onClick={copy}>{copied ? "Copiază din nou" : "Copiază"}</button></div>}
    </section>
  );
}

const LEVELS: Record<"cerere" | "oferta" | "echilibru", string[]> = {
  cerere: ["mică", "medie", "mare"], oferta: ["redusă", "medie", "ridicată"], echilibru: ["Oferta > Cererea", "Oferta ≈ Cererea", "Oferta < Cererea"],
};
const TEXT: [keyof Market, string, string][] = [
  ["tip_bun", "Tipul bunului / segment", "Apartament 3 camere, bloc nou"], ["zona", "Zona", "Aradului Est · periferică"],
  ["tendinta", "Tendința prețului (12 luni)", "stagnare, ușoară creștere"], ["expunere", "Timp de expunere", "3–9 luni"], ["segment", "Segment de preț", "mediu"],
];
const OFFERS: [keyof Market, string, string][] = [["oferte_nr", "Oferte identificate", "8"], ["oferte_min", "Minim", "124.000 EUR"], ["oferte_max", "Maxim", "147.700 EUR"], ["oferte_mp", "Medie pe mp util", "2.135 EUR/mp"]];

/** The market parameters: proposed by AI, set by the evaluator; the market texts are written from them. */
export function MarketParams({ report, asset, field, initial, confirmed, enabled, canEdit, focus }: {
  report: string; asset: string; field: string; initial: Market; confirmed: boolean; enabled: boolean; canEdit: boolean; focus?: boolean;
}) {
  const router = useRouter();
  const [m, setM] = useState<Market>(initial);
  const [busy, setBusy] = useState<"ai" | "save" | null>(null);
  const [msg, setMsg] = useState("");
  const [dirty, setDirty] = useState(false);
  const set = (k: keyof Market, v: string) => { setM({ ...m, [k]: v }); setDirty(true); };
  const propose = async () => {
    setBusy("ai"); setMsg("");
    const r = await send(report, "POST", { asset, market: true });
    setBusy(null);
    if (!r.ok) return setMsg(r.error);
    setM({ ...m, ...(r.d.market as Market) }); setDirty(true); setMsg("Propunere AI: verifică și confirmă.");
  };
  const save = async () => {
    setBusy("save"); setMsg("");
    const r = await send(report, "PATCH", { asset, market: m });
    setBusy(null);
    if (!r.ok) return setMsg(r.error);
    setDirty(false); router.refresh();
  };
  return (
    <section id={field} className={`card drField${focus ? " focus" : ""}`}>
      <div className="cardHead">
        <h2>Parametrii pieței</h2>
        <span className="drMeta">{confirmed && !dirty ? <span className="pill pillOk"><i />confirmați</span> : <span>propuși de AI, confirmați de evaluator</span>}</span>
      </div>
      <div className="drParams">
        {TEXT.slice(0, 2).map(([k, l, ph]) => <label key={k} className="drParam"><small>{l}</small><input value={m[k]} placeholder={ph} disabled={!canEdit} onChange={(e) => set(k, e.target.value)} /></label>)}
        {(["cerere", "oferta"] as const).map((k) => (
          <div key={k} className="drParam"><small>{k === "cerere" ? "Cerere" : "Ofertă disponibilă"}</small>
            <span className="drSeg" role="radiogroup" aria-label={k}>{LEVELS[k].map((v) => <button key={v} type="button" role="radio" aria-checked={m[k] === v} disabled={!canEdit} onClick={() => set(k, v)}>{v}</button>)}</span>
          </div>
        ))}
        {TEXT.slice(2).map(([k, l, ph]) => <label key={k} className="drParam"><small>{l}</small><input value={m[k]} placeholder={ph} disabled={!canEdit} onChange={(e) => set(k, e.target.value)} /></label>)}
        <div className="drParam wide"><small>Echilibru</small>
          <span className="drSeg" role="radiogroup" aria-label="Echilibru">{LEVELS.echilibru.map((v) => <button key={v} type="button" role="radio" aria-checked={m.echilibru === v} disabled={!canEdit} onClick={() => set("echilibru", v)}>{v}</button>)}</span>
        </div>
      </div>
      <p className="drBrd">Ofertele găsite de evaluator (din anunțuri), pentru textul despre ofertă:</p>
      <div className="drParams">
        {OFFERS.map(([k, l, ph]) => <label key={k} className="drParam"><small>{l}</small><input value={m[k]} placeholder={ph} disabled={!canEdit} onChange={(e) => set(k, e.target.value)} /></label>)}
        <label className="drParam full"><small>Observații despre piață (opțional)</small><input value={m.observatii} disabled={!canEdit} onChange={(e) => set("observatii", e.target.value)} placeholder="ex. multe ansambluri noi în construcție în zonă" /></label>
      </div>
      {canEdit && (
        <div className="drActs">
          <button type="button" className="btn btnGold btnSm" disabled={!!busy} onClick={save}>{busy === "save" ? "Se salvează…" : "Confirmă parametrii"}</button>
          {enabled && <button type="button" className="btn btnGhost btnSm" disabled={!!busy} onClick={propose}>{busy === "ai" ? "AI-ul analizează…" : "Propune cu AI"}</button>}
          <span className="drHint">Dacă îi schimbi, textele despre piață se marchează „de rescris”.</span>
          {msg && <span className="drMsg" role="status">{msg}</span>}
        </div>
      )}
    </section>
  );
}

/** Writes, one after another, the AI fields of the chapter not written yet (or written before the market changed). */
export function WriteAll({ report, asset, fields }: { report: string; asset: string; fields: { key: string; label: string }[] }) {
  const router = useRouter();
  const [at, setAt] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  if (!fields.length) return null;
  const run = async () => {
    setMsg("");
    for (const f of fields) {
      setAt(f.label);
      const r = await send(report, "POST", { asset, field: f.key, mode: "new" });
      if (!r.ok) { setMsg(`${f.label}: ${r.error}`); break; }
    }
    setAt(null);
    router.refresh();
  };
  return (
    <span className="drAll">
      <button type="button" className="btn btnGold btnSm" disabled={!!at} onClick={run}>{at ? `Se scrie: ${at}…` : `Scrie cu AI ${fields.length === 1 ? "câmpul rămas" : `cele ${fields.length} câmpuri rămase`}`}</button>
      {msg && <span className="drMsg" role="status">{msg}</span>}
    </span>
  );
}

/** The template of the report (chosen by the type of the asset; another one can be picked). */
export function TemplatePick({ report, asset, value, options, canEdit }: { report: string; asset: string; value: string; options: [string, string][]; canEdit: boolean }) {
  const router = useRouter();
  return (
    <select className="drTpl" value={value} disabled={!canEdit} aria-label="Macheta raportului"
      onChange={async (e) => { await send(report, "PATCH", { asset, template: e.target.value }); router.refresh(); }}>
      {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
}
