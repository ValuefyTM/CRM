import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { basePath } from "@/lib/site";
import { LoginForm } from "@/components/LoginForm";

export const metadata: Metadata = { title: "Autentificare | Inspecții VALUEFY" };
export const dynamic = "force-dynamic";

export default async function InspLogin({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const base = await basePath("insp");
  const db = await getDb();
  if (db && (await currentUser(db, "insp"))) redirect(base || "/");
  return (
    <main className="inspLogin">
      <link rel="manifest" href={`${base}/manifest.webmanifest`} />
      <header>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-insp-192.png" alt="" width={56} height={56} />
        <span className="inspEyebrow">VALUEFY INSPECȚII</span>
        <h1>Inspecțiile tale, pe telefon.</h1>
        <p>Programări, fișa de inspecție, fotografii și semnătura, și fără semnal.</p>
      </header>
      <section>
        <LoginForm kind="internal" app="insp" base={base} expired={(await searchParams).link === "expired"} />
        <p className="hint">Acces doar pentru inspectorii și evaluatorii VALUEFY.</p>
      </section>
    </main>
  );
}
