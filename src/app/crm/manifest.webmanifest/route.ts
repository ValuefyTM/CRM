import { basePath } from "@/lib/site";

export const dynamic = "force-dynamic";

/** The CRM as an installable app: name, icons, start page and shortcuts (the paths depend on the host). */
export async function GET() {
  const base = await basePath("crm");
  const at = (p: string) => `${base}${p}` || "/";
  return Response.json(
    {
      id: at("/"),
      name: "CRM VALUEFY",
      short_name: "CRM",
      description: "Clienți, comenzi, rapoarte de evaluare, inspecții și proprietăți: CRM-ul echipei VALUEFY.",
      lang: "ro",
      start_url: at("/"),
      scope: at("/"),
      display: "standalone",
      display_override: ["window-controls-overlay", "standalone"],
      orientation: "any",
      background_color: "#111111",
      theme_color: "#111111",
      categories: ["business", "productivity"],
      icons: [
        { src: "/icon-crm-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-crm-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icon-crm-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
      shortcuts: [
        { name: "Rapoarte", url: at("/rapoarte"), icons: [{ src: "/icon-crm-192.png", sizes: "192x192" }] },
        { name: "Inspecții", url: at("/agenda-inspectii"), icons: [{ src: "/icon-crm-192.png", sizes: "192x192" }] },
        { name: "Comenzi", url: at("/comenzi"), icons: [{ src: "/icon-crm-192.png", sizes: "192x192" }] },
        { name: "Proprietăți", url: at("/proprietati"), icons: [{ src: "/icon-crm-192.png", sizes: "192x192" }] },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-cache" } },
  );
}
