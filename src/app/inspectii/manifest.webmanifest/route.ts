import { basePath } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = await basePath("insp");
  return Response.json(
    {
      name: "Inspecții VALUEFY",
      short_name: "Inspecții",
      description: "Programări, fișe de inspecție, fotografii și semnături pentru inspectorii VALUEFY.",
      lang: "ro",
      start_url: base || "/",
      scope: base || "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#17173A",
      theme_color: "#17173A",
      icons: [
        { src: "/icon-insp-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-insp-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icon-insp-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
