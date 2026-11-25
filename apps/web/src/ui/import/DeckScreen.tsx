/** The deck screen: every card of a deck in a grid, grouped by type; a click shows it large. */

import { frontFaceName, type StoredCard } from '@commander-arena/cards';
import { useEffect, useMemo, useState } from 'react';
import type { ImportReport, ImportService } from '../../import/types';
import { CardPrintsDialog } from './CardPrintsDialog';
import { type CardPrint, listedKey, useListedImages } from './card-prints';
import { printingInText, printingsInText, withPrinting } from './deck-text';
import { deckTokens } from './deck-tokens';
import { groupEntries, imageOf } from './deck-view-model';
import { TokenSection } from './TokenSection';

export function DeckScreen({
  name,
  text,
  service,
  onBack,
  onSave,
  onSaveAll,
}: {
  name: string;
  text: string;
  service: ImportService;
  onBack: () => void;
  /** Stores the deck's new text (a printing was chosen); absent when this deck cannot be changed. */
  onSave?: (text: string) => Promise<void>;
  /** Applies a printing to every saved deck of the player and remembers it for decks imported later; absent when not offered. */
  onSaveAll?: (cardName: string, print: CardPrint) => Promise<void>;
}) {
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  // The deck's text as last saved, and the printings chosen in this visit (the grid shows them at once).
  const [current, setCurrent] = useState(text);
  const [picked, setPicked] = useState<ReadonlyMap<string, CardPrint>>(new Map());

  useEffect(() => {
    let live = true;
    service.run({ text, deckName: name }).then(
      (r) => live && setReport(r),
      (e) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, [service, text, name]);

  const listed = printingsInText(current);
  const images = useListedImages(
    report !== null
      ? report.entries.flatMap(({ card }) => {
          const printing = listed.get(frontFaceName(card.stored.name).toLowerCase());
          return printing === undefined ? [] : [printing];
        })
      : [],
  );
  /** The picture of a card in the grid: the printing chosen in this visit, then the listed one, then the default. */
  const gridImage = (card: StoredCard): string | null => {
    const printing = listed.get(frontFaceName(card.name).toLowerCase());
    const image = printing === undefined ? undefined : images.get(listedKey(printing));
    // A list that names the printing of another card must not draw that card.
    const own =
      image !== undefined &&
      frontFaceName(image.name).toLowerCase() === frontFaceName(card.name).toLowerCase();
    return (
      picked.get(card.oracleId)?.normal ?? (own ? image.normal : null) ?? imageOf(card, 'normal')
    );
  };

  const writePrint = async (card: StoredCard, print: CardPrint) => {
    if (onSave === undefined) return;
    const next = withPrinting(current, card.name, print.setCode.toLowerCase(), print.collector);
    if (next === null) throw new Error('This card’s line in the list cannot hold a printing.');
    await onSave(next);
    setCurrent(next);
    setPicked((now) => new Map(now).set(card.oracleId, print));
  };

  const tokens = useMemo(() => (report === null ? [] : deckTokens(report.entries)), [report]);
  const groups = report === null ? [] : groupEntries(report.entries);
  const shown = report?.entries.find((e) => e.card.stored.oracleId === open)?.card.stored;

  return (
    <main className="imp-screen" data-testid="deck-screen">
      <header className="imp-head">
        <button type="button" className="scr-btn" onClick={onBack}>
          Back to my decks
        </button>
        <h1>{name}</h1>
      </header>
      <div className="imp-body">
        {error !== null && (
          <p role="alert" className="imp-alert">
            The deck could not be loaded: {error}
          </p>
        )}
        {error === null && report === null && <p aria-live="polite">Loading the deck…</p>}
        {groups.map(({ group, entries, count }) => (
          <section key={group} className="imp-section" aria-label={group}>
            <h2>
              {group} <span className="scr-help">({count})</span>
            </h2>
            <ul className="deck-grid">
              {entries.map(({ card, count: copies }) => {
                const url = gridImage(card.stored);
                return (
                  <li key={card.stored.oracleId}>
                    <button
                      type="button"
                      className="deck-card"
                      onClick={() => setOpen(card.stored.oracleId)}
                    >
                      {url === null ? (
                        <span className="deck-card-name">{card.stored.name}</span>
                      ) : (
                        <img src={url} alt={card.stored.name} loading="lazy" />
                      )}
                      {copies > 1 && <span className="deck-card-count">×{copies}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <TokenSection tokens={tokens} />
      </div>
      {shown !== undefined && (
        <CardPrintsDialog
          card={shown}
          listed={printingInText(current, shown.name)}
          onClose={() => setOpen(null)}
          {...(onSave === undefined
            ? {}
            : {
                onUse: (print: CardPrint) => writePrint(shown, print),
                ...(onSaveAll === undefined
                  ? {}
                  : {
                      onUseForAll: async (print: CardPrint) => {
                        await writePrint(shown, print);
                        await onSaveAll(shown.name, print);
                      },
                    }),
              })}
        />
      )}
    </main>
  );
}
