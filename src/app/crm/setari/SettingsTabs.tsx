import { can, type WithPerms } from "@/lib/perms";

const tabsOf = (user: WithPerms): [string, string, string, boolean][] => [
  ["firma", "Date firmă", "", can(user, "settings")],
  ["contract", "Model contract", "/contract", can(user, "settings")],
  ["permisiuni", "Permisiuni", "/permisiuni", can(user, "users")],
  ["fise", "Fișe de inspecție", "/fise", can(user, "templates")],
  ["machete", "Machete de raport", "/machete", can(user, "templates")],
  // the billing settings (Oblio, series, rules) are for those who may change them; the evaluators who only invoice their reports do not see them
  ["facturare", "Facturare · Oblio", "/facturare", can(user, "billing.E")],
  ["alerte", "Alerte", "/alerte", can(user, "settings")],
  ["claude", "Conexiuni Claude", "/claude", can(user, "settings")],
  ["import", "Import istoric", "/import", user.role === "owner"],
];

/** The first tab of Setări the user may open (the menu item leads there), or null: no Setări for them. */
export function settingsHome(base: string, user: WithPerms) {
  const t = tabsOf(user).find(([, , , ok]) => ok);
  return t ? `${base}/setari${t[2]}` : null;
}

/** Tabs of Setări (one item in the menu): each one only for those who may open it. */
export function SettingsTabs({ base, active, user }: { base: string; active: "firma" | "contract" | "facturare" | "alerte" | "claude" | "fise" | "machete" | "permisiuni" | "import"; user: WithPerms }) {
  const tabs = tabsOf(user);
  return (
    <nav className="tabs" aria-label="Setări">
      {tabs.filter(([, , , ok]) => ok).map(([k, l, path]) => (
        <a key={k} href={`${base}/setari${path}`} aria-current={active === k ? "page" : undefined}>{l}</a>
      ))}
    </nav>
  );
}
