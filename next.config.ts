import type { NextConfig } from "next";

// One app, two addresses:
//   crm.valuefy.ro/…    → /crm/…     (VALUEFY team)
//   portal.valuefy.ro/… → /portal/…  (clients and partners)
// On any other host (workers.dev, localhost) the /crm and /portal paths are used directly.
// The first segment must not be a shared path; the rest is a repeated param, because OpenNext
// builds the destination per segment (a single ":path(.*)" fails on /utilizatori/123).
const first = ":first((?!(?:api|_next|crm|portal)(?:/|$)|favicon|icon|valuefy-logo)[^/]+)";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", has: [{ type: "host", value: "crm\\..*" }], destination: "/crm" },
        { source: "/", has: [{ type: "host", value: "portal\\..*" }], destination: "/portal" },
        { source: `/${first}/:rest*`, has: [{ type: "host", value: "crm\\..*" }], destination: "/crm/:first/:rest*" },
        { source: `/${first}/:rest*`, has: [{ type: "host", value: "portal\\..*" }], destination: "/portal/:first/:rest*" },
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
