// How the work under a framework contract or a collaboration is invoiced: one invoice per delivered report, or one a
// month on the statement (borderou). Invoices and statements are made from it later.
export type Mode = "per_order" | "monthly" | "none";
export const BILLING_PICK: [Mode, string, string][] = [
  ["per_order", "La raport", "o factură pentru fiecare raport predat"],
  ["monthly", "Lunar, pe borderou", "o factură la final de lună cu rapoartele livrate"],
  ["none", "Nu din CRM", "factura se face în afara CRM-ului"],
];
export const billingLabel = (m: string | null | undefined) => BILLING_PICK.find(([k]) => k === m)?.[1] ?? null;
