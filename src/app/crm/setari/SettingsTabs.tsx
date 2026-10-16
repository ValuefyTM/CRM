import { can, type WithPerms } from "@/lib/perms";

/** Tabs of Setări (one item in the menu): each one only for those who may open it. */
export function SettingsTabs({ base, active, user }: { base: string; active: "firma" | "facturare" | "claude" | "fise" | "permisiuni" | "import"; user: WithPerms }) {
  const tabs: [string, string, string, boolean][] = [
    ["firma", "Date firmă", "", true],
    ["permisiuni", "Permisiuni", "/permisiuni", can(user, "users")],
    ["fise", "Fișe de inspecție", "/fise", can(user, "templates")],
    ["facturare", "Facturare · Oblio", "/facturare", can(user, "billing")],
    ["claude", "Conexiuni Claude", "/claude", can(user, "settings")],
    ["import", "Import Glide", "/import", user.role === "owner"],
  ];
  return (
    <nav className="tabs" aria-label="Setări">
      {tabs.filter(([, , , ok]) => ok).map(([k, l, path]) => (
        <a key={k} href={`${base}/setari${path}`} aria-current={active === k ? "page" : undefined}>{l}</a>
      ))}
    </nav>
  );
}
