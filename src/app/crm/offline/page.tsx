import type { Metadata } from "next";
import { Retry } from "./Retry";

export const metadata: Metadata = { title: "Fără conexiune | CRM VALUEFY" };

/** Shown by the service worker instead of a page when there is no signal (kept on the device at install). */
export default function OfflinePage() {
  return (
    <div className="offlinePage">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-crm-192.png" alt="" width={72} height={72} />
      <h1>Fără conexiune</h1>
      <p>CRM-ul are nevoie de internet: datele sunt mereu cele din firmă, nu copii de pe dispozitiv. Când ai din nou semnal, reîncearcă.</p>
      <Retry />
    </div>
  );
}
