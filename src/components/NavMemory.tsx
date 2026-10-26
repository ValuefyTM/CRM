"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Lists keep their filters in the address (?county=…&tip=…). The way back from a detail page goes to the list as it
// was left, not to the bare list: each page's last address (with its filters) is kept for the tab's session.
const KEY = (path: string) => `vf-last:${path}`;

function Remember() {
  // the hooks only say when the address changed; the address itself is read from the browser (as the user sees it,
  // also where a subdomain hides the /crm prefix)
  const route = usePathname();
  const params = useSearchParams().toString();
  useEffect(() => {
    const { pathname, search } = window.location;
    try {
      if (search.length > 1) sessionStorage.setItem(KEY(pathname), pathname + search);
      else sessionStorage.removeItem(KEY(pathname));
    } catch { /* storage off: the plain list */ }
  }, [route, params]);
  return null;
}

/** Remembers the current page's address with its filters (mounted once in the layout). */
export function NavMemory() {
  return <Suspense fallback={null}><Remember /></Suspense>;
}

/** "← List": to the list as it was left (its filters, page, view), else the plain address. */
export function BackLink({ href, label }: { href: string; label: string }) {
  const [to, setTo] = useState(href);
  useEffect(() => {
    if (href.includes("?")) return;
    try { setTo(sessionStorage.getItem(KEY(href)) ?? href); } catch { /* storage off */ }
  }, [href]);
  return <a className="topBack" href={to} title={`Înapoi la ${label}`}><span aria-hidden="true">←</span><span>{label}</span></a>;
}
