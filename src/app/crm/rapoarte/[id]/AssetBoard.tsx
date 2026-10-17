"use client";
// The assets of a report as cards (each type shows its own details): a click opens the asset page; the one pointed at
// (or focused) shows its inspection on the right.
import { Fragment, useState } from "react";

export type BoardItem = { id: string; href: string; card: React.ReactNode; panel: React.ReactNode };

/** `head` and `foot`: the title with the inspection buttons, and "Adaugă bun", around the list of assets. */
export function AssetBoard({ items, initial, head, foot }: { items: BoardItem[]; initial?: string | null; head?: React.ReactNode; foot?: React.ReactNode }) {
  const [sel, setSel] = useState(items.find((x) => x.id === initial)?.id ?? items[0]?.id ?? null);
  const pick = (id: string) => {
    setSel(id);
    const u = new URL(location.href);
    u.searchParams.set("bun", id);
    history.replaceState(null, "", u);
  };
  const cur = items.find((x) => x.id === sel);
  return (
    <div className="abBox">
    <div className="abWrap">
      <section className="card abList">
      {head}
      <div className="abCards">
        {items.map((x) => (
          <div key={x.id} className={`abCard${x.id === sel ? " on" : ""}`} onMouseEnter={() => { if (x.id !== sel) pick(x.id); }}>
            <a className="abPick" href={x.href} aria-label="Deschide bunul" onFocus={() => pick(x.id)} />
            <Fragment key="card">{x.card}</Fragment>
          </div>
        ))}
      </div>
      {foot}
      </section>
      {cur && <aside className="abPanel" aria-label="Inspecția bunului selectat">{cur.panel}</aside>}
    </div>
    </div>
  );
}
