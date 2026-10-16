/** Tabs of the settings area (the others than "Date firmă" only for "admin"). */
export function SettingsTabs({ base, active, admin = true }: { base: string; active: "firma" | "facturare" | "claude" | "fise" | "permisiuni"; admin?: boolean }) {
  return (
    <nav className="tabs" aria-label="Setări">
      <a href={`${base}/setari`} aria-current={active === "firma" ? "page" : undefined}>Date firmă</a>
      {admin && <>
        <a href={`${base}/setari/permisiuni`} aria-current={active === "permisiuni" ? "page" : undefined}>Permisiuni</a>
        <a href={`${base}/setari/facturare`} aria-current={active === "facturare" ? "page" : undefined}>Facturare · Oblio</a>
        <a href={`${base}/setari/fise`} aria-current={active === "fise" ? "page" : undefined}>Fișe de inspecție</a>
        <a href={`${base}/setari/import`}>Import Glide</a>
        <a href={`${base}/setari/claude`} aria-current={active === "claude" ? "page" : undefined}>Conexiuni Claude</a>
      </>}
    </nav>
  );
}
