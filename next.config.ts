import type { NextConfig } from "next";

// One app, two addresses:
//   crm.valuefy.ro/…    → /crm/…     (VALUEFY team)
//   portal.valuefy.ro/… → /portal/…  (partners)
// On any other host (workers.dev, localhost) the /crm and /portal paths are used directly.
const ownPaths = "(?!api|_next|crm|portal|favicon|icon|valuefy-logo).*";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", has: [{ type: "host", value: "crm\\..*" }], destination: "/crm" },
        { source: "/", has: [{ type: "host", value: "portal\\..*" }], destination: "/portal" },
        { source: `/:path(${ownPaths})`, has: [{ type: "host", value: "crm\\..*" }], destination: "/crm/:path" },
        { source: `/:path(${ownPaths})`, has: [{ type: "host", value: "portal\\..*" }], destination: "/portal/:path" },
      ],
    };
  },
  // Private applications: never indexed.
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
};

export default nextConfig;

import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
