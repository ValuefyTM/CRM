// Server-only helpers for route handlers.
import { NextResponse } from "next/server";
import { getDb } from "./db";
import { currentPartner, currentStaff, type PartnerUser, type StaffUser } from "./auth";

export const err = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function staffApi(minRole: "staff" | "admin" = "staff"): Promise<{ db: D1Database; user: StaffUser } | { res: NextResponse }> {
  const db = await getDb();
  if (!db) return { res: err("Baza de date nu este disponibilă.", 503) };
  const user = await currentStaff(db);
  if (!user) return { res: err("Sesiunea a expirat. Autentifică-te din nou.", 401) };
  if (minRole === "admin" && user.role === "staff") return { res: err("Nu ai drepturi pentru această acțiune.", 403) };
  return { db, user };
}

export async function partnerApi(): Promise<{ db: D1Database; user: PartnerUser } | { res: NextResponse }> {
  const db = await getDb();
  if (!db) return { res: err("Baza de date nu este disponibilă.", 503) };
  const user = await currentPartner(db);
  if (!user) return { res: err("Sesiunea a expirat. Autentifică-te din nou.", 401) };
  return { db, user };
}

export const json = async (req: Request) => ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
