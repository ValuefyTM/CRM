import type { NextConfig } from "next";

// One app, two addresses:
//   crm.valuefy.ro/…    → /crm/…     (VALUEFY team)
//   portal.valuefy.ro/… → /portal/…  (clients and partners)
//   inspectii.valuefy.ro/… → /inspectii/…  (inspections app for inspectors and evaluators)
// On any other host (workers.dev, localhost) the /crm, /portal and /inspectii paths are used directly.
// The first segment must not be a shared path; the rest is a repeated param, because OpenNext
// builds the destination per segment (a single ":path(.*)" fails on /utilizatori/123).
const first = ":first((?!(?:api|_next|crm|portal|inspectii|\\.well-known)(?:/|$)|favicon|icon|valuefy-logo)[^/]+)";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  async rewrites() {
    return {
      beforeFiles: [
        // OAuth discovery for the Claude connector (MCP): standard addresses, on every host. Clients may append the
        // resource path (/.well-known/oauth-protected-resource/api/mcp), so anything after the name is accepted.
        { source: "/.well-known/oauth-protected-resource/:rest*", destination: "/api/mcp/meta/resource" },
        { source: "/.well-known/oauth-protected-resource", destination: "/api/mcp/meta/resource" },
        { source: "/.well-known/oauth-authorization-server/:rest*", destination: "/api/mcp/meta/server" },
        { source: "/.well-known/oauth-authorization-server", destination: "/api/mcp/meta/server" },
        { source: "/.well-known/openid-configuration", destination: "/api/mcp/meta/server" },
        { source: "/", has: [{ type: "host", value: "crm\\..*" }], destination: "/crm" },
        { source: "/", has: [{ type: "host", value: "portal\\..*" }], destination: "/portal" },
        { source: "/", has: [{ type: "host", value: "inspectii\\..*" }], destination: "/inspectii" },
        { source: `/${first}/:rest*`, has: [{ type: "host", value: "crm\\..*" }], destination: "/crm/:first/:rest*" },
        { source: `/${first}/:rest*`, has: [{ type: "host", value: "portal\\..*" }], destination: "/portal/:first/:rest*" },
        { source: `/${first}/:rest*`, has: [{ type: "host", value: "inspectii\\..*" }], destination: "/inspectii/:first/:rest*" },
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
