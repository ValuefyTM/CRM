"use client";
// The documents of a report (its own, the order's, the ones still in Glide), filtered by asset, and a drop zone that
// adds new ones to the chosen asset (or to the whole report), each with its kind guessed from the file name.
import { useEffect, useMemo, useRef, useState } from "react";
import { PdfThumb } from "@/components/PdfThumb";
import { useRouter } from "next/navigation";
import { DOC_KIND_KEYS, docKindLabel, guessDocKind } from "@/lib/doc-kinds";
import { DeleteDoc, DocTypeSelect, FinalDrop, UploadButton } from "./ReportActions";

export type DocItem = {
  id: string; name: string; kind: string | null; asset_id: string | null; status: "uploaded" | "missing"; origin: "report" | "order" | "glide";
  href: string | null; size: number | null; at: string | null; by: string | null; note?: string;
  /** The inspector sees it (ticked; by default the CF extract and the floor survey). Undefined: not a document for the inspector. */
  insp?: boolean;
  /** The final report (PDF signed), shown in red at the top of the report's own documents. */
  final?: boolean;
};

/** "La inspector": the tick of a document (saved with "Actualizează la inspector", not on each click). */
function InspTick({ d, on, edit, changed, onChange }: { d: DocItem; on: boolean; edit: boolean; changed: boolean; onChange: (v: boolean) => void }) {
  if (d.insp === undefined) return null;
  if (!edit || d.origin === "glide") return on ? <span className="rdInsp on" title="Inspectorul vede actul">La inspector</span> : null;
  return (
    <label className={`rdInsp${on ? " on" : ""}${changed ? " changed" : ""}`} title={changed ? "Modificat: se trimite la „Actualizează la inspector”" : on ? "Inspectorul vede actul" : "Inspectorul nu vede actul"}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span>La inspector</span>
    </label>
  );
}

