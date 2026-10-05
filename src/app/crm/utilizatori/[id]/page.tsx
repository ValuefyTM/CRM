import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmtDate, staffPage } from "@/lib/guard";
import { listPartners } from "@/lib/partners";
import { history } from "@/lib/history";
import { displayName, getUser, isAdmin, KIND_LABEL, roleLabel } from "@/lib/users";
import { CrmShell } from "@/components/CrmShell";
import { History } from "@/components/History";
import { UserForm } from "../UserForm";
import { AccessPanel } from "./AccessPanel";

export const metadata: Metadata = { title: "Utilizator | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const TAB = { internal: "interni", partner: "colaboratori", client: "clienti" } as const;

const NEW_MSG: Record<string, string> = {
  invitat: "Utilizatorul a fost salvat și emailul de invitație a fost trimis.",
  neinvitat: "Utilizatorul a fost salvat, dar emailul nu a putut fi trimis. Verifică setările de email și retrimite invitația de mai jos.",
  fara: "Utilizatorul a fost salvat. Trimite invitația de mai jos când ești gata.",
};

export default async function UserPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nou?: string }> }) {
  const { db, user: me, base } = await staffPage();
  const { id } = await params;
  const u = await getUser(db, id);
  if (!u) notFound();
  const self = u.id === me.id;
  // Same rules as PATCH /api/crm/users/[id].
  const canManage = u.kind !== "internal" || self || (isAdmin(me) && (u.role !== "owner" || me.role === "owner"));
  const firms = u.kind === "partner" ? (await listPartners(db)).map((p) => ({ id: p.id, name: p.name })) : [];
  const log = await history(db, [u.id]);
  const nou = (await searchParams).nou;

  return (
    <CrmShell
      user={me} base={base} active="users" title={displayName(u)}
      subtitle={`${KIND_LABEL[u.kind]} · ${roleLabel(u.kind, u.role)}${u.partner_name ? ` · ${u.partner_name}` : ""} · adăugat ${fmtDate(u.created_at)}`}
      actions={<a href={`${base}/utilizatori?tab=${TAB[u.kind]}`} className="btn btnGhost btnSm">← Utilizatori</a>}
    >
      {nou && NEW_MSG[nou] && <div className={nou === "invitat" ? "okMsg" : "note"}>{NEW_MSG[nou]}</div>}
      {u.kind === "partner" && u.partner_status === "suspended" && <div className="note">Firma {u.partner_name} este suspendată: persoanele ei nu se pot autentifica în portal.</div>}
      <div className="cols">
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <AccessPanel
            userId={u.id} kind={u.kind} email={u.email} status={u.status}
            invitedAt={fmtDate(u.invited_at, true)} activatedAt={fmtDate(u.activated_at, true)} lastLogin={fmtDate(u.last_login_at, true)}
            canInvite={canManage} canDisable={canManage && !self && !(u.kind === "internal" && u.role === "owner")}
          />
          <UserForm
            kind={u.kind} base={base} userId={u.id} firms={firms} readOnly={!canManage} lockRole={self || u.role === "owner"}
            initial={{
              name: u.name, email: u.email, phone: u.phone ?? "", role: u.role, engagement: u.engagement ?? "employee", anevar_no: u.anevar_no ?? "",
              specializations: u.specializations ? u.specializations.split(",") : [], coverage: u.coverage ?? "", partner_id: u.partner_id ?? "",
              client_type: u.client_type ?? "person", company: u.company ?? "", cui: u.cui ?? "", city: u.city ?? "", notes: u.notes ?? "",
            }}
          />
          {u.kind === "partner" && u.partner_id && <a className="rowLink" href={`${base}/utilizatori/firme/${u.partner_id}`}>Vezi firma {u.partner_name} →</a>}
        </div>
        <History log={log} />
      </div>
    </CrmShell>
  );
}
