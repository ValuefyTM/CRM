import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requestSignIn } from "@/lib/auth";
import { validEmail } from "@/lib/crypto";
import { err, json, kindParam } from "@/lib/api";

/** Step 1 of sign-in: email → code + link by email. Same answer whether or not the account exists. */
export async function POST(req: Request) {
  const b = await json(req);
  const email = typeof b.email === "string" ? b.email : "";
  if (!validEmail(email)) return err("Introdu o adresă de email validă.");
  const db = await getDb();
  if (!db) return err("Serviciul nu este disponibil momentan.", 503);
  await requestSignIn(db, kindParam(b.kind), email);
  return NextResponse.json({ ok: true });
}
