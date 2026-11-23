/** The deck screen: every card of a deck in a grid, grouped by type; a click shows it large. */
import { useEffect, useState } from 'react';
import type { ImportReport, ImportService } from '../../import/types';
import { CardPrintsDialog } from './CardPrintsDialog';
import { groupEntries, imageOf } from './deck-view-model';

export function DeckScreen({
  name,
  text,
  service,
  onBack,
}: {
  name: string;
  text: string;
  service: ImportService;
  onBack: () => void;
}) {
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

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
                const url = imageOf(card.stored, 'normal');
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
      </div>
      {shown !== undefined && <CardPrintsDialog card={shown} onClose={() => setOpen(null)} />}
    </main>
  );
}
