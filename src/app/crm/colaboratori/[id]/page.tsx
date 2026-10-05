import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmtDate, staffPage } from "@/lib/guard";
import { getPartner, kindLabel, partnerUsers } from "@/lib/partners";
import { CrmShell } from "@/components/CrmShell";
import { PartnerForm } from "../PartnerForm";
import { PeoplePanel } from "./PeoplePanel";
import { StatusToggle } from "./StatusToggle";

export const metadata: Metadata = { title: "Colaborator | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const ACTIONS: Record<string, string> = {
  "partner.create": "Colaborator creat", "partner.update": "Date actualizate", "partner.suspend": "Colaborator suspendat", "partner.activate": "Colaborator reactivat",
  "partner_user.create": "Persoană adăugată", "partner_user.invite": "Invitație trimisă", "partner_user.activate": "Cont activat",
  "partner_user.disable": "Acces dezactivat", "partner_user.enable": "Acces reactivat", "partner_user.role": "Rol schimbat", "partner_user.profile": "Profil actualizat",
};

export default async function PartnerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nou?: string }> }) {
  const { db, user, base } = await staffPage();
  const { id } = await params;
  const p = await getPartner(db, id);
  if (!p) notFound();
  const users = await partnerUsers(db, id);
  const ids = [id, ...users.map((u) => u.id)];
  const { results: log } = await db
    .prepare(`SELECT a.at, a.action, a.details, a.actor, s.name AS staff_name, s.email AS staff_email FROM audit_log a LEFT JOIN staff_users s ON a.actor = 'staff:' || s.id
      WHERE a.entity_id IN (${ids.map(() => "?").join(",")}) ORDER BY a.at DESC LIMIT 30`)
    .bind(...ids)
    .all<{ at: string; action: string; details: string | null; actor: string; staff_name: string | null; staff_email: string | null }>();
  const nou = (await searchParams).nou;

  return (
    <CrmShell
      user={user} base={base} active="partners" title={p.name}
      subtitle={`${kindLabel(p.kind)}${p.city ? ` · ${p.city}` : ""} · adăugat ${fmtDate(p.created_at)}`}
      actions={<><a href={`${base}/colaboratori`} className="btn btnGhost btnSm">← Colaboratori</a><StatusToggle partnerId={p.id} status={p.status} canChange={user.role !== "staff"} /></>}
    >
      {nou && (
        <div className={nou === "invitat" ? "okMsg" : "note"}>
          {nou === "invitat" ? "Colaboratorul a fost salvat și invitația a fost trimisă pe email." : nou === "neinvitat" ? "Colaboratorul a fost salvat, dar emailul de invitație nu a putut fi trimis. Verifică setările de email și retrimite invitația de mai jos." : "Colaboratorul a fost salvat. Adaugă persoanele care vor avea acces în portal."}
        </div>
      )}
      {p.status === "suspended" && <div className="note">Colaborator suspendat: persoanele lui nu se pot autentifica în portal.</div>}
      <div className="cols">
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <PeoplePanel
            partnerId={p.id}
            people={users.map((u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, status: u.status, invitedAt: fmtDate(u.invited_at, true), lastLogin: fmtDate(u.last_login_at, true) }))}
          />
          <PartnerForm
            base={base}
            partnerId={p.id}
            initial={{ name: p.name, kind: p.kind, cui: p.cui ?? "", reg_com: p.reg_com ?? "", email: p.email ?? "", phone: p.phone ?? "", city: p.city ?? "", address: p.address ?? "", notes: p.notes ?? "" }}
          />
        </div>
        <section className="card">
          <h2>Istoric</h2>
          {log.length === 0 ? <p className="hint">Nicio activitate încă.</p> : (
            <ul className="log">
              {log.map((l, i) => (
                <li key={i}>
                  <time>{fmtDate(l.at, true)}</time>
                  <span>
                    <b>{ACTIONS[l.action] ?? l.action}</b>
                    {l.details && ` · ${l.details}`}
                    {l.actor.startsWith("staff:") && <span className="muted"> · {l.staff_name || l.staff_email || "echipa"}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </CrmShell>
  );
}
