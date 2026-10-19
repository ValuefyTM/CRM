"use client";
// The documents of a report (its own, the order's, the ones still in Glide), filtered by asset, and a drop zone that
// adds new ones to the chosen asset (or to the whole report), each with its kind guessed from the file name.
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DOC_KIND_KEYS, docKindLabel, guessDocKind } from "@/lib/doc-kinds";
import { DeleteDoc, DocTypeSelect, UploadButton } from "./ReportActions";

export type DocItem = {
  id: string; name: string; kind: string | null; asset_id: string | null; status: "uploaded" | "missing"; origin: "report" | "order" | "glide";
  href: string | null; size: number | null; at: string | null; by: string | null; note?: string;
  /** The inspector sees it (ticked; by default the CF extract and the floor survey). Undefined: not a document for the inspector. */
  insp?: boolean;
};

/** "La inspector": tick whether the inspector sees the document (in the inspections app and in UVALO). */
function InspTick({ report, d, edit }: { report: string; d: DocItem; edit: boolean }) {
  const [on, setOn] = useState(!!d.insp);
  const [busy, setBusy] = useState(false);
  if (d.insp === undefined) return null;
  if (!edit || d.origin === "glide") return on ? <span className="rdInsp on" title="Inspectorul vede actul">La inspector</span> : null;
  return (
    <label className={`rdInsp${on ? " on" : ""}`} title={on ? "Inspectorul vede actul (în aplicația de inspecții și în UVALO)" : "Inspectorul nu vede actul"}>
      <input type="checkbox" checked={on} disabled={busy} onChange={async (e) => {
        const v = e.target.checked;
        setOn(v); setBusy(true);
        const r = await fetch(`/api/crm/reports/${report}/documents`, { method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ doc: d.id, origin: d.origin, insp_visible: v }) }).catch(() => null);
        setBusy(false);
        if (!r?.ok) { setOn(!v); alert("Nu am putut salva. Încearcă din nou."); }
      }} />
      <span>La inspector</span>
    </label>
  );
}

