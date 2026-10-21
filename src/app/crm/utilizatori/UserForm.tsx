"use client";

import { useState } from "react";
import { CLIENT_TYPES, DUTIES, ENGAGEMENTS, INTERNAL_ROLES, PARTNER_ROLES, SPECIALIZATIONS } from "@/lib/labels";
import type { Kind } from "@/lib/site";

export type UserValues = {
  name: string; email: string; phone: string; role: string; engagement: string; anevar_no: string; specializations: string[]; coverage: string;
  duties: string[]; partner_id: string; client_type: string; company: string; cui: string; city: string; notes: string;
  /** Fee shares (owner only): % as main evaluator, % as verifier, inspection fee fixed (lei) or % when only the inspector. */
  share_evaluator: string; share_verifier: string; inspector_fee_kind: string; inspector_fee: string;
  /** Share of the profit generated on their reports (owner only: set and seen). */
  profit_share: string;
};

const EMPTY: UserValues = {
  name: "", email: "", phone: "", role: "", engagement: "employee", anevar_no: "", specializations: [], coverage: "",
  duties: [], partner_id: "", client_type: "person", company: "", cui: "", city: "", notes: "",
  share_evaluator: "", share_verifier: "", inspector_fee_kind: "fixed", inspector_fee: "", profit_share: "",
};

/** The share of the profit goes only with the owner's form. */
const withoutProfit = ({ profit_share: _p, ...rest }: UserValues) => rest;

const INVITE_TEXT: Record<Kind, string> = {
  internal: "Trimite acum un email cu acces la CRM",
  partner: "Trimite acum invitația în Portalul colaboratori",
  client: "Trimite acum invitația în Portalul client",
};

/**
 * Create or edit any account. `lockRole` keeps the role as it is (owners, or people editing themselves);
 * `readOnly` is for team members looking at accounts they may not change; `canMakeOwner` when an owner is editing;
 * `roles`: the team roles of Setări → Permisiuni (with the ones the owner added); `shares`: show the fee shares, `editShares` (owner).
 */
export function UserForm(props: {
  kind: Kind; base: string; userId?: string; initial?: Partial<UserValues>; firms: { id: string; name: string }[];
  lockRole?: boolean; readOnly?: boolean; canMakeOwner?: boolean; roles?: [string, string][]; shares?: boolean; editShares?: boolean;
  /** the share of the profit: shown and sent only for the owner */
  profitShare?: boolean;
}) {
  const { kind, base, userId } = props;
  const isNew = !userId;
  const [f, setF] = useState<UserValues>({ ...EMPTY, role: kind === "partner" ? "member" : kind === "internal" ? "operator" : "client", ...props.initial });
  const [invite, setInvite] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof UserValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
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
      body: JSON.stringify({ ...(isNew ? { kind, ...withoutProfit(f), invite } : { action: "update", ...withoutProfit(f) }), ...(props.profitShare ? { profit_share: f.profit_share } : {}) }),
    });
    const d = (await r.json().catch(() => ({}))) as { error?: string; id?: string; invited?: boolean };
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: d.error || "Nu am putut salva." });
    if (isNew && d.id) location.href = `${base}/utilizatori/${d.id}?nou=${d.invited ? "invitat" : invite ? "neinvitat" : "fara"}`;
    else setMsg({ ok: true, text: "Modificările au fost salvate." });
  };

  const internal: [string, string][] = [["owner", "Proprietar"], ...(props.roles ?? INTERNAL_ROLES.filter(([k]) => k !== "owner").map(([k, l]) => [k, l] as [string, string]))];
  const roles = kind === "internal" ? internal.filter(([k]) => k !== "owner" || f.role === "owner" || props.canMakeOwner) : PARTNER_ROLES;

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

          {kind === "client" && <label className="field"><span>Localitate <small>(opțional)</small></span><input className="input" value={f.city} onChange={set("city")} placeholder="ex. Timișoara" /></label>}
        </div>

        {kind === "internal" && f.role !== "operator" && (
          <>
            <div className="section">Evaluări și inspecții</div>
            <div className="grid2">
              <label className="field"><span>Nr. legitimație ANEVAR <small>(opțional)</small></span><input className="input" value={f.anevar_no} onChange={(e) => setF({ ...f, anevar_no: e.target.value, duties: e.target.value.trim() ? f.duties : [] })} placeholder="ex. 12345" /></label>
              <label className="field"><span>Zonă acoperită <small>(opțional)</small></span><input className="input" value={f.coverage} onChange={set("coverage")} placeholder="ex. Timiș, Arad, Caraș-Severin" /></label>
            </div>
            <div className="field"><span>Roluri în rapoarte <small>{f.anevar_no.trim() ? "(apare în listele de alocare pentru ce bifezi)" : "(se bifează doar cu nr. de legitimație ANEVAR completat)"}</small></span>
              <div className="chips">
                {DUTIES.map(([k, l]) => {
                  const on = f.duties.includes(k), ok = !!f.anevar_no.trim();
                  return (
                    <label key={k} className="check" style={{ alignItems: "center", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 999, background: on ? "var(--acc-soft)" : "#fff", opacity: ok ? 1 : 0.55 }}>
                      <input type="checkbox" checked={on} disabled={!ok || props.readOnly} onChange={() => setF({ ...f, duties: on ? f.duties.filter((d) => d !== k) : [...f.duties, k] })} />
                      <span><b>{l}</b></span>
                    </label>
                  );
                })}
              </div>
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

        {kind === "internal" && props.shares && (
          <>
            <div className="section">Cota din onorariu</div>
            <p className="hint" style={{ margin: 0 }}>Din onorariul raportului fără TVA. Se adună pe borderoul lunar, după data predării raportului.{!props.editShares && " Le stabilește proprietarul."}</p>
            <fieldset disabled={!props.editShares} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              <div className="grid3">
                <label className="field"><span>Ca evaluator principal</span><span className="inputUnit"><input className="input" inputMode="decimal" value={f.share_evaluator} onChange={set("share_evaluator")} placeholder="ex. 40" /><small>%</small></span></label>
                <label className="field"><span>Ca verificator</span><span className="inputUnit"><input className="input" inputMode="decimal" value={f.share_verifier} onChange={set("share_verifier")} placeholder="ex. 10" /><small>%</small></span></label>
                <label className="field"><span>Doar ca inspector</span>
                  <span className="inputUnit">
                    <input className="input" inputMode="decimal" value={f.inspector_fee} onChange={set("inspector_fee")} placeholder={f.inspector_fee_kind === "pct" ? "ex. 15" : "ex. 150"} />
                    <select className="select" value={f.inspector_fee_kind} onChange={set("inspector_fee_kind")} aria-label="Tarif fix sau procent"><option value="fixed">lei fix</option><option value="pct">%</option></select>
                  </span>
                </label>
              </div>
            </fieldset>
          </>
        )}

        {kind === "internal" && props.profitShare && (
          <>
            <div className="section">Cota din profit <small className="muted" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>· o vezi și o setezi doar tu</small></div>
            <p className="hint" style={{ margin: 0 }}>Procent din profitul generat pe rapoartele în care e în echipă (Borderouri, filtrat pe el): venituri − plăți − partea lui din cheltuielile fixe.</p>
            <label className="field" style={{ maxWidth: 220 }}><span>Cota din profit</span><span className="inputUnit"><input className="input" inputMode="decimal" value={f.profit_share} onChange={set("profit_share")} placeholder="ex. 30" /><small>%</small></span></label>
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
