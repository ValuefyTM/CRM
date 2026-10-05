import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { consumeToken } from "@/lib/auth";
import { canSignIn, findUser } from "@/lib/users";
import { basePath } from "@/lib/site";
import { InviteForm } from "./InviteForm";

export const metadata: Metadata = { title: "Activează contul | Portal VALUEFY" };
export const dynamic = "force-dynamic";

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const base = await basePath("portal");
  const token = (await searchParams).token ?? "";
  const db = await getDb();
  // Only check the invitation here; it is used up when the form is submitted.
  const t = db && token ? await consumeToken(db, "portal", "invite", token, false) : null;
  const user = db && t ? await findUser(db, t.kind, t.email) : null;
  const valid = !!user && canSignIn(user);
  const partner = (user?.kind ?? t?.kind) === "partner";

  return (
    <div className="authPage">
      <aside className="authSide">
        <span className="brandPill" style={{ position: "relative", alignSelf: "flex-start" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/valuefy-logo.png" alt="VALUEFY" style={{ height: 22, display: "block" }} />
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <span className="eyebrow" style={{ position: "relative", color: "var(--acc-light)" }}>{partner ? "Portal colaboratori" : "Portal client"}</span>
          <h2>{partner ? "Bine ai venit în rețeaua de colaboratori VALUEFY." : "Bine ai venit la VALUEFY."}</h2>
          <p>Contul tău e aproape gata. Nu ai nevoie de parolă: de fiecare dată primești un cod pe email.</p>
        </div>
        <p style={{ fontSize: 12 }}>VALUEFY · Firmă autorizată ANEVAR</p>
      </aside>
      <main className="authMain">
        <div className="authBox">
          {valid ? (
            <>
              <span className="eyebrow">{partner ? `Invitație · ${user!.partner_name}` : "Cont client"}</span>
              <h1>Activează-ți contul</h1>
              <p>Cont pentru <b>{user!.email}</b>. {partner ? "Completează datele de contact, ca evaluatorii să te poată suna despre comenzi." : "Completează datele de contact, ca evaluatorul să te poată suna pentru inspecție."}</p>
              <InviteForm token={token} base={base} name={user!.name} partner={partner} />
            </>
          ) : (
            <>
              <h1>Invitația nu mai este valabilă</h1>
              <p>Linkul a expirat sau contul a fost deja activat. Dacă ai deja cont, intră cu un cod primit pe email.</p>
              <a href={`${base}/login${partner ? "?tip=colaborator" : ""}`} className="btn btnNavy" style={{ height: 52 }}>Intră în cont</a>
              <p className="hint">Ai nevoie de o invitație nouă? Scrie-ne la contact@valuefy.ro.</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
