import type { Metadata } from "next";
import { dutiesOf } from "@/lib/labels";
import { notFound } from "next/navigation";
import { fmtDate, staffPage } from "@/lib/guard";
import { redirect } from "next/navigation";
import { can, roleNames } from "@/lib/perms";
import { getConfig } from "@/lib/perms-db";
import { listPartners } from "@/lib/partners";
import { history } from "@/lib/history";
import { canManageUser, displayName, getUser, KIND_LABEL, roleLabel, teamLabel } from "@/lib/users";
import { ProfileCard, DeleteUser } from "../UserActions";
import { CrmShell } from "@/components/CrmShell";
import { photoUrl, presenceOf } from "@/lib/presence";
import { History } from "@/components/History";
import { UserForm } from "../UserForm";
import { AccessPanel } from "./AccessPanel";
import { AccreditationsPanel } from "./AccreditationsPanel";

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
  // Everyone sees their own profile; the other accounts need "admin" (Utilizatori).
  if (id !== me.id && !can(me, "users")) redirect(`${base}/?fara-acces=1`);
  const u = await getUser(db, id);
  if (!u) notFound();
  const self = u.id === me.id;
  // Same rules as PATCH /api/crm/users/[id].
  const gone = u.status === "deleted";
  const canManage = !gone && canManageUser(me, u);
  const canDelete = !gone && !self && canManage && (u.kind !== "internal" || can(me, "users.D"));
  const why = gone ? "Contul a fost șters. Numele rămâne doar în istoricul lucrărilor."
    : canManage ? null
    : u.role === "owner" ? "Contul unui proprietar îl poate modifica doar un proprietar."
    : "Conturile echipei le modifică administratorii (și fiecare pe al său).";
  const presence = u.kind === "internal" && !gone ? presenceOf(self ? new Date().toISOString() : u.last_seen_at) : null;
  const firms = u.kind === "partner" ? (await listPartners(db)).map((p) => ({ id: p.id, name: p.name })) : [];
  const [log, cfg, shares, fw, accred] = await Promise.all([
    history(db, [u.id]), getConfig(db),
    db.prepare("SELECT share_evaluator, share_verifier, inspector_fee_kind, inspector_fee, profit_share, pay_mode FROM users WHERE id = ?").bind(u.id)
      .first<{ share_evaluator: number | null; share_verifier: number | null; inspector_fee_kind: string | null; inspector_fee: number | null; profit_share: number | null; pay_mode: string | null }>(),
    // Agreeri: the framework contracts (team accounts, seen by those who manage users)
    u.kind === "internal" && can(me, "users")
      ? db.prepare(`SELECT k.id, COALESCE(e.name, 'Fără bancă') AS bank, k.number, k.closed_on IS NOT NULL AS closed FROM contracts k LEFT JOIN entities e ON e.id = k.client_id
          WHERE k.kind = 'framework' ORDER BY k.closed_on IS NOT NULL, e.name, k.signed_on DESC`).all<{ id: string; bank: string; number: string | null; closed: number }>().then((x) => x.results)
      : Promise.resolve([]),
    u.kind === "internal" ? db.prepare("SELECT contract_id FROM contract_accreditations WHERE user_id = ?").bind(u.id).all<{ contract_id: string }>().then((x) => x.results.map((r) => r.contract_id)).catch(() => [] as string[]) : Promise.resolve([] as string[]),
  ]);
  const names = roleNames(cfg);
  const roleOptions = cfg.roles.map((r) => [r.id, r.name] as [string, string]);
  // A role that no longer exists in the matrix (deleted, or "inspector" from before) stays selectable for that account.
  if (u.kind === "internal" && u.role !== "owner" && !names[u.role]) roleOptions.push([u.role, teamLabel(u)]);
  const numStr = (n: number | null | undefined) => (n == null ? "" : String(n));
  const nou = (await searchParams).nou;

  return (
    <CrmShell back={{ href: `${base}/utilizatori?tab=${TAB[u.kind]}`, label: "Utilizatori" }}
      user={me} base={base} active="users" title={displayName(u)}
      subtitle={`${KIND_LABEL[u.kind]} · ${u.kind === "internal" ? teamLabel(u, names) : roleLabel(u.kind, u.role)}${u.partner_name ? ` · ${u.partner_name}` : ""} · adăugat ${fmtDate(u.created_at)}${u.kind === "internal" ? ` · ${presenceOf(u.last_seen_at).seen}` : ""}`}
      actions={<>
        {canDelete && <DeleteUser id={u.id} name={displayName(u)} back={`${base}/utilizatori?tab=${TAB[u.kind]}`} />}
      </>}
    >
      {nou && NEW_MSG[nou] && <div className={nou === "invitat" ? "okMsg" : "note"}>{NEW_MSG[nou]}</div>}
      {u.kind === "partner" && u.partner_status === "suspended" && <div className="note">Firma {u.partner_name} este suspendată: persoanele ei nu se pot autentifica în portal.</div>}
      <div className="cols">
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <ProfileCard id={u.id} name={displayName(u)} photo={photoUrl(u.id, u.avatar_at)} canEdit={canManage} note={why}
            sub={`${KIND_LABEL[u.kind]} · ${u.kind === "internal" ? teamLabel(u, names) : roleLabel(u.kind, u.role)}${u.partner_name ? ` · ${u.partner_name}` : ""}`}
            presence={presence?.presence ?? null} seen={presence?.seen ?? null} />
          {!gone && <AccessPanel
            userId={u.id} kind={u.kind} email={u.email} status={u.status}
            invitedAt={fmtDate(u.invited_at, true)} activatedAt={fmtDate(u.activated_at, true)} lastLogin={fmtDate(u.last_login_at, true)}
            canInvite={canManage} canDisable={canManage && !self && !(u.kind === "internal" && u.role === "owner")}
          />}
          <UserForm
            kind={u.kind} base={base} userId={u.id} firms={firms} readOnly={!canManage} lockRole={self || u.role === "owner"} canMakeOwner={me.role === "owner"}
            roles={roleOptions} shares={u.kind === "internal" && (me.role === "owner" || self || can(me, "fees.all"))} editShares={me.role === "owner"} profitShare={me.role === "owner" && u.kind === "internal"}
            initial={{
              name: u.name, email: u.email, phone: u.phone ?? "", role: u.role, engagement: u.engagement ?? "employee", anevar_no: u.anevar_no ?? "", duties: dutiesOf(u),
              specializations: u.specializations ? u.specializations.split(",") : [], coverage: u.coverage ?? "", partner_id: u.partner_id ?? "",
              client_type: u.client_type ?? "person", company: u.company ?? "", cui: u.cui ?? "", city: u.city ?? "", notes: u.notes ?? "",
              share_evaluator: numStr(shares?.share_evaluator), share_verifier: numStr(shares?.share_verifier),
              inspector_fee_kind: shares?.inspector_fee_kind ?? "fixed", inspector_fee: numStr(shares?.inspector_fee),
              // the share of the profit: only in the owner's page
              profit_share: me.role === "owner" ? numStr(shares?.profit_share) : "", pay_mode: me.role === "owner" && shares?.pay_mode === "profit" ? "profit" : "commission",
            }}
          />
          {u.kind === "internal" && !gone && can(me, "users") && u.role !== "owner" && (
            <AccreditationsPanel userId={u.id} contracts={fw.map((c) => ({ id: c.id, bank: c.bank, number: c.number, closed: !!c.closed }))} initial={accred} canEdit={canManage && can(me, "users.E")} />
          )}
          {u.kind === "partner" && u.partner_id && <a className="rowLink" href={`${base}/utilizatori/firme/${u.partner_id}`}>Vezi firma {u.partner_name} →</a>}
        </div>
        <History log={log} />
      </div>
    </CrmShell>
  );
}
