import { initials } from "@/lib/guard";
import { displayName, type User } from "@/lib/users";
import { Shell } from "./Shell";

/** Shared by partner users ("Portal colaboratori") and clients ("Portal client"). */
export function PortalShell(props: { user: User; base: string; active: string; title: string; subtitle?: string; children: React.ReactNode }) {
  const b = props.base;
  const u = props.user;
  const partner = u.kind === "partner";
  return (
    <Shell
      app="portal"
      label={partner ? "Portal colaboratori" : "Portal client"}
      cta={{ label: partner ? "+ Comandă nouă" : "+ Solicită evaluare", href: `${b}/comenzi/noua` }}
      nav={[
        { key: "home", label: "Acasă", href: b || "/" },
        { key: "orders", label: partner ? "Comenzi" : "Evaluările mele", href: `${b}/comenzi` },
        { key: "account", label: "Contul meu", href: `${b}/cont` },
      ]}
      active={props.active}
      me={{ initials: initials(u.name, u.email), name: displayName(u), sub: partner ? u.partner_name ?? "" : u.company || "Cont client" }}
      title={props.title}
      subtitle={props.subtitle}
    >
      {props.children}
    </Shell>
  );
}
