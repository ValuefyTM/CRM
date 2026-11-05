import { err, json, staffApi } from "@/lib/api";
import { ingestEmail } from "@/lib/mail-rules";
import { pushLater } from "@/lib/push";

/** An email pasted in the CRM (subject + text): kept in Emailuri primite and run through the rules, like the intake address. */
export async function POST(req: Request) {
  const a = await staffApi("orders.A", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const text = typeof b.text === "string" ? b.text.slice(0, 20000) : "";
  if (text.trim().length < 20) return err("Lipește textul emailului (subiect și conținut).");
  const r = await ingestEmail(a.db, { subject: typeof b.subject === "string" ? b.subject : null, text, from: null }, "paste", a.user.id);
  if (r.status === "unmatched") return Response.json({ ok: true, status: r.status, email: r.emailId });
  if (r.status === "task") pushLater(a.db);
  return Response.json({ ok: true, status: r.status, email: r.emailId, task: r.taskId, order: r.orderId, report: r.reportId ?? null, ref: r.fields?.ref, client: r.fields?.client, rule: r.rule?.name });
}
