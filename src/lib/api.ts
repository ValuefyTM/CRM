// Server-only helpers for route handlers.
import { NextResponse } from "next/server";
import { getDb } from "./db";
import { currentUser } from "./auth";
import { type Kind, type User } from "./users";
import { can, type Perm } from "./perms";
import { reportAccess } from "./perms-db";

export const err = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * A signed-in team member; with a permission, one whose role has it ("admin": Utilizatori, setări… in the matrix).
 * Looking at the CRM as someone else ("Vezi ca…") is read-only: changes are refused (also in worker.ts, for every API).
 */
export async function staffApi(need: "any" | Perm = "any", write = false): Promise<{ db: D1Database; user: User } | { res: NextResponse }> {
  const db = await getDb();
  if (!db) return { res: err("Baza de date nu este disponibilă.", 503) };
  const user = await currentUser(db, "crm");
  if (!user) return { res: err("Sesiunea a expirat. Autentifică-te din nou.", 401) };
  if (need !== "any" && !can(user, need)) return { res: err("Nu ai drepturi pentru această acțiune.", 403) };
  if (write && user.impersonator) return { res: err(READ_ONLY, 403) };
  return { db, user };
}

export const READ_ONLY = "Vezi CRM-ul ca alt utilizator: doar citire. Revino la contul tău ca să faci modificări.";

/** A signed-in partner user or client. */
export async function portalApi(): Promise<{ db: D1Database; user: User } | { res: NextResponse }> {
  const db = await getDb();
  if (!db) return { res: err("Baza de date nu este disponibilă.", 503) };
  const user = await currentUser(db, "portal");
  if (!user) return { res: err("Sesiunea a expirat. Autentifică-te din nou.", 401) };
  return { db, user };
}

export const json = async (req: Request) => ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;

/** App a sign-in form belongs to, when it is not the kind's default (the inspections app). */
export const appParam = (v: unknown) => (v === "insp" ? ("insp" as const) : undefined);

/** Account kind sent by the sign-in forms. */
export const kindParam = (v: unknown): Kind => (v === "internal" || v === "partner" || v === "client" ? v : "client");

/**
 * A report route: the user must see the report ("view"), work on it ("work": documents, assets, inspections) or
 * lead it ("lead": status, team, delivery). See reportAccess in perms-db.ts.
 */
export async function reportApi(id: string, need: "view" | "work" | "lead", write = false) {
  const a = await staffApi("any", write);
  if ("res" in a) return a;
  const report = await a.db.prepare("SELECT id, status, delivered_at FROM reports WHERE id = ?").bind(id).first<{ id: string; status: string; delivered_at: string | null }>();
  if (!report) return { res: err("Raportul nu există.", 404) };
  const access = await reportAccess(a.db, a.user, report);
  if (!access.view) return { res: err("Raportul nu există.", 404) };
  if (!access[need]) return { res: err(need === "lead" ? "Doar evaluatorul principal (sau cine alocă echipa) poate face asta." : "Nu ai drepturi pe acest raport.", 403) };
  return { ...a, report, access };
}