const OK = /\.(pdf|jpe?g|png|heic|heif|webp|docx?|xlsx?|zip)$/i;
const ext = (name: string) => (name.match(/\.(\w{2,4})$/)?.[1] ?? "doc").toUpperCase();
const size = (n: number | null) => (n == null ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const day = (iso: string | null) => (iso ? new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Bucharest" }).replace(".", "") : "");

export function ReportDocs({ report, assets, items, edit, remove, deliver, missing }: {
  report: string; assets: { id: string; label: string; sub?: string | null }[]; items: DocItem[]; edit: boolean; remove: boolean;
  /** The deliverables (final report, sheets, delivery), shown smaller on the right. */
  deliver?: React.ReactNode;
  /** "Marchează un document lipsă", under the list. */
  missing?: React.ReactNode;
}) {
  const router = useRouter();
  // "" = all, "report" = the ones of the whole report, else an asset id.
  const [filter, setFilter] = useState("");
  const [target, setTarget] = useState(assets.length === 1 ? assets[0].id : "");
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(0);
  const [msg, setMsg] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const many = assets.length > 1;
  const labelOf = (id: string | null) => (id ? assets.find((a) => a.id === id)?.label ?? "" : "");
  const shown = useMemo(() => items.filter((d) => !filter || (filter === "report" ? !d.asset_id : d.asset_id === filter)), [items, filter]);
  const count = (f: string) => items.filter((d) => !f || (f === "report" ? !d.asset_id : d.asset_id === f)).length;

  const upload = async (list: FileList | File[]) => {
    const files = [...list];
    const bad = files.filter((f) => !OK.test(f.name));
    setMsg(bad.length ? `Nu se pot atașa: ${bad.map((f) => f.name).join(", ")} (acceptăm PDF, imagini, Word, Excel, ZIP).` : "");
    let done = 0;
    for (const file of files.filter((f) => OK.test(f.name))) {
      setBusy((n) => n + 1);
      const body = new FormData();
      body.set("file", file); body.set("kind", "source"); body.set("doc_type", guessDocKind(file.name));
      if (target) body.set("asset", target);
      const r = await fetch(`/api/crm/reports/${report}/documents`, { method: "POST", body }).catch(() => null);
      const d = (await r?.json().catch(() => ({}))) as { error?: string };
      setBusy((n) => n - 1);
      if (!r?.ok) setMsg(d?.error ?? `„${file.name}” nu s-a putut încărca.`); else done++;
    }
    if (done) router.refresh();
  };

  const nav: [string, string, string | null | undefined][] = [["", "Toate actele", null], ...(many ? [["report", "Tot raportul", "acte comune tuturor bunurilor"] as [string, string, string]] : []),
    ...assets.map((a): [string, string, string | null | undefined] => [a.id, a.label, a.sub])];
  const choose = (k: string) => { setFilter(k); if (k && k !== "report") setTarget(k); else if (k === "report") setTarget(""); };
  return (
    <div className={`rdLayout${deliver ? "" : " noDeliver"}`}>
    <nav className="card rdNav" aria-label="Acte pe bunuri">
      <div className="section">Bunuri</div>
      <ul>
        {nav.map(([k, l, sub]) => (
          <li key={k || "all"}>
            <button type="button" aria-pressed={filter === k} onClick={() => choose(k)}>
              <span><b>{l}</b>{sub && <small>{sub}</small>}</span><em>{count(k)}</em>
            </button>
          </li>
        ))}
      </ul>
    </nav>
    <section className="card flush rdCard">
      <div className="cardHead rdHead">
        <h2>Acte{filter ? <span className="muted"> · {nav.find(([k]) => k === filter)?.[1]}</span> : null}</h2>
        <span className="muted">{shown.length} {shown.length === 1 ? "act" : "acte"}</span>
      </div>

      {edit && (
        <div className={`rdDrop${over ? " over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
          <span className="rdDropText">
            <b>{busy ? "Se încarcă…" : "Adaugă acte noi"}</b>
            <small>Trage fișierele aici sau <button type="button" className="linkBtn" onClick={() => input.current?.click()}>alege de pe calculator</button>. Tipul (CF, releveu, act de proprietate…) se recunoaște din nume și îl poți schimba. Bifa „La inspector” arată ce vede inspectorul: implicit CF și releveul.</small>
          </span>
          {many && (
            <label className="rdTarget">Atribuie la
              <select className="select selectSm" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Tot raportul</option>
                {assets.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </label>
          )}
          <input ref={input} type="file" multiple hidden accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,.doc,.docx,.xls,.xlsx,.zip"
            onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ""; }} />
        </div>
      )}
      {msg && <p className="adMsg pad" role="alert">{msg}</p>}

      {shown.length === 0 ? <p className="hint pad">{items.length ? "Niciun act pentru filtrul ales." : "Niciun act încă."}</p> : (
        <ul className="rdList">
          {shown.map((d) => {
            const k = d.kind && DOC_KIND_KEYS.includes(d.kind) ? d.kind : "other";
            return (
              <li key={d.origin + d.id} className={d.status === "missing" ? "miss" : ""}>
                <span className={`rdExt k-${d.status === "missing" ? "miss" : k}`}>{d.status === "missing" ? "LIPSĂ" : ext(d.name)}</span>
                <span className="rdName">
                  <b title={d.name}>{d.name}</b>
                  <small>
                    {d.status === "missing" ? <>solicitat {day(d.at)} · <span className="errTxt">blochează predarea</span></> : <>
                      <span className="rdKind">{docKindLabel(k)}</span>
                      {many && <> · {d.asset_id ? labelOf(d.asset_id) : "tot raportul"}</>}
                      {d.origin === "order" && " · din comandă"}{d.origin === "glide" && " · în vechiul CRM, nemutat încă"}
                      {d.at && ` · ${day(d.at)}`}{d.size ? ` · ${size(d.size)}` : ""}{d.by ? ` · ${d.by}` : ""}
                    </>}
                  </small>
                </span>
                <span className="rdActs">
                  {d.status !== "missing" && <InspTick report={report} d={d} edit={edit} />}
                  {d.status === "missing" ? edit && <UploadButton id={report} doc={d.id} label="Încarcă" className="linkBtn" />
                    : d.origin === "report" && edit && <DocTypeSelect id={report} doc={d.id} assets={many ? assets : null} value={`${k}:${d.asset_id ?? ""}`} />}
                  {d.href && <a className="link" href={d.href} target="_blank" rel="noopener">Descarcă</a>}
                  {d.origin === "report" && remove && <DeleteDoc id={report} doc={d.id} name={d.name} />}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {missing && <div className="rdMissing">{missing}</div>}
    </section>
    {deliver && <aside className="rdDeliver">{deliver}</aside>}
    </div>
  );
}
