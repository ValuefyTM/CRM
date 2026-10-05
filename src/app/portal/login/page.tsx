import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { currentPartner } from "@/lib/auth";
import { basePath } from "@/lib/site";
import { LoginForm } from "@/components/LoginForm";

export const metadata: Metadata = { title: "Autentificare | Portal colaboratori VALUEFY" };
export const dynamic = "force-dynamic";

export default async function PortalLogin({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const base = await basePath("partner");
  const db = await getDb();
  if (db && (await currentPartner(db))) redirect(base || "/");
  return (
    <div className="authPage">
      <aside className="authSide">
        <span className="brandPill" style={{ position: "relative", alignSelf: "flex-start" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/valuefy-logo.png" alt="VALUEFY" style={{ height: 22, display: "block" }} />
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <span className="eyebrow" style={{ position: "relative", color: "var(--acc-light)" }}>Portal colaboratori</span>
          <h2>Comandă evaluări pentru clienții tăi și urmărește-le pe toate.</h2>
          <ul>
            <li>Comenzi în numele clienților, în câteva minute</li>
            <li>Statusul fiecărui dosar, pe etape</li>
            <li>Raportul ajunge la tine și la clientul tău</li>
          </ul>
        </div>
        <p style={{ fontSize: 12 }}>VALUEFY · Firmă autorizată ANEVAR</p>
      </aside>
      <main className="authMain">
        <div className="authBox">
          <h1>Intră în contul de colaborator</h1>
          <p>Pentru agenți imobiliari, brokeri de credite și alți parteneri VALUEFY. Primești un cod de autentificare pe email.</p>
          <LoginForm audience="partner" base={base} expired={(await searchParams).link === "expired"} />
          <p className="hint">Nu ai cont? Conturile de colaborator se deschid după un acord de colaborare. Scrie-ne la contact@valuefy.ro.</p>
        </div>
      </main>
    </div>
  );
}
