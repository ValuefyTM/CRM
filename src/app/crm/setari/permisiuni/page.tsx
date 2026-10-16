import type { Metadata } from "next";
import { staffPage } from "@/lib/guard";
import { getConfig } from "@/lib/perms-db";
import { DEFAULT_CONFIG } from "@/lib/perms";
import { CrmShell } from "@/components/CrmShell";
import { SettingsTabs } from "../SettingsTabs";
import { PermMatrix } from "./PermMatrix";

export const metadata: Metadata = { title: "Permisiuni | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** Roles × modules, and the rights inside a report's team. The owner always has everything and is the only one who changes them. */
export default async function PermsPage() {
  const { db, user, base } = await staffPage("users");
  const [cfg, people] = await Promise.all([
    getConfig(db),
    db.prepare("SELECT role, COUNT(*) AS n FROM users WHERE kind = 'internal' AND status NOT IN ('deleted', 'disabled') GROUP BY role").all<{ role: string; n: number }>(),
  ]);
  const count = Object.fromEntries(people.results.map((r) => [r.role, r.n])) as Record<string, number>;
  const owner = user.role === "owner";
  return (
    <CrmShell user={user} base={base} active="settings" title="Permisiuni" subtitle="Rolurile pe rânduri, modulele pe coloane · proprietarul are mereu acces complet">
      <SettingsTabs base={base} active="permisiuni" user={user} />
      {!owner && <div className="note">Doar proprietarul modifică permisiunile. Le poți vedea aici.</div>}
      <PermMatrix initial={cfg} defaults={DEFAULT_CONFIG} counts={count} owners={count.owner ?? 1} edit={owner} />
    </CrmShell>
  );
}
