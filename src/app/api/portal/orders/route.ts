import { NextResponse } from "next/server";
import { audit } from "@/lib/auth";
import { createOrder, portalBanks, validateOrder } from "@/lib/orders";
import { BANKS } from "@/lib/order-labels";
import { sendOrderEmails } from "@/lib/order-emails";
import { err, json, portalApi } from "@/lib/api";

/** New order from the portal wizard (step 4). The documents are uploaded right after, one request per file. */
export async function POST(req: Request) {
  const a = await portalApi();
  if ("res" in a) return a.res;
  const v = validateOrder(await json(req), a.user);
  if (!v.ok) return err(v.error);
  // the bank: one of the CRM's banks (kept with its id), or "Altă bancă" / one of the old names
  let bankId: string | null = null;
  if (v.value.bank) {
    const hit = (await portalBanks(a.db)).find((b) => b.name === v.value.bank);
    if (hit) bankId = hit.id;
    else if (!(BANKS as readonly string[]).includes(v.value.bank)) return err("Alege banca din listă.");
  }
  const o = await createOrder(a.db, a.user, v.value, bankId);
  await audit(a.db, `user:${a.user.id}`, "order.create", "order", o.id, `CO-${o.seq}`);
  await sendOrderEmails(a.user, o.id, o.seq, v.value);
  return NextResponse.json({ ok: true, id: o.id, ref: `CO-${o.seq}` });
}