const OK = /\.(pdf|jpe?g|png|heic|heif|webp|docx?|xlsx?|zip)$/i;
const IMG = /\.(jpe?g|png|webp|gif)$/i;
type View = "lista" | "tabel" | "carduri";
const VIEWS: [View, string][] = [["lista", "Listă"], ["tabel", "Tabel"], ["carduri", "Carduri"]];
const kindOf = (d: DocItem) => (d.final ? "final" : d.kind && DOC_KIND_KEYS.includes(d.kind) ? d.kind : "other");
const kindLabel = (d: DocItem) => (d.final ? "Raport final" : docKindLabel(kindOf(d)));
const rowClass = (d: DocItem) => (d.final ? "rdFinal" : d.status === "missing" ? "miss" : "");
const ext = (name: string) => (name.match(/\.(\w{2,4})$/)?.[1] ?? "doc").toUpperCase();
const size = (n: number | null) => (n == null ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const short = (iso: string | null) => (iso ? new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Europe/Bucharest" }) : "");
const stamp = (iso: string) => new Date(iso).toLocaleString("ro-RO", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bucharest" }).replace(".", "");
const day = (iso: string | null) => (iso ? new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Bucharest" }).replace(".", "") : "");

export function ReportDocs({ report, assets, items, edit, remove, deliver, missing, inspOpen = false, inspSent = null }: {
  report: string; assets: { id: string; label: string; sub?: string | null }[]; items: DocItem[]; edit: boolean; remove: boolean;
  /** An inspection is given and not done yet: the ticks can be sent to the inspector. */
  inspOpen?: boolean;
  /** When the inspector's documents were last sent, and by whom. */
  inspSent?: { at: string; who: string | null } | null;
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
  // Afișarea (listă, tabel, carduri), ținută în browser; selecția pentru descărcare ZIP și ștergere.
  const [view, setView] = useState<View>("lista");
  useEffect(() => { try { const v = localStorage.getItem("vf_docs_view"); if (v === "lista" || v === "tabel" || v === "carduri") setView(v); } catch { /* fără stocare */ } }, []);
  const pickView = (v: View) => { setView(v); try { localStorage.setItem("vf_docs_view", v); } catch { /* fără stocare */ } };
  const [sel, setSel] = useState<Set<string>>(new Set());
  const keyOf = (d: DocItem) => `${d.origin === "order" ? "o" : "r"}:${d.id}`;
  const selectable = shown.filter((d) => d.status === "uploaded" && !d.final && (d.origin === "report" || d.origin === "order"));
  const picked = selectable.filter((d) => sel.has(keyOf(d)));
  const allOn = selectable.length > 0 && picked.length === selectable.length;
  const downloadable = items.filter((d) => d.status === "uploaded" && d.origin !== "glide").length;
  const zipHref = (list: DocItem[]) => `/api/crm/reports/${report}/documents/zip${list.length ? `?ids=${list.map(keyOf).join(",")}` : ""}`;
  const removePicked = async () => {
    const own = picked.filter((d) => d.origin === "report");
    if (!own.length || !confirm(`Ștergi ${own.length === 1 ? "actul selectat" : `cele ${own.length} acte selectate`}?${own.length < picked.length ? " Actele din comandă nu se șterg de aici." : ""}`)) return;
    setBusy((n) => n + 1);
    const failed: string[] = [];
    for (const d of own) {
      const r = await fetch(`/api/crm/reports/${report}/documents?doc=${encodeURIComponent(d.id)}`, { method: "DELETE" }).catch(() => null);
      if (!r?.ok) failed.push(d.name);
    }
    setBusy((n) => n - 1);
    setSel(new Set());
    if (failed.length) setMsg(`Nu s-au putut șterge: ${failed.join(", ")}.`);
    router.refresh();
  };
  // The ticks for the inspector: changed here, sent all at once with "Actualizează la inspector".
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  useEffect(() => { setTicks({}); }, [items]);
  const tickOf = (d: DocItem) => ticks[keyOf(d)] ?? !!d.insp;
  const changedTicks = items.filter((d) => d.insp !== undefined && d.origin !== "glide" && ticks[keyOf(d)] !== undefined && ticks[keyOf(d)] !== !!d.insp);
  const [sending, setSending] = useState(false);
  const [sentMsg, setSentMsg] = useState("");
  const sendTicks = async () => {
    setSending(true); setSentMsg("");
    const r = await fetch(`/api/crm/reports/${report}/documents`, { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ insp: changedTicks.map((d) => ({ doc: d.id, origin: d.origin, on: tickOf(d) })) }) }).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { error?: string; sent?: number };
    setSending(false);
    if (!r?.ok) return setSentMsg(j?.error || "Nu am putut actualiza. Încearcă din nou.");
    setSentMsg(j.sent ? "Actualizat la inspector; anunțat în UVALO." : "Actualizat la inspector.");
    router.refresh();
  };
  const tick = (d: DocItem) => d.status !== "missing" && (
    <InspTick d={d} on={tickOf(d)} edit={edit && inspOpen} changed={changedTicks.includes(d)} onChange={(v) => { setSentMsg(""); setTicks((t) => ({ ...t, [keyOf(d)]: v })); }} />);
  const pick = (d: DocItem) => (d.status === "uploaded" && !d.final && (d.origin === "report" || d.origin === "order")
    ? <input type="checkbox" className="rdPick" aria-label={`Selectează ${d.name}`} checked={sel.has(keyOf(d))}
        onChange={(e) => setSel((cur) => { const n = new Set(cur); if (e.target.checked) n.add(keyOf(d)); else n.delete(keyOf(d)); return n; })} />
    : <span className="rdPick" aria-hidden="true" />);
  const acts = (d: DocItem) => (
    <>
      {d.status === "missing" && edit && <UploadButton id={report} doc={d.id} label="Încarcă" className="linkBtn" />}
      {d.href && <a className="link" href={d.href} target="_blank" rel="noopener">Deschide</a>}
      {d.origin === "report" && remove && !d.final && <DeleteDoc id={report} doc={d.id} name={d.name} />}
    </>
  );

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

  // "Doar raport": the documents of the report itself (not of an asset) — the signed report among them
  const nav: [string, string, string | null | undefined][] = [["", "Toate actele", null], ["report", "Doar raport", "actele raportului, nu ale unui bun: și raportul semnat"],
    ...assets.map((a): [string, string, string | null | undefined] => [a.id, a.label, a.sub])];
  // "Adaugă acte noi": on the right, above the deliverables (in the list's card when there is no right column).
  const dropZone = (
        <div className={`rdDrop${over ? " over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
          <span className="rdDropText">
            <b>{busy ? "Se încarcă…" : "Adaugă acte noi"}</b>
            <small>Trage fișierele aici sau <button type="button" className="linkBtn" onClick={() => input.current?.click()}>alege de pe calculator</button>. Tipul (CF, releveu, act de proprietate…) se recunoaște din nume și îl poți schimba. Bifa „La inspector” arată ce vede inspectorul: implicit CF și releveul.</small>
          </span>
          {assets.length > 0 && (
            <label className="rdTarget">Atribuie la
              <select className="select selectSm" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Doar raport (nu pe un bun)</option>
                {assets.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </label>
          )}
          <input ref={input} type="file" multiple hidden accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,.doc,.docx,.xls,.xlsx,.zip"
            onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ""; }} />
        </div>
  );
  const choose = (k: string) => { setFilter(k); if (k && k !== "report") setTarget(k); else if (k === "report") setTarget(""); };
  return (
    <div className={`rdLayout${deliver ? "" : " noDeliver"}`}>
    <section className="card flush rdCard">
      <div className="cardHead rdHead">
        <h2>Acte{filter ? <span className="muted"> · {nav.find(([k]) => k === filter)?.[1]}</span> : null}</h2>
        <span className="muted">{shown.length} {shown.length === 1 ? "act" : "acte"}</span>
      </div>
      {nav.length > 1 && (
        <div className="rdTabs" role="tablist" aria-label="Acte pe bunuri">
          {nav.map(([k, l, sub]) => (
            <button key={k || "all"} type="button" role="tab" aria-selected={filter === k} title={sub ?? undefined} onClick={() => choose(k)}>
              {l}<em>{count(k)}</em>
            </button>
          ))}
        </div>
      )}

      {edit && !deliver && dropZone}
      {msg && <p className="adMsg pad" role="alert">{msg}</p>}
      {/* "Doar raport": the deliverable (the signed report) is uploaded here too */}
      {filter === "report" && edit && (
        items.some((d) => d.final)
          ? <div className="rdFinalBar"><span><b>Raportul semnat</b> e încărcat (primul din listă, cu roșu).</span><UploadButton id={report} kind="final" label="Înlocuiește raportul semnat" className="linkBtn" /></div>
          : <div className="rdFinalBar empty"><FinalDrop id={report} /></div>
      )}

      {shown.length > 0 && (
        <div className="rdBar">
          <div className="segment rdViews" role="group" aria-label="Afișare">
            {VIEWS.map(([k, l]) => <button key={k} type="button" aria-pressed={view === k} onClick={() => pickView(k)}>{l}</button>)}
          </div>
          {selectable.length > 0 && (
            <label className="check rdAll"><input type="checkbox" checked={allOn} ref={(el) => { if (el) el.indeterminate = picked.length > 0 && !allOn; }}
              onChange={(e) => setSel(e.target.checked ? new Set(selectable.map(keyOf)) : new Set())} /><span>{picked.length ? `${picked.length} selectate` : "Selectează tot"}</span></label>
          )}
          <span className="rdBarActs">
            {picked.length > 0 ? <>
              <a className="btn btnGhost btnSm" href={zipHref(picked)}>Descarcă selecția (ZIP)</a>
              {remove && picked.some((d) => d.origin === "report") && <button type="button" className="btn btnDanger btnSm" disabled={busy > 0} onClick={removePicked}>Șterge selecția</button>}
            </> : downloadable > 0 && <a className="btn btnGhost btnSm" href={zipHref([])}>Descarcă tot (ZIP)</a>}
          </span>
        </div>
      )}
      {shown.length === 0 ? <p className="hint pad">{items.length ? "Niciun act pentru filtrul ales." : "Niciun act încă."}</p>
        : view === "tabel" ? (
          <div className="tableWrap">
            <table className="table rdTable">
              <thead><tr><th style={{ width: 30 }} /><th>Act</th><th>Tip</th>{many && <th>Bun</th>}<th>Data</th><th>Mărime</th><th>Inspector</th><th /></tr></thead>
              <tbody>
                {shown.map((d) => {
                  const k = kindOf(d);
                  return (
                    <tr key={d.origin + d.id} className={rowClass(d)}>
                      <td>{pick(d)}</td>
                      <td><span className="rdTName"><span className={`rdExt sm k-${d.status === "missing" ? "miss" : k}`}>{d.status === "missing" ? "!" : ext(d.name)}</span><b title={d.name}>{d.name}</b></span>
                        {d.origin !== "report" && <small className="muted">{d.origin === "order" ? "din comandă" : "în vechiul CRM"}</small>}</td>
                      <td>{d.status === "missing" ? <span className="errTxt">lipsă</span> : d.final ? <b className="errTxt">Raport final</b> : d.origin === "report" && edit ? <DocTypeSelect id={report} doc={d.id} assets={many ? assets : null} value={`${k}:${d.asset_id ?? ""}`} /> : docKindLabel(k)}</td>
                      {many && <td className="rdTAsset" title={d.asset_id ? labelOf(d.asset_id) : "raport"}>{d.asset_id ? labelOf(d.asset_id) : "raport"}</td>}
                      <td style={{ whiteSpace: "nowrap" }}>{short(d.at)}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{size(d.size)}</td>
                      <td>{tick(d)}</td>
                      <td><span className="rdActs rdTActs">
                        {d.status === "missing" && edit && <UploadButton id={report} doc={d.id} label="Încarcă" className="linkBtn" />}
                        {d.href && <a className="rdIco" href={d.href} target="_blank" rel="noopener" title="Deschide" aria-label={`Deschide ${d.name}`}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg></a>}
                        {d.origin === "report" && remove && !d.final && <DeleteDoc id={report} doc={d.id} name={d.name} />}
                      </span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : view === "carduri" ? (
          <ul className="rdCards">
            {shown.map((d) => {
              const k = kindOf(d);
              const on = sel.has(keyOf(d));
              return (
                <li key={d.origin + d.id} className={`${rowClass(d)}${on ? " on" : ""}`}>
                  <div className="rdThumb">
                    {d.status === "missing" ? <span className="rdExt k-miss">LIPSĂ</span>
                      : d.href && /\.pdf$/i.test(d.name) ? <a href={d.href} target="_blank" rel="noopener" aria-label={`Deschide ${d.name}`}><PdfThumb url={d.href} /></a>
                      : d.href && IMG.test(d.name) ? <a href={d.href} target="_blank" rel="noopener" aria-label={`Deschide ${d.name}`}><img src={d.href} alt="" loading="lazy" /></a>
                      : <span className={`rdExt k-${k}`}>{ext(d.name)}</span>}
                    <span className="rdCardPick">{pick(d)}</span>
                  </div>
                  <div className="rdCardBody">
                    <b title={d.name}>{d.name}</b>
                    <small>{d.status === "missing" ? "lipsă · blochează predarea" : <>{d.final ? <b className="errTxt">Raport final</b> : docKindLabel(k)}{many && <> · {d.asset_id ? labelOf(d.asset_id) : "raport"}</>}{d.at && ` · ${day(d.at)}`}</>}</small>
                    <span className="rdCardActs">{tick(d)}{acts(d)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
        <ul className="rdList">
          {shown.map((d) => {
            const k = kindOf(d);
            return (
              <li key={d.origin + d.id} className={rowClass(d)}>
                {pick(d)}
                <span className={`rdExt k-${d.status === "missing" ? "miss" : k}`}>{d.status === "missing" ? "LIPSĂ" : ext(d.name)}</span>
                <span className="rdName">
                  <b title={d.name}>{d.name}</b>
                  <small>
                    {d.status === "missing" ? <>solicitat {day(d.at)} · <span className="errTxt">blochează predarea</span></> : <>
                      <span className={`rdKind${d.final ? " errTxt" : ""}`}>{kindLabel(d)}</span>
                      {many && <> · {d.asset_id ? labelOf(d.asset_id) : "raport"}</>}
                      {d.origin === "order" && " · din comandă"}{d.origin === "glide" && " · în vechiul CRM, nemutat încă"}
                      {d.at && ` · ${day(d.at)}`}{d.size ? ` · ${size(d.size)}` : ""}{d.by ? ` · ${d.by}` : ""}
                    </>}
                  </small>
                </span>
                <span className="rdActs">
                  {tick(d)}
                  {d.status !== "missing" && d.origin === "report" && !d.final && edit && <DocTypeSelect id={report} doc={d.id} assets={many ? assets : null} value={`${k}:${d.asset_id ?? ""}`} />}
                  {acts(d)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {edit && items.some((d) => d.insp !== undefined && d.origin !== "glide") && (
        <div className="rdInspBar">
          <span className="rdInspNote">
            <span className="muted">{!inspOpen ? "Bifele „La inspector” se trimit când raportul are o inspecție alocată și nefinalizată."
              : changedTicks.length ? `${changedTicks.length} ${changedTicks.length === 1 ? "modificare" : "modificări"} netrimise inspectorului`
              : sentMsg || "Schimbă bifele „La inspector”, apoi actualizează."}</span>
            {inspSent && <small className="muted">Lista de acte a inspectorului actualizată {stamp(inspSent.at)}{inspSent.who ? ` · ${inspSent.who}` : ""}</small>}
          </span>
          <button type="button" className="btn btnGhost btnSm rdInspBtn" disabled={!inspOpen || !changedTicks.length || sending}
            title={!inspOpen ? "Nu există o inspecție alocată și nefinalizată" : !changedTicks.length ? "Nu s-a schimbat selecția" : "Trimite lista și anunță inspectorul în UVALO"}
            onClick={sendTicks}>{sending ? "Se actualizează…" : "Actualizează la inspector"}</button>
        </div>
      )}
      {missing && <div className="rdMissing">{missing}</div>}
    </section>
    {deliver && edit && <section className="card rdDropCard">{dropZone}</section>}
    {deliver && <aside className="rdDeliver">{deliver}</aside>}
    </div>
  );
}
