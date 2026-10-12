"use client";

/** Toolbar of the inspection sheet document (hidden when printing): back to the report, print or save as PDF. */
export function SheetToolbar({ back }: { back: string }) {
  return (
    <div className="cdBar">
      <a className="btn btnGhost btnSm" href={back}>← Raport</a>
      <span className="cdBarTitle">Fișa de inspecție</span>
      <button type="button" className="btn btnGold btnSm" onClick={() => window.print()}>Printează / Salvează PDF</button>
    </div>
  );
}
