"use client";
// All the pages of a PDF, drawn with pdf.js one under another (the preview of a generated annex): the same in every
// browser, the phone's included, where a PDF in a frame shows only its first page or nothing.
import { useEffect, useRef, useState } from "react";
import { pdfDoc, renderPage } from "@/lib/anexa-export";

export function PdfPages({ url, width = 820 }: { url: string; width?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ done: number; total: number } | "error" | null>(null);
  useEffect(() => {
    let off = false;
    const el = box.current;
    if (!el) return;
    el.replaceChildren();
    (async () => {
      try {
        const d = await pdfDoc(url);
        setState({ done: 0, total: d.numPages });
        for (let i = 0; i < d.numPages && !off; i++) {
          const page = await d.getPage(i + 1);
          const base = page.getViewport({ scale: 1 });
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const c = await renderPage(url, i, (width / base.width) * dpr);
          if (off) return;
          c.style.width = "100%"; c.style.height = "auto"; c.setAttribute("aria-label", `Pagina ${i + 1}`);
          el.appendChild(c);
          setState({ done: i + 1, total: d.numPages });
        }
      } catch { if (!off) setState("error"); }
    })();
    return () => { off = true; };
  }, [url, width]);
  return (
    <div className="pdfPages">
      <div ref={box} className="pdfPagesList" style={{ maxWidth: width }} />
      {state === "error" ? <p className="error">PDF-ul nu se poate afișa aici: descarcă-l sau deschide-l într-o filă nouă.</p>
        : !state || state.done < state.total ? <p className="hint">Se încarcă {state ? `pagina ${state.done + 1} din ${state.total}` : "PDF-ul"}…</p> : null}
    </div>
  );
}
