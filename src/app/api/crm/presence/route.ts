import { staffApi } from "@/lib/api";

/** Heartbeat of an open CRM tab: signing the request in is what records the user as online. */
export async function POST() {
  const a = await staffApi();
  if ("res" in a) return a.res;
  return new Response(null, { status: 204 });
}
