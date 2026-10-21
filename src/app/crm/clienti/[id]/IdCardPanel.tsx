"use client";
// The client's identity card: the photos kept (open, delete) and what it says (CNP, series, valid until).
import { useState } from "react";
import type { IdDoc } from "@/lib/id-docs";

const date = (d: string | null | undefined) => (d ? d.slice(0, 10).split("-").reverse().join(".") : "");

export function IdCardPanel({ clientId, docs, cnp, series, number, expires, address, canEdit }: {
  clientId: string; docs: IdDoc[]; address: string | null; cnp: string | null; series: string | null; number: string | null; expires: string | null; canEdit: boolean;
}) {
  const [list, setList] = useState(docs);
  const [busy, setBusy] = useState("");
  const del = async (id: string) => {
    if (!confirm("Ștergi CI-ul de la client?")) return;
    setBusy(id);
    const r = await fetch(`/api/crm/clients/${clientId}/id-card/${id}`, { method: "DELETE" }).catch(() => null);
    setBusy("");
    if (r?.ok) setList((l) => l.filter((d) => d.id !== id)); else alert("Nu am putut șterge poza.");
  };
  const expired = expires && expires < new Date().toISOString().slice(0, 10);
  return (
    <section className="card">
      <h2>Act de identitate</h2>
      {(cnp || series) && (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {[cnp && <>CNP <b className="mono">{cnp}</b></>, series && <>CI <b>{series} {number}</b></>, expires && <span className={expired ? "errTxt" : ""}>valabil până la {date(expires)}{expired ? " (expirat)" : ""}</span>]
            .filter(Boolean).map((x, i) => <span key={i}>{i ? " · " : ""}{x}</span>)}
        </p>
      )}
      {address && (cnp || series) && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Domiciliu: <b>{address}</b></p>}
      {list.length ? (
        <div className="idDocs">
          {list.map((d) => (
            <figure key={d.id}>
              <a href={`/api/crm/clients/${clientId}/id-card/${d.id}`} target="_blank" rel="noreferrer">
                {d.content_type === "application/pdf" ? <span className="idPdf">PDF<small>{d.filename}</small></span> : <img src={`/api/crm/clients/${clientId}/id-card/${d.id}`} alt="CI client" loading="lazy" />}
              </a>
              <figcaption>{date(d.created_at)}{d.uploaded_by ? ` · ${d.uploaded_by}` : ""}
                {canEdit && <> · <button type="button" className="linkBtn" disabled={busy === d.id} onClick={() => del(d.id)}>Șterge</button></>}</figcaption>
            </figure>
          ))}
        </div>
      ) : <p className="hint">Niciun CI încărcat. {canEdit ? "Încarc-o din „Date client” (bara „Încarcă CI client”): se citesc numele, CNP-ul și adresa." : ""}</p>}
    </section>
  );
}
