import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { currentStaff } from "@/lib/auth";
import { basePath } from "@/lib/site";
import { LoginForm } from "@/components/LoginForm";

export const metadata: Metadata = { title: "Autentificare CRM | VALUEFY" };
export const dynamic = "force-dynamic";

export default async function CrmLogin({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const base = await basePath("staff");
  const db = await getDb();
  if (db && (await currentStaff(db))) redirect(base || "/");
  return (
    <div className="authPage">
      <aside className="authSide">
        <span className="brandPill" style={{ position: "relative", alignSelf: "flex-start" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/valuefy-logo.png" alt="VALUEFY" style={{ height: 22, display: "block" }} />
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <span className="eyebrow" style={{ position: "relative", color: "var(--acc-light)" }}>CRM VALUEFY</span>
          <h2>Colaboratori, comenzi și evaluatori, într-un singur loc.</h2>
          <p>Acces doar pentru echipa VALUEFY.</p>
        </div>
        <p style={{ fontSize: 12 }}>Firmă autorizată ANEVAR</p>
      </aside>
      <main className="authMain">
        <div className="authBox">
          <h1>Intră în CRM</h1>
          <p>Introdu adresa de email a contului tău din echipa VALUEFY.</p>
          <LoginForm audience="staff" base={base} expired={(await searchParams).link === "expired"} />
        </div>
      </main>
    </div>
  );
}
