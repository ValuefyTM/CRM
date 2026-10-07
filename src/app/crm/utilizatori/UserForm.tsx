"use client";

import { useState } from "react";
import { CLIENT_TYPES, DUTIES, ENGAGEMENTS, INTERNAL_ROLES, PARTNER_ROLES, SPECIALIZATIONS } from "@/lib/labels";
import type { Kind } from "@/lib/site";

export type UserValues = {
  name: string; email: string; phone: string; role: string; engagement: string; anevar_no: string; specializations: string[]; coverage: string;
  duties: string[]; partner_id: string; client_type: string; company: string; cui: string; city: string; notes: string;
};

const EMPTY: UserValues = {
  name: "", email: "", phone: "", role: "", engagement: "employee", anevar_no: "", specializations: [], coverage: "",
  duties: [], partner_id: "", client_type: "person", company: "", cui: "", city: "", notes: "",
};

const INVITE_TEXT: Record<Kind, string> = {
  internal: "Trimite acum un email cu acces la CRM",
  partner: "Trimite acum invitația în Portalul colaboratori",
  client: "Trimite acum invitația în Portalul client",
};

/**
 * Create or edit any account. `lockRole` keeps the role as it is (owners, or people editing themselves);
 * `readOnly` is for team members looking at accounts they may not change; `canMakeOwner` when an owner is editing;
 * `lockDuties` when the duties may not be changed either.
 */
