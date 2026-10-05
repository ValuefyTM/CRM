import { NextResponse } from "next/server";
import { audit } from "@/lib/auth";
import { createOrder, validateOrder } from "@/lib/orders";
import { sendOrderEmails } from "@/lib/order-emails";
import { err, json, portalApi } from "@/lib/api";

/** New order from the portal wizard (step 4). The documents are uploaded right after, one request per file. */
export async function POST(req: Request) {
  const a = await portalApi();
  if ("res" in a) return a.res;
  const v = validateOrder(await json(req), a.user);
  if (!v.ok) return err(v.error);
  const o = await createOrder(a.db, a.user, v.value);
  await audit(a.db, `user:${a.user.id}`, "order.create", "order", o.id, `CO-${o.seq}`);
  await sendOrderEmails(a.user, o.id, o.seq, v.value);
  return NextResponse.json({ ok: true, id: o.id, ref: `CO-${o.seq}` });
}
