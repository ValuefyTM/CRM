"use client";
// A PDF drawn page by page with pdf.js (phones do not show PDFs inside the app: Android only offers to download them).
// Loaded only when a PDF is opened; once used, the service worker keeps it for use without signal.
import { useEffect, useRef, useState } from "react";

type Pdf = import("pdfjs-dist").PDFDocumentProxy;

async function loadPdf(url: string): Promise<Pdf> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const data = await (await fetch(url, { credentials: "include" })).arrayBuffer();
  return pdfjs.getDocument({ data }).promise;
}

function Page({ pdf, n, width }: { pdf: Pdf; n: number; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let task: { cancel: () => void } | null = null;
    let off = false;
    pdf.getPage(n).then((page) => {
      if (off || !ref.current) return;
      const base = page.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const vp = page.getViewport({ scale: (width / base.width) * dpr });
      const c = ref.current;
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      c.style.width = `${width}px`; c.style.height = `${Math.floor(vp.height / dpr)}px`;
      const t = page.render({ canvas: c, canvasContext: c.getContext("2d")!, viewport: vp });
      task = t;
      t.promise.catch(() => {});
    });
    return () => { off = true; task?.cancel(); };
  }, [pdf, n, width]);
  return <canvas ref={ref} className="iPdfPage" aria-label={`Pagina ${n}`} />;
}

export function PdfPages({ url, zoom }: { url: string; zoom: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<Pdf | null>(null);
  const [error, setError] = useState(false);
  const [w, setW] = useState(0);

  useEffect(() => {
    let off = false;
    setPdf(null); setError(false);
    loadPdf(url).then((d) => { if (!off) setPdf(d); }).catch(() => { if (!off) setError(true); });
    return () => { off = true; };
  }, [url]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const width = Math.max(200, Math.round((w - 16) * zoom));
  return (
    <div ref={box} className="iPdf">
      {error ? <p className="iDocEmpty">Documentul nu a putut fi deschis. Încearcă „Deschide pe tot ecranul”.</p>
        : !pdf ? <p className="iDocEmpty">Se deschide documentul…</p>
        : Array.from({ length: pdf.numPages }, (_, i) => <Page key={i} pdf={pdf} n={i + 1} width={width} />)}
    </div>
  );
}
