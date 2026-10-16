"use client";

import { useEffect } from "react";

/**
 * On a phone the CRM tables turn into cards (globals.css): every cell gets the name of its column ("data-label"),
 * read from the header, so the values keep their meaning without the header row. Re-run when the page changes.
 */
export function TableLabels() {
  useEffect(() => {
    const label = () => {
      for (const t of document.querySelectorAll<HTMLTableElement>("table.table")) {
        const heads = [...t.querySelectorAll("thead tr:last-child th")].flatMap((th) => Array(Number(th.getAttribute("colspan") || 1)).fill((th.getAttribute("data-label") ?? th.textContent ?? "").trim()));
        if (!heads.length) continue;
        for (const tr of t.querySelectorAll("tbody tr, tfoot tr")) {
          let i = 0;
          for (const td of tr.children) {
            const l = heads[i] ?? "";
            if (td.getAttribute("data-label") !== l) td.setAttribute("data-label", l);
            i += Number(td.getAttribute("colspan") || 1);
          }
        }
      }
    };
    label();
    // Height of the sticky top bar, for table headers that stay under it while the page scrolls.
    const top = document.querySelector<HTMLElement>(".top");
    const measure = () => { if (top) document.documentElement.style.setProperty("--topH", `${top.offsetHeight}px`); };
    measure();
    const ro = top ? new ResizeObserver(measure) : null;
    if (top && ro) ro.observe(top);
    let t: ReturnType<typeof setTimeout> | null = null;
    const obs = new MutationObserver(() => { if (t) clearTimeout(t); t = setTimeout(label, 100); });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => { obs.disconnect(); ro?.disconnect(); if (t) clearTimeout(t); };
  }, []);
  return null;
}
