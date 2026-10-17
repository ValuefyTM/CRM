"use client";
// Which of the report's documents the inspector may open for the inspection: a checklist, the asset's own documents
// (and the ones of the whole report) ticked by default.
import { docKindLabel } from "@/lib/doc-kinds";

export type AccessDoc = { id: string; name: string; kind: string | null; asset_id: string | null; asset_label?: string | null };

export const defaultAccess = (docs: AccessDoc[], assets: string[]) => docs.filter((d) => !d.asset_id || assets.includes(d.asset_id)).map((d) => d.id);

export function DocAccess({ docs, value, onChange }: { docs: AccessDoc[]; value: string[]; onChange: (ids: string[]) => void }) {
  if (!docs.length) return <p className="hint daEmpty">Nu sunt acte încărcate în raport. Când le încarci, alegi aici ce vede inspectorul.</p>;
  const all = value.length === docs.length;
  return (
    <div className="daBox">
      <div className="daHead">
        <b>Acte la care are acces inspectorul</b>
        <button type="button" className="linkBtn" onClick={() => onChange(all ? [] : docs.map((d) => d.id))}>{all ? "Niciunul" : "Toate"}</button>
      </div>
      <ul className="daList">
        {docs.map((d) => (
          <li key={d.id}>
            <label className="check">
              <input type="checkbox" checked={value.includes(d.id)} onChange={(e) => onChange(e.target.checked ? [...value, d.id] : value.filter((x) => x !== d.id))} />
              <span><b>{d.name}</b><small>{docKindLabel(d.kind)}{d.asset_label ? ` · ${d.asset_label}` : d.asset_id ? "" : " · tot raportul"}</small></span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
