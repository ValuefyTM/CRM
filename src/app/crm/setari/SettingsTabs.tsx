/** Tabs of the settings area. */
export function SettingsTabs({ base, active }: { base: string; active: "firma" | "facturare" }) {
  return (
    <nav className="tabs" aria-label="Setări">
      <a href={`${base}/setari`} aria-current={active === "firma" ? "page" : undefined}>Date firmă</a>
      <a href={`${base}/setari/facturare`} aria-current={active === "facturare" ? "page" : undefined}>Facturare · Oblio</a>
      <a href={`${base}/setari/import`}>Import Glide</a>
    </nav>
  );
}
