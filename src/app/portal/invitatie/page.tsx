import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { consumeToken, findPartnerUser } from "@/lib/auth";
import { basePath } from "@/lib/site";
import { InviteForm } from "./InviteForm";

export const metadata: Metadata = { title: "Activează contul | Portal colaboratori VALUEFY" };
export const dynamic = "force-dynamic";

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const base = await basePath("partner");
  const token = (await searchParams).token ?? "";
  const db = await getDb();
  // Only check the invitation here; it is used up when the form is submitted.
  const email = db && token ? await consumeToken(db, "partner", "invite", token, false) : null;
  const user = db && email ? await findPartnerUser(db, email) : null;
  const valid = !!user && user.status !== "disabled" && user.partner_status === "active";

  return (
    <div className="authPage">
      <aside className="authSide">
        <span className="brandPill" style={{ position: "relative", alignSelf: "flex-start" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/valuefy-logo.png" alt="VALUEFY" style={{ height: 22, display: "block" }} />
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <span className="eyebrow" style={{ position: "relative", color: "var(--acc-light)" }}>Portal colaboratori</span>
          <h2>Bine ai venit în rețeaua de colaboratori VALUEFY.</h2>
          <p>Contul tău e aproape gata. Nu ai nevoie de parolă: de fiecare dată primești un cod pe email.</p>
        </div>
        <p style={{ fontSize: 12 }}>VALUEFY · Firmă autorizată ANEVAR</p>
      </aside>
      <main className="authMain">
        <div className="authBox">
          {valid ? (
            <>
              <span className="eyebrow">Invitație · {user!.partner_name}</span>
              <h1>Activează-ți contul</h1>
              <p>Cont pentru <b>{user!.email}</b>. Completează datele de contact, ca evaluatorii să te poată suna despre comenzi.</p>
              <InviteForm token={token} base={base} name={user!.name} />
            </>
          ) : (
            <>
              <h1>Invitația nu mai este valabilă</h1>
              <p>Linkul a expirat sau contul a fost deja activat. Dacă ai deja cont, intră cu un cod primit pe email.</p>
              <a href={`${base}/login`} className="btn btnNavy" style={{ height: 52 }}>Intră în cont</a>
              <p className="hint">Ai nevoie de o invitație nouă? Scrie-ne la contact@valuefy.ro.</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
