import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb, now } from "@/lib/db";
import { audit } from "@/lib/auth";
import { contractDoc, signedSnapshot } from "@/lib/contract-doc";
import { billingMissing, contractByToken, isCompany } from "@/lib/contract-sign";
import { getFirmWithImages } from "@/lib/settings";
import { ContractDocView } from "@/components/ContractDoc";
import { PrintButton } from "@/components/OfferAccept";
import { BillingForm, ContractSignForm } from "./ContractSign";

export const metadata: Metadata = { title: "Contract de prestări servicii | VALUEFY", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/** Public: the client completes the billing details, reads and signs the contract (link sent by email). */
export default async function ContractSignPage({ params }: { params: Promise<{ token: string }> }) {
  const db = await getDb();
  if (!db) throw new Error("Baza de date nu este disponibilă.");
  const token = (await params).token;
  const k = await contractByToken(db, token);
  if (!k || k.kind !== "classic") notFound();
  if (!k.signed_at && !k.sign_viewed_at) {
    await db.prepare("UPDATE contracts SET sign_viewed_at = ? WHERE id = ? AND sign_viewed_at IS NULL").bind(now(), k.id).run();
    await audit(db, "client:contract", "contract.viewed", "contract", k.id, k.number ?? "");
  }
  const snap = k.signed_at ? await signedSnapshot(db, k.id) : null;
  const [d, firm] = snap ? [snap.doc, snap.firm] : await Promise.all([contractDoc(db, k.id), getFirmWithImages(db)]);
  if (!d) notFound();
  const missing = snap ? [] : billingMissing(d);
  const c = d.contract;
  const company = isCompany(c.client_kind, c.client);

  return (
    <div className="ofPage">
      <header className="ofBar no-print">
        <div className="ofBarIn">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/valuefy-logo.png" alt="VALUEFY" className="ofLogo" />
          <div className="ofBarRight">
            <span className={`ofPill ${snap ? "ok" : ""}`}><i />{snap ? "Semnat" : missing.length ? "Date de completat" : "De semnat"}</span>
            <PrintButton />
          </div>
        </div>
      </header>
      <main className="ofMain csMain">
        <section className="ofHero no-print">
          <div className="ofHeroText">
            <p className="ofEyebrow">Contract de prestări servicii · nr. {c.number}</p>
            <h1>{snap ? "Contractul este semnat de ambele părți." : missing.length ? "Mai avem nevoie de datele de facturare." : "Contractul este gata de semnat."}</h1>
            <p>{snap ? <>Semnat de <b>{snap.sig.name}</b> la {new Date(snap.sig.at).toLocaleString("ro-RO", { timeZone: "Europe/Bucharest" })}. Îl poți descărca oricând ca PDF, cu butonul de sus.</>
              : missing.length ? <>Contractul are nevoie de: <b>{missing.join(", ")}</b>. Completează-le mai jos; apoi vei vedea contractul complet și îl vei putea semna.</>
              : <>Citește contractul de mai jos (condițiile generale, termenii de referință ai evaluării și condițiile financiare), apoi semnează la final.</>}</p>
          </div>
        </section>
        {missing.length > 0 ? (
          <BillingForm token={token} company={company} initial={{ address: c.billing_address ?? "", city: c.city ?? "", county: c.county ?? "", cui: c.cui ?? "", reg_no: c.reg_no ?? "",
            rep: (c.rep ?? "").split(" / ")[0], rep_role: (c.rep ?? "").split(" / ")[1] ?? "" }} name={c.client ?? ""} />
        ) : (
          <>
            <div className="csDoc"><ContractDocView d={d} firm={firm} sealed clientSig={snap?.sig ?? null} /></div>
            {!snap && <ContractSignForm token={token} number={c.number ?? ""} defaultName={company ? (c.rep ?? "").split(" / ")[0] : c.client ?? ""} />}
          </>
        )}
      </main>
    </div>
  );
}
