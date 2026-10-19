"use client";
// The first page of a PDF, drawn small with pdf.js once the card comes into view (the cards view of the documents).
import { useEffect, useRef, useState } from "react";

export function PdfThumb({ url, width = 220 }: { url: string; width?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"wait" | "ok" | "error">("wait");
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let off = false;
    const draw = async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const data = await (await fetch(url, { credentials: "include" })).arrayBuffer();
        const pdf = await pdfjs.getDocument({ data }).promise;
        const page = await pdf.getPage(1);
        if (off || !canvas.current) return;
        const base = page.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const vp = page.getViewport({ scale: (width / base.width) * dpr });
        const c = canvas.current;
        c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
        await page.render({ canvas: c, canvasContext: c.getContext("2d")!, viewport: vp }).promise;
        if (!off) setState("ok");
        pdf.destroy();
      } catch { if (!off) setState("error"); }
    };
    // drawn only when visible: a report with many documents does not load them all at once
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { io.disconnect(); draw(); } }, { rootMargin: "200px" });
    io.observe(el);
    return () => { off = true; io.disconnect(); };
  }, [url, width]);
  return (
    <div ref={box} className={`pdfThumb ${state}`}>
      <canvas ref={canvas} aria-hidden="true" />
      {state === "wait" && <span className="muted">Se încarcă…</span>}
      {state === "error" && <span className="muted">PDF</span>}
    </div>
  );
}
