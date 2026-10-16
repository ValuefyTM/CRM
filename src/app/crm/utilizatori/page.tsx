import type { Metadata } from "next";
import { fmtDate, staffPage } from "@/lib/guard";
import { kindLabel, listPartners } from "@/lib/partners";
import { canManageUser, clientTypeLabel, displayName, listUsers, roleLabel, teamLabel } from "@/lib/users";
import { can, roleNames } from "@/lib/perms";
import { getConfig } from "@/lib/perms-db";
import { CrmShell } from "@/components/CrmShell";
import { photoUrl, presenceOf } from "@/lib/presence";
import { UsersBrowser, type Tab } from "./UsersBrowser";

export const metadata: Metadata = { title: "Utilizatori | CRM VALUEFY" };
export const dynamic = "force-dynamic";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ tab?: string; vezi?: string }> }) {
  const { db, user, base } = await staffPage("users");
  const [users, partners, cfg] = await Promise.all([listUsers(db), listPartners(db), getConfig(db)]);
  const names = roleNames(cfg);
  const sp = await searchParams;
  const tab: Tab = sp.tab === "colaboratori" || sp.tab === "clienti" ? sp.tab : "interni";
  const rows = users.map((u) => ({
    id: u.id, kind: u.kind, name: displayName(u), email: u.email, phone: u.phone, role: u.role, roleLabel: u.kind === "internal" ? teamLabel(u, names) : roleLabel(u.kind, u.role), duties: [], status: u.status,
    partnerId: u.partner_id, partnerName: u.partner_name, engagement: u.engagement, anevar: u.anevar_no, specs: u.specializations,
    company: u.company, clientType: clientTypeLabel(u.client_type), city: u.city, lastLogin: fmtDate(u.last_login_at, true), isMe: u.id === user.id,
    ...presenceOf(u.id === user.id ? new Date().toISOString() : u.last_seen_at), photo: photoUrl(u.id, u.avatar_at),
    canEdit: canManageUser(user, u), canDelete: u.id !== user.id && canManageUser(user, u) && can(user, "users.D"),
  }));
  const firms = partners.map((p) => ({
    id: p.id, name: p.name, kind: p.kind, kindLabel: kindLabel(p.kind), city: p.city, cui: p.cui, status: p.status,
    users: p.users, active: p.active_users, invited: p.invited_users, lastLogin: p.last_login_at ? fmtDate(p.last_login_at, true) : "—",
  }));
  return (
    <CrmShell user={user} base={base} active="users" title="Utilizatori" subtitle="Echipa VALUEFY și evaluatorii, colaboratorii din portal și clienții cu cont">
      <UsersBrowser rows={rows} firms={firms} base={base} initialTab={tab} initialView={sp.vezi === "firme" ? "firms" : "people"} canAddInternal={can(user, "users.A")} />
    </CrmShell>
  );
}
