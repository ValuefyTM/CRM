// Server components: load the signed-in user or send them to the sign-in page.
import { redirect } from "next/navigation";
import { getDb } from "./db";
import { currentUser } from "./auth";
import { basePath } from "./site";
import { syncSiteOrders } from "./site-orders";
import { can, type Perm } from "./perms";

/** A CRM page; with `perm`, only for the users whose role has it (the others go to their dashboard). */
export async function staffPage(perm?: Perm) {
  const base = await basePath("crm");
  const db = await getDb();
  if (!db) throw new Error("Baza de date nu este disponibilă.");
  const user = await currentUser(db, "crm");
  if (!user) redirect(`${base}/login`);
  if (perm && !can(user, perm)) redirect(`${base}/?fara-acces=1`);
  if (!user.impersonator) await syncSiteOrders(db); // website valuation requests → orders
  return { db, user, base };
}

/** Partner users and clients. */
export async function portalPage() {
  const base = await basePath("portal");
  const db = await getDb();
  if (!db) throw new Error("Baza de date nu este disponibilă.");
  const user = await currentUser(db, "portal");
  if (!user) redirect(`${base}/login`);
  return { db, user, base };
}

export const initials = (name: string, email: string) =>
  (name.trim() ? name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("") : email[0]).toUpperCase();

export const fmtDate = (iso: string | null | undefined, withTime = false) =>
  iso ? new Date(iso).toLocaleString("ro-RO", withTime ? { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Bucharest" } : { dateStyle: "medium", timeZone: "Europe/Bucharest" }) : "—";
