import type { PartnerUser } from "@/lib/auth";
import { initials } from "@/lib/guard";
import { Shell } from "./Shell";

export function PortalShell(props: { user: PartnerUser; base: string; active: string; title: string; subtitle?: string; children: React.ReactNode }) {
  const b = props.base;
  return (
    <Shell
      audience="partner"
      label="Portal colaboratori"
      cta={{ label: "+ Comandă nouă" }}
      nav={[
        { key: "home", label: "Acasă", href: b || "/" },
        { key: "account", label: "Contul meu", href: `${b}/cont` },
      ]}
      active={props.active}
      me={{ initials: initials(props.user.name, props.user.email), name: props.user.name || props.user.email, sub: props.user.partner_name }}
      title={props.title}
      subtitle={props.subtitle}
    >
      {props.children}
    </Shell>
  );
}