export function UserForm(props: {
  kind: Kind; base: string; userId?: string; initial?: Partial<UserValues>; firms: { id: string; name: string }[];
  lockRole?: boolean; readOnly?: boolean; canMakeOwner?: boolean; lockDuties?: boolean;
}) {
  const { kind, base, userId } = props;
  const isNew = !userId;
  const [f, setF] = useState<UserValues>({ ...EMPTY, role: kind === "partner" ? "member" : kind === "internal" ? "operator" : "client", ...props.initial });
  const [invite, setInvite] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof UserValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const toggleDuty = (k: string) => setF((p) => ({ ...p, duties: p.duties.includes(k) ? p.duties.filter((x) => x !== k) : [...p.duties, k] }));
  // The role "Evaluator" / "Inspector" is itself a duty; the others (owner, administrator, operator) can add duties.
  const duties = Array.from(new Set([...f.duties, ...(f.role === "evaluator" || f.role === "inspector" ? [f.role] : [])]));
  const toggleSpec = (k: string) => setF((p) => ({ ...p, specializations: p.specializations.includes(k) ? p.specializations.filter((x) => x !== k) : [...p.specializations, k] }));
  const ro = props.readOnly;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return setMsg({ ok: false, text: "Adresa de email nu pare validă." });
    if (kind === "partner" && !f.partner_id) return setMsg({ ok: false, text: "Alege firma colaboratorului." });
    if (kind === "client" && f.client_type === "company" && !f.company.trim()) return setMsg({ ok: false, text: "Completează denumirea companiei." });
    if (kind === "client" && f.client_type === "person" && !f.name.trim()) return setMsg({ ok: false, text: "Completează numele clientului." });
    setBusy(true); setMsg(null);
    const r = await fetch(isNew ? "/api/crm/users" : `/api/crm/users/${userId}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isNew ? { kind, ...f, invite } : { action: "update", ...f }),
    });
    const d = (await r.json().catch(() => ({}))) as { error?: string; id?: string; invited?: boolean };
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: d.error || "Nu am putut salva." });
    if (isNew && d.id) location.href = `${base}/utilizatori/${d.id}?nou=${d.invited ? "invitat" : invite ? "neinvitat" : "fara"}`;
    else setMsg({ ok: true, text: "Modificările au fost salvate." });
  };

  const roles = kind === "internal" ? INTERNAL_ROLES.filter(([k]) => k !== "owner" || f.role === "owner" || props.canMakeOwner) : PARTNER_ROLES;

  return (
    <form onSubmit={submit} className="card" noValidate>
      <h2>{kind === "internal" ? "Date utilizator intern" : kind === "partner" ? "Date persoană colaborator" : "Date client"}</h2>
      <fieldset disabled={ro} style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        {kind === "client" && (
          <div className="segment" role="group" aria-label="Tip client" style={{ maxWidth: 380 }}>
            {CLIENT_TYPES.map(([k, l]) => (
              <button key={k} type="button" aria-pressed={f.client_type === k} onClick={() => setF((p) => ({ ...p, client_type: k }))}>{l}</button>
            ))}
          </div>
        )}
        <div className="grid2">
          {kind === "client" && f.client_type === "company" && (
            <>
              <label className="field">Denumire companie *<input className="input" value={f.company} onChange={set("company")} placeholder="ex. Exemplu Construct SRL" /></label>
              <label className="field"><span>CUI <small>(opțional)</small></span><input className="input" value={f.cui} onChange={set("cui")} placeholder="ex. RO12345678" /></label>
            </>
          )}
          <label className="field">
            {kind === "client" && f.client_type === "company" ? <span>Persoană de contact <small>(opțional)</small></span> : kind === "client" ? "Nume și prenume *" : "Nume și prenume"}
            <input className="input" value={f.name} onChange={set("name")} autoComplete="off" />
          </label>
          <label className="field">Email *<input className="input" type="email" value={f.email} onChange={set("email")} placeholder={kind === "internal" ? "nume@valuefy.ro" : "nume@exemplu.ro"} /></label>
          <label className="field"><span>Telefon <small>(opțional)</small></span><input className="input" type="tel" value={f.phone} onChange={set("phone")} /></label>

          {kind === "partner" && (
            <>
              <label className="field">Firmă *
                <select className="select" value={f.partner_id} onChange={set("partner_id")}>
                  <option value="">Alege firma</option>
                  {props.firms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="field">Rol în contul firmei
                <select className="select" value={f.role} onChange={set("role")} disabled={props.lockRole}>
                  {roles.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
            </>
          )}

          {kind === "internal" && (
            <>
              <label className="field">Rol *
                <select className="select" value={f.role} onChange={set("role")} disabled={props.lockRole}>
                  {roles.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              <label className="field">Relația cu VALUEFY
                <select className="select" value={f.engagement} onChange={set("engagement")} disabled={props.lockRole}>
                  {ENGAGEMENTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
            </>
          )}

          {kind === "internal" && (
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <span>Atribuții <small>(ce face în echipă, pe lângă rol; se pot bifa mai multe)</small></span>
              <div className="chips">
                {DUTIES.map(([k, l]) => {
                  const byRole = f.role === k;
                  const on = duties.includes(k);
                  return (
                    <label key={k} className="check" style={{ alignItems: "center", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 999, background: on ? "var(--acc-soft)" : "#fff" }}>
                      <input type="checkbox" checked={on} disabled={byRole || props.lockDuties} onChange={() => toggleDuty(k)} />
                      <span><b>{l}</b>{byRole ? " · din rol" : k === "inspector" ? " · aplicația de inspecții" : " · rapoarte, inspecții"}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {kind === "client" && <label className="field"><span>Localitate <small>(opțional)</small></span><input className="input" value={f.city} onChange={set("city")} placeholder="ex. Timișoara" /></label>}
        </div>

        {kind === "internal" && duties.includes("inspector") && !duties.includes("evaluator") && (
          <>
            <div className="section">Inspector</div>
            <div className="grid2">
              <label className="field"><span>Zonă acoperită <small>(opțional)</small></span><input className="input" value={f.coverage} onChange={set("coverage")} placeholder="ex. Timiș, Arad, Caraș-Severin" /></label>
            </div>
          </>
        )}
        {kind === "internal" && duties.includes("evaluator") && (
          <>
            <div className="section">Evaluator{duties.includes("inspector") ? " și inspector" : ""}</div>
            <div className="grid2">
              <label className="field"><span>Nr. legitimație ANEVAR <small>(opțional)</small></span><input className="input" value={f.anevar_no} onChange={set("anevar_no")} placeholder="ex. 12345" /></label>
              <label className="field"><span>Zonă acoperită <small>(opțional)</small></span><input className="input" value={f.coverage} onChange={set("coverage")} placeholder="ex. Timiș, Arad, Caraș-Severin" /></label>
            </div>
            <div className="field">Specializări
              <div className="chips">
                {SPECIALIZATIONS.map(([k, l]) => (
                  <label key={k} className="check" style={{ alignItems: "center", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 999, background: f.specializations.includes(k) ? "var(--acc-soft)" : "#fff" }}>
                    <input type="checkbox" checked={f.specializations.includes(k)} onChange={() => toggleSpec(k)} />
                    <span><b>{k}</b> · {l}</span>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        <label className="field"><span>Note interne <small>(nu le vede utilizatorul)</small></span>
          <textarea className="textarea" rows={3} value={f.notes} onChange={set("notes")} placeholder={kind === "internal" ? "ex. disponibilitate, tarif convenit, zone preferate" : kind === "client" ? "ex. de unde a venit, preferințe de contact" : "ex. bănci cu care lucrează"} />
        </label>

        {isNew && (
          <label className="check"><input type="checkbox" checked={invite} onChange={(e) => setInvite(e.target.checked)} />{INVITE_TEXT[kind]}</label>
        )}
      </fieldset>

      {msg && <div role={msg.ok ? "status" : "alert"} className={msg.ok ? "okMsg" : "error"}>{msg.text}</div>}
      {!ro && (
        <div className="actions">
          <button type="submit" className="btn btnNavy" disabled={busy}>{busy ? "Se salvează…" : isNew ? "Salvează utilizatorul" : "Salvează modificările"}</button>
          {isNew && <a href={`${base}/utilizatori?tab=${kind === "internal" ? "interni" : kind === "partner" ? "colaboratori" : "clienti"}`} className="btn btnGhost">Renunță</a>}
        </div>
      )}
    </form>
  );
}
