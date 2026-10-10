"use client";

import { useState } from "react";
import { INQUIRY_STATUS } from "@/lib/listing-format";

/** Publish / unpublish a listing straight from the list. */
export function PublishToggle({ id, published }: { id: string; published: boolean }) {
  const [on, setOn] = useState(published);
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button" className={`lstToggle${on ? " on" : ""}`} disabled={busy} aria-pressed={on}
      title={on ? "Vizibil pe site — apasă pentru a-l ascunde" : "Ciornă — apasă pentru a-l publica"}
      onClick={async () => {
        setBusy(true);
        const r = await fetch(`/api/crm/listings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ published: !on }) }).catch(() => null);
        if (r?.ok) setOn(!on);
        setBusy(false);
      }}
    >
      <span />{on ? "Publicat" : "Ciornă"}
    </button>
  );
}

/** Status of a viewing / report request. */
export function InquiryStatus({ id, status, kind }: { id: number; status: string; kind: string }) {
  const [value, setValue] = useState(status);
  const options = kind === "report" ? ["NEW", "SENT", "DONE"] : ["NEW", "DONE"];
  return (
    <select
      className="select" style={{ minWidth: 140 }} value={value} aria-label="Status cerere"
      onChange={async (e) => {
        const v = e.target.value, before = value;
        setValue(v);
        const r = await fetch(`/api/crm/listings/inquiries/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: v }) }).catch(() => null);
        if (!r?.ok) setValue(before);
      }}
    >
      {options.map((o) => <option key={o} value={o}>{INQUIRY_STATUS[o][0]}</option>)}
    </select>
  );
}
