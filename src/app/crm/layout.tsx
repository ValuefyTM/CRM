import type { Metadata, Viewport } from "next";
import { basePath } from "@/lib/site";

// The CRM is installable (PWA): its manifest depends on the host (crm.valuefy.ro, or /crm elsewhere).
export async function generateMetadata(): Promise<Metadata> {
  const base = await basePath("crm");
  return {
    applicationName: "CRM VALUEFY",
    manifest: `${base}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: "CRM VALUEFY", statusBarStyle: "black-translucent" },
    icons: { apple: "/icon-crm-apple.png" },
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#111111" };

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return children;
}
