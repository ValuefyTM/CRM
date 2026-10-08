import type { Metadata } from "next";
import { staffPage } from "@/lib/guard";
import { isAdmin } from "@/lib/users";
import { history } from "@/lib/history";
import { FIRM_FIELDS, getFirmWithImages } from "@/lib/settings";
import { CrmShell } from "@/components/CrmShell";
import { History } from "@/components/History";
import { FirmForm, FirmImage } from "./FirmForm";
import { SettingsTabs } from "./SettingsTabs";

export const metadata: Metadata = { title: "Setări | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** Firm settings: VALUEFY's details, stamp and signature as they appear on contracts. */
export default async function SettingsPage() {
  const { db, user, base } = await staffPage();
  const [firm, log] = await Promise.all([getFirmWithImages(db), history(db, ["firm"])]);
  const edit = isAdmin(user);
  const values = Object.fromEntries(FIRM_FIELDS.map(([k]) => [k, firm[k]])) as Record<string, string>;
  return (
    <CrmShell user={user} base={base} active="settings" title="Setări" subtitle="Datele VALUEFY de pe contracte: firmă, reprezentant, cont bancar, ștampilă și semnătură">
      <SettingsTabs base={base} active="firma" />
      {!edit && <div className="note">Doar proprietarul și administratorii pot modifica aceste date.</div>}
      <div className="cols">
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <section className="card">
            <div className="cardHead"><h2>Date firmă</h2><span className="muted">apar în toate contractele generate</span></div>
            <FirmForm fields={FIRM_FIELDS.map(([k, l, h]) => [k, l, h ?? ""])} values={values} edit={edit} />
          </section>
          <section className="card">
            <div className="cardHead"><h2>Ștampilă și semnătură</h2><span className="muted">pe contract, la „Evaluator”</span></div>
            <p className="hint">Imagine PNG cu fundal transparent, cel mult 300 KB. Sunt folosite doar în contractele generate din CRM, nu sunt publice.</p>
            <div className="stImgs">
              <FirmImage which="stamp" label="Ștampila" src={firm.stamp} custom={firm.stampCustom} edit={edit} />
              <FirmImage which="signature" label={`Semnătura (${firm.rep})`} src={firm.signature} custom={firm.signatureCustom} edit={edit} />
            </div>
          </section>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <section className="card">
            <h2>Previzualizare</h2>
            <div className="stPreview">
              <b>{firm.name}</b>
              <span>Sediul social: {firm.address}</span>
              <span>CUI: {firm.cui} · {firm.reg}</span>
              <span>IBAN: {firm.iban}</span>
              <span>Reprezentant: {firm.rep}, {firm.repRole}</span>
              <span>Membru corporativ ANEVAR nr. {firm.anevar}</span>
              <span>Litigii: instanțele din {firm.court}</span>
            </div>
          </section>
          <History log={log} />
        </div>
      </div>
    </CrmShell>
  );
}
