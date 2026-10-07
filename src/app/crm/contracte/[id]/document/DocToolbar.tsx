"use client";

/** Toolbar of the contract document (hidden when printing): back, stamp and signature on / off, print or save as PDF. */
export function DocToolbar({ back, self, signed, kind, locked }: { back: string; self: string; signed: boolean; kind: string; locked?: boolean }) {
  return (
    <div className="cdBar">
      <a className="btn btnGhost btnSm" href={back}>← Contract</a>
      <span className="cdBarTitle">Contract de prestări servicii{kind === "framework" ? " · cadru" : ""}</span>
      {!locked && <a className="btn btnGhost btnSm" href={`${back}#termeni`}>Termeni de referință</a>}
      {!locked && <a className="btn btnGhost btnSm" href={signed ? `${self}?semnatura=0` : self}>{signed ? "Fără semnătură și ștampilă" : "Cu semnătură și ștampilă"}</a>}
      <button type="button" className="btn btnGold btnSm" onClick={() => window.print()}>Printează / Salvează PDF</button>
    </div>
  );
}
