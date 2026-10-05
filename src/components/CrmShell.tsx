import { initials } from "@/lib/guard";
import { roleLabel, type User } from "@/lib/users";
import { Shell } from "./Shell";

export function CrmShell(props: { user: User; base: string; active: string; title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  const b = props.base;
  return (
    <Shell
      app="crm"
      label="CRM"
      cta={{ label: "+ Utilizator nou", href: `${b}/utilizatori/nou` }}
      nav={[
        { key: "home", label: "Acasă", href: b || "/" },
        { key: "users", label: "Utilizatori", href: `${b}/utilizatori` },
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
