import type { StaffUser } from "@/lib/auth";
import { initials } from "@/lib/guard";
import { Shell } from "./Shell";

const ROLE = { owner: "Proprietar", admin: "Administrator", staff: "Echipă" } as const;

export function CrmShell(props: { user: StaffUser; base: string; active: string; title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  const b = props.base;
  return (
    <Shell
      audience="staff"
      label="CRM"
      cta={{ label: "+ Colaborator nou", href: `${b}/colaboratori/nou` }}
      nav={[
        { key: "home", label: "Acasă", href: b || "/" },
        { key: "partners", label: "Colaboratori", href: `${b}/colaboratori` },
        { key: "team", label: "Echipa VALUEFY", href: `${b}/echipa` },
      ]}
      active={props.active}
      me={{ initials: initials(props.user.name, props.user.email), name: props.user.name || props.user.email, sub: ROLE[props.user.role] }}
      title={props.title}
      subtitle={props.subtitle}
      actions={props.actions}
    >
      {props.children}
    </Shell>
  );
}
