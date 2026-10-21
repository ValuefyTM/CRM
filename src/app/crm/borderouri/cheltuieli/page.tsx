import type { Metadata } from "next";
import { staffPage } from "@/lib/guard";
import { can } from "@/lib/perms";
import { thisMonth } from "@/lib/statements";
import { CrmShell } from "@/components/CrmShell";
import { CostsEditor } from "./CostsEditor";

export const metadata: Metadata = { title: "Cheltuieli fixe | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** The fixed monthly costs counted in the month's profit. */
export default async function CostsPage() {
  const { user, base } = await staffPage("statements.all");
  return (
    <CrmShell back={{ href: `${base}/borderouri`, label: "Borderouri" }} user={user} base={base} active="statements" title="Cheltuieli fixe" subtitle="Costurile lunare ale firmei, scăzute din venituri la profitul lunii">
      <CostsEditor canEdit={can(user, "statements.E")} canDelete={can(user, "statements.D")} thisMonth={thisMonth()} />
    </CrmShell>
  );
}
