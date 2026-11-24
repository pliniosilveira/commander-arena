/** The token section of the deck screen: every token the deck's cards can create, with a picker for the art each is drawn in. */
import { useState } from 'react';
import { useTokenArt } from '../board/token-art';
import { chooseTokenArt, chosenTokenArt } from '../board/token-choices';
import { type CardPrint, printLabel } from './card-prints';
import { Dialog } from './Dialog';
import type { DeckToken } from './deck-tokens';
import { useTokenPrints } from './token-prints';

const describe = (token: DeckToken['definition']): string =>
  [
    token.power !== null && token.toughness !== null && `${token.power}/${token.toughness}`,
    token.name,
  ]
    .filter((part) => typeof part === 'string')
    .join(' ');

function TokenTile({ token, onOpen }: { token: DeckToken; onOpen: () => void }) {
  const url = useTokenArt(token.definition, 'normal');
  return (
    <li>
      <button
        type="button"
        className="deck-card"
        onClick={onOpen}
        aria-label={describe(token.definition)}
      >
        {url === null ? (
          <span className="deck-card-name">{describe(token.definition)}</span>
        ) : (
          <img src={url} alt={describe(token.definition)} loading="lazy" />
        )}
      </button>
    </li>
  );
}

function TokenDialog({
  token,
  onClose,
  onChanged,
}: {
  token: DeckToken;
  onClose: () => void;
  onChanged: () => void;
}) {
  const state = useTokenPrints(token.definition, token.key);
  const prints = state.status === 'ready' ? state.prints : [];
  const art = chosenTokenArt(token.key);
  const current = prints.find((p) => art !== null && p.normal === art.normal);
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = prints.find((p) => p.id === chosen) ?? current;
  const picture = selected?.large ?? art?.normal ?? null;

  const use = (print: CardPrint) => {
    chooseTokenArt(token.key, {
      normal: print.normal,
      ...(print.small === null ? {} : { small: print.small }),
      ...(print.artCrop === null ? {} : { art_crop: print.artCrop }),
    });
    onChanged();
    onClose();
  };

  return (
    <Dialog title={describe(token.definition)} onClose={onClose} wide>
      <div className="deck-prints" data-testid="token-dialog">
        <div className="deck-prints-picture">
          {picture !== null && (
            <img className="deck-card-large" src={picture} alt={describe(token.definition)} />
          )}
          <p className="scr-help">Made by {token.cards.join(', ')}.</p>
          <div className="deck-prints-use">
            <button
              type="button"
              className="scr-btn"
              disabled={selected === undefined || selected.id === current?.id}
              onClick={() => selected !== undefined && use(selected)}
            >
              Use this art
            </button>
            {art !== null && (
              <button
                type="button"
                className="scr-btn"
                onClick={() => {
                  chooseTokenArt(token.key, null);
                  onChanged();
                  onClose();
                }}
              >
                Back to the default
              </button>
            )}
          </div>
        </div>
        <section className="deck-prints-list" aria-label="Token art">
          <h3>Art{state.status === 'ready' && ` (${prints.length})`}</h3>
          {state.status === 'loading' && <p aria-live="polite">Loading the token art…</p>}
          {state.status === 'ready' && prints.length === 0 && (
            <p className="scr-help">The other art of this token could not be loaded.</p>
          )}
          {prints.length > 0 && (
            <fieldset className="deck-prints-items">
              <legend className="deck-prints-legend">Choose the art</legend>
              {prints.map((print) => {
                const on = print.id === selected?.id;
                return (
                  <label key={print.id} className={on ? 'deck-print deck-print-on' : 'deck-print'}>
                    <input
                      type="radio"
                      name="token-print"
                      className="deck-print-input"
                      checked={on}
                      onChange={() => setChosen(print.id)}
                    />
                    <span className="deck-print-name">{printLabel(print)}</span>
                    <span className="deck-print-meta">
                      {print.setCode} · {print.released.slice(0, 4)}
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

export function TokenSection({ tokens }: { tokens: readonly DeckToken[] }) {
  const [open, setOpen] = useState<string | null>(null);
  // The choices live outside React state; this re-renders the tiles when one changes.
  const [, setTick] = useState(0);
  if (tokens.length === 0) return null;
  const shown = tokens.find((t) => t.key === open);
  return (
    <section className="imp-section" aria-label="Tokens" data-testid="deck-tokens">
      <h2>
        Tokens <span className="scr-help">({tokens.length})</span>
      </h2>
      <ul className="deck-grid">
        {tokens.map((token) => (
          <TokenTile key={token.key} token={token} onOpen={() => setOpen(token.key)} />
        ))}
      </ul>
      {shown !== undefined && (
        <TokenDialog
          token={shown}
          onClose={() => setOpen(null)}
          onChanged={() => setTick((n) => n + 1)}
        />
      )}
    </section>
  );
}
