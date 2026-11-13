import { getCloudflareContext } from "@opennextjs/cloudflare";

/** The R2 bucket of the market listings (binding MARKET: sources and photos), or null when unavailable. */
export async function marketBucket(): Promise<R2Bucket | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return (env as { MARKET?: R2Bucket }).MARKET ?? null;
  } catch {
    return null;
  }
}

/** Runs a promise after the response (Workers' waitUntil); awaited when there is no request context. */
export async function background(p: Promise<unknown>) {
  try {
    const { ctx } = await getCloudflareContext({ async: true });
    ctx.waitUntil(p);
  } catch {
    await p;
  }
}
