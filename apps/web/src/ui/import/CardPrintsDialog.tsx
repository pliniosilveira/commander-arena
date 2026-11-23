/** The card dialog of the deck screen: the picture on the left, every printing of the card on the right to choose from. */
import type { StoredCard } from '@commander-arena/cards';
import { useState } from 'react';
import { type CardPrint, printLabel, useCardPrints } from './card-prints';
import { Dialog } from './Dialog';
import { imageOf } from './deck-view-model';

const withoutQuery = (url: string | null): string | null => url?.split('?')[0] ?? null;

export function CardPrintsDialog({
  card,
  listed,
  onUse,
  onClose,
}: {
  card: StoredCard;
  /** The printing the deck's text lists for this card, when it lists one. */
  listed: { readonly set: string; readonly collector: string } | null;
  /** Writes the printing into the deck; rejects with the reason when it cannot. */
  onUse?: (print: CardPrint) => Promise<void>;
  onClose: () => void;
}) {
  const state = useCardPrints(card.name);
  const [chosen, setChosen] = useState<string | null>(null);
  const [saving, setSaving] = useState<'idle' | 'busy' | string>('idle');
  const prints = state.status === 'ready' ? state.prints : [];

  const own = withoutQuery(imageOf(card, 'large'));
  const current: CardPrint | undefined =
    listed === null
      ? prints.find((p) => own !== null && withoutQuery(p.large) === own)
      : prints.find(
          (p) =>
            p.setCode.toLowerCase() === listed.set.toLowerCase() &&
            p.collector === listed.collector,
        );
  const selected: CardPrint | undefined = prints.find((p) => p.id === chosen) ?? current;
  const canUse = onUse !== undefined && selected !== undefined && selected.id !== current?.id;
  const use = () => {
    if (onUse === undefined || selected === undefined) return;
    setSaving('busy');
    onUse(selected).then(
      // Saved: the dialog has done its job.
      onClose,
      (e) => setSaving(e instanceof Error ? e.message : String(e)),
    );
  };
  // A built-in deck is only looked at: its printings are not offered (`onUse` absent).
  const selectable = onUse !== undefined;
  const picture = selected?.large ?? imageOf(card, 'large');

  return (
    <Dialog title={card.name} onClose={onClose} wide>
      <div
        className={selectable ? 'deck-prints' : 'deck-prints deck-prints-single'}
        data-testid="card-dialog"
      >
        <div className="deck-prints-picture">
          {picture === null ? (
            <p>{card.faces.map((f) => `${f.name}: ${f.oracleText}`).join('\n')}</p>
          ) : (
            <img className="deck-card-large" src={picture} alt={card.name} />
          )}
          {onUse !== undefined && (
            <div className="deck-prints-use">
              <button
                type="button"
                className="scr-btn"
                disabled={!canUse || saving === 'busy'}
                onClick={use}
              >
                Use in this deck
              </button>
              {saving !== 'idle' && saving !== 'busy' && (
                <span role="alert" className="imp-alert">
                  {saving}
                </span>
              )}
            </div>
          )}
        </div>
        {selectable && (
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
                    <label
                      key={print.id}
                      className={on ? 'deck-print deck-print-on' : 'deck-print'}
                    >
                      <input
                        type="radio"
                        name="card-print"
                        className="deck-print-input"
                        checked={on}
                        onChange={() => {
                          setChosen(print.id);
                          setSaving('idle');
                        }}
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
        )}
      </div>
    </Dialog>
  );
}
