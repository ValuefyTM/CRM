import type { Metadata, Viewport } from "next";
import "leaflet/dist/leaflet.css";
import "./insp.css";

// The manifest link is added by the page (it depends on the host: inspectii.valuefy.ro or /inspectii elsewhere).
export const metadata: Metadata = {
  title: "Inspecții | VALUEFY",
  applicationName: "Inspecții VALUEFY",
  appleWebApp: { capable: true, title: "Inspecții", statusBarStyle: "black-translucent" },
  icons: { apple: "/icon-insp-apple.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#17173A" };

export default function InspLayout({ children }: { children: React.ReactNode }) {
  return <div className="insp">{children}</div>;
}
