"use client";

import { CONTACT_KINDS } from "@/lib/asset-labels";

export type Contact = { contact_kind: string; contact_name: string; contact_phone: string };

/**
 * "Contact la inspecție" of one asset: the client by default (name and phone taken from the client), or another
 * person — owner, agent, someone else — with their own name and phone.
 */
export function ContactFields({ value, client, onChange }: { value: Contact; client: { name: string | null; phone: string | null }; onChange: (c: Contact) => void }) {
  const isClient = (value.contact_kind || "client") === "client";
  const pick = (kind: string) => onChange(kind === "client"
    ? { contact_kind: "client", contact_name: client.name ?? "", contact_phone: client.phone ?? "" }
    : { contact_kind: kind, contact_name: isClient ? "" : value.contact_name, contact_phone: isClient ? "" : value.contact_phone });
  return (
    <div className="formRow">
      <label className="field">Contact la inspecție
        <select className="select" value={value.contact_kind || "client"} onChange={(e) => pick(e.target.value)}>
          {CONTACT_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <label className="field">Nume
        <input className="input" value={isClient ? client.name ?? "" : value.contact_name} readOnly={isClient} onChange={(e) => onChange({ ...value, contact_name: e.target.value })}
          placeholder={isClient ? "" : "Numele persoanei"} />
      </label>
      <label className="field">Telefon
        <input className="input" type="tel" value={isClient ? client.phone ?? "" : value.contact_phone} readOnly={isClient} onChange={(e) => onChange({ ...value, contact_phone: e.target.value })} />
      </label>
    </div>
  );
}
