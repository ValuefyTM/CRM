"use client";
// A valuation note belongs to an initial report of the same client (usually a building under construction): the
// client's reports, the ones under construction first; picking one fills the note's asset from its property.
import { useEffect, useState } from "react";
import type { ParentChoice } from "@/lib/notes";

const day = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join(".") : "");
const lei = (n: number | null) => (n ? `${Math.round(n).toLocaleString("ro-RO")} lei` : "");
const capType = (t: string | null | undefined) => (t ? t.charAt(0) + t.slice(1).toLowerCase() : "Bun");

export function NoteParentPick({ client, value, onPick, exclude }: { client: string; value: string | null; onPick: (c: ParentChoice | null) => void; exclude?: string }) {
  const [list, setList] = useState<ParentChoice[] | null>(null);
  useEffect(() => {
    if (!client) { setList([]); return; }
    let off = false;
    setList(null);
    fetch(`/api/crm/notes?client=${encodeURIComponent(client)}${exclude ? `&not=${encodeURIComponent(exclude)}` : ""}`).then((r) => r.json() as Promise<{ results?: ParentChoice[] }>)
      .then((d) => { if (!off) setList(d.results ?? []); }).catch(() => { if (!off) setList([]); });
    return () => { off = true; };
  }, [client, exclude]);
  if (!client) return <p className="hint" style={{ margin: 0 }}>Alege întâi clientul din CRM: apoi apar rapoartele lui, ca să legi nota de raportul inițial.</p>;
  if (list === null) return <p className="hint" style={{ margin: 0 }}>Se caută rapoartele clientului…</p>;
  if (!list.length) return <p className="hint" style={{ margin: 0 }}>Clientul nu are rapoarte în CRM: nota se face fără raport inițial (o poți lega și după, din raport).</p>;
  return (
    <div className="npList" role="radiogroup" aria-label="Raportul inițial">
      {list.map((c) => {
        const on = value === c.id;
        return (
          <button key={c.id} type="button" role="radio" aria-checked={on} className={`npItem${on ? " on" : ""}`} onClick={() => onPick(on ? null : c)}>
            <span className="npDot" aria-hidden="true" />
            <span className="npMain">
              <b>{c.number ? `Raport nr. ${c.number}` : c.label ?? "Raport"}{c.under_construction && <span className="rgBuild">în construcție</span>}</b>
              <small>{[capType(c.asset?.type), c.asset?.full_address || c.asset?.city, c.asset?.cf_number && `CF ${c.asset.cf_number}`].filter(Boolean).join(" · ")}</small>
            </span>
            <span className="npSide"><small>{[day(c.date), c.bank, lei(c.fee)].filter(Boolean).join(" · ")}</small>{c.notes > 0 && <small>{c.notes} {c.notes === 1 ? "notă" : "note"} deja</small>}</span>
          </button>
        );
      })}
    </div>
  );
}

/** On a note's page: its initial report, shown and changed in place. */
export function NoteParentEdit({ note, client, parent, canEdit, base }: { note: string; client: string | null; parent: { id: string; number: string | null } | null; canEdit: boolean; base: string }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const save = async (id: string | null) => {
    setMsg("");
    const r = await fetch("/api/crm/notes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note, parent: id ?? "" }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string };
    if (!r?.ok) return setMsg(d.error ?? "Nu s-a salvat.");
    location.reload();
  };
  return (
    <span style={{ display: "block" }}>
      {parent ? <a className="link" href={`${base}/rapoarte/${parent.id}`}>{parent.number ? `Raport nr. ${parent.number}` : "Raportul inițial"}</a> : <span className="muted">nelegată</span>}
      {canEdit && !open && <> <button type="button" className="linkBtn" onClick={() => setOpen(true)}>{parent ? "schimbă" : "leagă"}</button></>}
      {open && (
        <span style={{ display: "block", marginTop: 8 }}>
          <NoteParentPick client={client ?? ""} exclude={note} value={parent?.id ?? null} onPick={(c) => save(c?.id ?? null)} />
          <span className="actions" style={{ marginTop: 6 }}>
            {parent && <button type="button" className="linkBtn danger" onClick={() => save(null)}>Scoate legătura</button>}
            <button type="button" className="linkBtn" onClick={() => setOpen(false)}>Renunță</button>
          </span>
        </span>
      )}
      {msg && <small className="errTxt">{msg}</small>}
    </span>
  );
}
