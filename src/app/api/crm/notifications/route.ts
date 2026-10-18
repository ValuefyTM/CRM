import { staffApi } from "@/lib/api";
import { basePath } from "@/lib/site";
import { markSeen, notificationsFor } from "@/lib/notifications";
import { pushSweep } from "@/lib/push";

/** The bell: the user's notifications (GET) and "seen" when the list is opened (POST). */
export async function GET() {
  const a = await staffApi("any");
  if ("res" in a) return a.res;
  // the push dispatcher's safety net: whenever someone has the CRM open, at most once a minute
  pushSweep(a.db);
  return Response.json(await notificationsFor(a.db, a.user, await basePath("crm")));
}

export async function POST() {
  const a = await staffApi("any", true);
  if ("res" in a) return a.res;
  await markSeen(a.db, a.user.id);
  return Response.json({ ok: true });
}
