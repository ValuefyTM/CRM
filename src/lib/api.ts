// Server-only helpers for route handlers.
import { NextResponse } from "next/server";
import { getDb } from "./db";
import { currentUser } from "./auth";
import { isAdmin, type Kind, type User } from "./users";

export const err = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** A signed-in team member; `admin` also requires the owner or administrator role. */
export async function staffApi(minRole: "any" | "admin" = "any"): Promise<{ db: D1Database; user: User } | { res: NextResponse }> {
  const db = await getDb();
  if (!db) return { res: err("Baza de date nu este disponibilă.", 503) };
  const user = await currentUser(db, "crm");
  if (!user) return { res: err("Sesiunea a expirat. Autentifică-te din nou.", 401) };
  if (minRole === "admin" && !isAdmin(user)) return { res: err("Nu ai drepturi pentru această acțiune.", 403) };
  return { db, user };
}

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
