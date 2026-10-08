import { staffApi } from "@/lib/api";
import { testProforma } from "@/lib/billing";

/** End-to-end test with a 1 leu proforma that is deleted right away (no invoice, nothing kept in the CRM). */
export async function POST() {
  const a = await staffApi("admin");
  if ("res" in a) return a.res;
  return Response.json(await testProforma(a.db, a.user.id));
}
