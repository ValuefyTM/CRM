// Server components: load the signed-in user or send them to the sign-in page.
import { redirect } from "next/navigation";
import { getDb } from "./db";
import { currentPartner, currentStaff } from "./auth";
import { basePath } from "./site";

export async function staffPage() {
  const base = await basePath("staff");
  const db = await getDb();
  if (!db) throw new Error("Baza de date nu este disponibilă.");
  const user = await currentStaff(db);
  if (!user) redirect(`${base}/login`);
  return { db, user, base };
}

export async function partnerPage() {
  const base = await basePath("partner");
  const db = await getDb();
  if (!db) throw new Error("Baza de date nu este disponibilă.");
  const user = await currentPartner(db);
  if (!user) redirect(`${base}/login`);
  return { db, user, base };
}

export const initials = (name: string, email: string) =>
  (name.trim() ? name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("") : email[0]).toUpperCase();

export const fmtDate = (iso: string | null | undefined, withTime = false) =>
  iso ? new Date(iso).toLocaleString("ro-RO", withTime ? { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Bucharest" } : { dateStyle: "medium", timeZone: "Europe/Bucharest" }) : "—";
