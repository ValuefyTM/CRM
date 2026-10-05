import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { basePath } from "@/lib/site";
import { LoginForm } from "@/components/LoginForm";

export const metadata: Metadata = { title: "Autentificare | Portal VALUEFY" };
export const dynamic = "force-dynamic";

const COPY = {
  client: {
    eyebrow: "Portal client",
    pitch: "Evaluarea ta, pas cu pas, într-un singur loc.",
    points: ["Statusul evaluării, de la comandă la raport", "Documentele încărcate o singură dată", "Raportul de evaluare, oricând la îndemână"],
    title: "Intră în contul de client",
    intro: "Pentru clienții VALUEFY. Primești un cod de autentificare pe email.",
    foot: "Nu ai cont? Contul se deschide odată cu prima comandă de evaluare. Scrie-ne la contact@valuefy.ro.",
  },
  partner: {
    eyebrow: "Portal colaboratori",
    pitch: "Comandă evaluări pentru clienții tăi și urmărește-le pe toate.",
    points: ["Comenzi în numele clienților, în câteva minute", "Statusul fiecărui dosar, pe etape", "Raportul ajunge la tine și la clientul tău"],
    title: "Intră în contul de colaborator",
    intro: "Pentru agenți imobiliari, brokeri de credite și alți parteneri VALUEFY. Primești un cod de autentificare pe email.",
    foot: "Nu ai cont? Conturile de colaborator se deschid după un acord de colaborare. Scrie-ne la contact@valuefy.ro.",
  },
};

export default async function PortalLogin({ searchParams }: { searchParams: Promise<{ link?: string; tip?: string }> }) {
  const base = await basePath("portal");
  const db = await getDb();
  if (db && (await currentUser(db, "portal"))) redirect(base || "/");
  const sp = await searchParams;
  const kind = sp.tip === "colaborator" ? "partner" : "client";
  const c = COPY[kind];
  return (
    <div className="authPage">
      <aside className="authSide">
        <span className="brandPill" style={{ position: "relative", alignSelf: "flex-start" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/valuefy-logo.png" alt="VALUEFY" style={{ height: 22, display: "block" }} />
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <span className="eyebrow" style={{ position: "relative", color: "var(--acc-light)" }}>{c.eyebrow}</span>
          <h2>{c.pitch}</h2>
          <ul>{c.points.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
        <p style={{ fontSize: 12 }}>VALUEFY · Firmă autorizată ANEVAR</p>
      </aside>
      <main className="authMain">
        <div className="authBox">
          <nav className="segment" aria-label="Tip cont">
            <a href={`${base}/login`} aria-current={kind === "client" ? "page" : undefined}>Client</a>
            <a href={`${base}/login?tip=colaborator`} aria-current={kind === "partner" ? "page" : undefined}>Colaborator</a>
          </nav>
          <h1>{c.title}</h1>
          <p>{c.intro}</p>
          <LoginForm key={kind} kind={kind} base={base} expired={sp.link === "expired"} />
          <p className="hint">{c.foot}</p>
        </div>
      </main>
    </div>
  );
}
