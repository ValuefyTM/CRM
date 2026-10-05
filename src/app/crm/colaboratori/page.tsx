import type { Metadata } from "next";
import { fmtDate, staffPage } from "@/lib/guard";
import { kindLabel, listPartners } from "@/lib/partners";
import { CrmShell } from "@/components/CrmShell";
import { PartnersTable } from "./PartnersTable";

export const metadata: Metadata = { title: "Colaboratori | CRM VALUEFY" };
export const dynamic = "force-dynamic";

export default async function PartnersPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { db, user, base } = await staffPage();
  const partners = await listPartners(db);
  const rows = partners.map((p) => ({
    id: p.id, name: p.name, kind: p.kind, kindLabel: kindLabel(p.kind), city: p.city, cui: p.cui, status: p.status,
    users: p.users, active: p.active_users, invited: p.invited_users, lastLogin: p.last_login_at ? fmtDate(p.last_login_at, true) : "—",
  }));
  return (
    <CrmShell
      user={user} base={base} active="partners" title="Colaboratori"
      subtitle={`${partners.length} colaboratori · brokeri, agenții, bănci și alți parteneri care comandă evaluări`}
      actions={<a href={`${base}/colaboratori/nou`} className="btn btnGold">+ Colaborator nou</a>}
    >
      <PartnersTable rows={rows} base={base} initial={(await searchParams).f ?? "all"} />
    </CrmShell>
  );
}
