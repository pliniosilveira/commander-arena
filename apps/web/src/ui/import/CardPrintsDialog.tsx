/** The card dialog of the deck screen: the picture on the left, every printing of the card on the right to choose from. */
import type { StoredCard } from '@commander-arena/cards';
import { useState } from 'react';
import { type CardPrint, printLabel, useCardPrints } from './card-prints';
import { Dialog } from './Dialog';
import { imageOf } from './deck-view-model';

const withoutQuery = (url: string | null): string | null => url?.split('?')[0] ?? null;

export function CardPrintsDialog({ card, onClose }: { card: StoredCard; onClose: () => void }) {
  const state = useCardPrints(card.name);
  const [chosen, setChosen] = useState<string | null>(null);
  const prints = state.status === 'ready' ? state.prints : [];

  const own = withoutQuery(imageOf(card, 'large'));
  const selected: CardPrint | undefined =
    prints.find((p) => p.id === chosen) ??
    prints.find((p) => own !== null && withoutQuery(p.large) === own);
  const picture = selected?.large ?? imageOf(card, 'large');

  return (
    <Dialog title={card.name} onClose={onClose} wide>
      <div className="deck-prints" data-testid="card-dialog">
        <div className="deck-prints-picture">
          {picture === null ? (
            <p>{card.faces.map((f) => `${f.name}: ${f.oracleText}`).join('\n')}</p>
          ) : (
            <img className="deck-card-large" src={picture} alt={card.name} />
          )}
        </div>
        <section className="deck-prints-list" aria-label="Printings">
          <h3>Printings{state.status === 'ready' && ` (${prints.length})`}</h3>
          {state.status === 'loading' && <p aria-live="polite">Loading the printings…</p>}
          {state.status === 'ready' && prints.length === 0 && (
            <p className="scr-help">The other printings could not be loaded.</p>
          )}
          {prints.length > 0 && (
            <fieldset className="deck-prints-items">
              <legend className="deck-prints-legend">Choose a printing</legend>
              {prints.map((print) => {
                const on = print.id === selected?.id;
                return (
                  <label key={print.id} className={on ? 'deck-print deck-print-on' : 'deck-print'}>
                    <input
                      type="radio"
                      name="card-print"
                      className="deck-print-input"
                      checked={on}
                      onChange={() => setChosen(print.id)}
                    />
                    <span className="deck-print-name">{printLabel(print)}</span>
                    <span className="deck-print-meta">
                      {print.setCode} · {print.released.slice(0, 4)} · {print.rarity}
                      {print.foilOnly && ' · foil only'}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          )}
        </section>
      </div>
    </Dialog>
  );
}
