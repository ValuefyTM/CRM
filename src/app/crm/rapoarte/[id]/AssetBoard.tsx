"use client";
// The assets of a report: one card per asset, in two parts — the asset itself (a click opens its page) and, inside the
// same card, its inspection (state, inspector, when, the sheet to open, the actions).
export type BoardItem = { id: string; href: string; card: React.ReactNode; panel: React.ReactNode };

/** `head` and `foot`: the title with the inspection buttons, and "Adaugă bun", around the list of assets. */
export function AssetBoard({ items, initial, head, foot }: { items: BoardItem[]; initial?: string | null; head?: React.ReactNode; foot?: React.ReactNode }) {
  return (
    <section className="card abList">
      {head}
      <div className="abCards">
        {items.map((x) => (
          <article key={x.id} id={`bun-${x.id}`} className={`abCard${x.id === initial ? " on" : ""}`}>
            <div className="abTop">
              <a className="abPick" href={x.href} aria-label="Deschide bunul" />
              {x.card}
            </div>
            <div className="abInsp">{x.panel}</div>
          </article>
        ))}
      </div>
      {foot}
    </section>
  );
}
