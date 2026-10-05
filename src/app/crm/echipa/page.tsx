import type { Metadata } from "next";
import { fmtDate, staffPage } from "@/lib/guard";
import { CrmShell } from "@/components/CrmShell";
import { TeamPanel } from "./TeamPanel";

export const metadata: Metadata = { title: "Echipa | CRM VALUEFY" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const { db, user, base } = await staffPage();
  const { results } = await db
    .prepare("SELECT id, name, email, role, status, last_login_at FROM staff_users ORDER BY role = 'owner' DESC, created_at")
    .all<{ id: string; name: string; email: string; role: string; status: string; last_login_at: string | null }>();
  return (
    <CrmShell user={user} base={base} active="team" title="Echipa VALUEFY" subtitle={`${results.length} persoane cu acces în CRM`}>
      <div style={{ maxWidth: 900, display: "flex", flexDirection: "column", gap: 18 }}>
        <TeamPanel
          meId={user.id}
          canManage={user.role !== "staff"}
          members={results.map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role, status: m.status, lastLogin: fmtDate(m.last_login_at, true) }))}
        />
      </div>
    </CrmShell>
  );
}
