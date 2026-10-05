import { getDb } from "@/lib/db";
import { countNewLeads } from "@/lib/leads";
import { initials } from "@/lib/guard";
import { roleLabel, type User } from "@/lib/users";
import { Shell } from "./Shell";

export async function CrmShell(props: { user: User; base: string; active: string; title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  const b = props.base;
  // Badge on "Comenzi": orders nobody in the team has opened yet, plus new requests from the website.
  const db = await getDb();
  const unread = db ? ((await db.prepare("SELECT COUNT(*) AS n FROM orders WHERE viewed_at IS NULL").first<{ n: number }>().catch(() => null))?.n ?? 0) + (await countNewLeads(db)) : 0;
  return (
    <Shell
      app="crm"
      label="CRM"
      cta={{ label: "+ Utilizator nou", href: `${b}/utilizatori/nou` }}
      nav={[
        { key: "home", label: "Acasă", href: b || "/" },
        { key: "orders", label: "Comenzi", href: `${b}/comenzi`, badge: unread },
        { key: "reports", label: "Rapoarte", href: `${b}/rapoarte` },
        { key: "users", label: "Utilizatori", href: `${b}/utilizatori` },
        ...(props.user.role === "owner" ? [{ key: "import", label: "Import Glide", href: `${b}/setari/import` }] : []),
      ]}
      active={props.active}
      me={{ initials: initials(props.user.name, props.user.email), name: props.user.name || props.user.email, sub: roleLabel("internal", props.user.role) }}
      title={props.title}
      subtitle={props.subtitle}
      actions={props.actions}
    >
      {props.children}
    </Shell>
  );
}
