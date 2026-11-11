import type { ChoosePayOptionsDecision, GameView } from '@commander-arena/engine';
import { useEffect, useRef } from 'react';
import { BarButtons } from './BarButtons';
import { Dialog } from './Dialog';
import { objectIndex } from './lookup';
import { MiniCard } from './MiniCard';
import type { DecisionModel } from './model';
import { candidateColors, MECHANISM_NAMES, payLine, sameSet, togglePick } from './pay-options';
import type { UiState } from './ui-state';

type Update = (change: (ui: UiState) => UiState) => void;

/**
 * The modal of the `choosePayOptions` question (CR 601.2f-h, D-120): "Convoke: tap creatures to pay for X
 * ({3}{G}{G})". The candidates are cards (the creatures or artifacts to tap, the cards of the graveyard to
 * exile) the player picks; the engine's suggested set starts picked and can be edited. A live line says
 * what the picks pay and what is left for mana. Confirm is enabled for the answers the engine lists (the
 * engine refuses the rest: they would leave a cost nothing can pay), "Pay all in mana" picks none, and
 * Cancel (Esc) rewinds the whole cast (CR 733). The autopilot never answers it.
 */
export function PayOptionsDialog({
  d,
  view,
  ui,
  model,
  update,
}: {
  d: ChoosePayOptionsDecision;
  view: GameView;
  ui: UiState;
  model: DecisionModel;
  update: Update;
}) {
  // A cast taken back and started again asks the same question again (same id), and the layer's state may
  // still hold the picks of the first time: the dialog starts with the engine's suggestion.
  const latest = useRef({ update, suggested: d.suggested });
  latest.current = { update, suggested: d.suggested };
  useEffect(
    () => latest.current.update((u) => ({ ...u, payOptions: latest.current.suggested })),
    [],
  );

  const index = objectIndex(view);
  const picked = ui.payOptions;
  const word = MECHANISM_NAMES[d.mechanism];
  const verb = d.mechanism === 'delve' ? 'Exile' : 'Tap';
  const cards = d.candidates.flatMap((id) => {
    const card = index.get(id);
    return card === undefined ? [] : [card];
  });
  // Everything fits: shrink the cards for a long graveyard.
  const width = cards.length > 12 ? 72 : cards.length > 6 ? 84 : 100;
  const cancel = model.bar.cancel;
  const suggested = sameSet(picked, d.suggested);
  return (
    <Dialog label={word} className="dec-pay-options">
      <h2 className="dec-title" data-pay-options-title>
        {model.bar.prompt}
      </h2>
      <p className="dec-sub dec-pick-hint">
        {d.mechanism === 'delve'
          ? 'Click the cards to exile. Each pays for {1}.'
          : d.mechanism === 'improvise'
            ? 'Click the artifacts to tap. Each pays for {1}.'
            : 'Click the creatures to tap. Each pays for {1} or for a mana of its color.'}
      </p>
      <div className="dec-hand dec-pay-cards" data-pay-cards>
        {cards.map((card) => (
          <MiniCard
            key={card.id}
            card={card}
            width={width}
            selected={picked.includes(card.id)}
            badge={picked.includes(card.id) ? verb : null}
            onClick={() =>
              update((u) => ({ ...u, payOptions: togglePick(u.payOptions, d, card.id) }))
            }
          />
        ))}
      </div>
      {d.mechanism === 'convoke' ? (
        <p className="dec-sub" data-pay-colors>
          {cards
            .filter((c) => picked.includes(c.id))
            .map((c) => `${c.name} (${candidateColors(d, c.id)})`)
            .join(', ')}
        </p>
      ) : null}
      <p className="dec-sub" data-pay-line aria-live="polite">
        {payLine(d, picked)}
      </p>
      <p className="dec-sub" data-pay-detail>
        {model.bar.detail}
      </p>
      <div className="dec-buttons">
        <button
          type="button"
          className="dec-btn dec-btn-secondary"
          disabled={suggested}
          onClick={() => update((u) => ({ ...u, payOptions: d.suggested }))}
        >
          Use suggested
        </button>
        <button
          type="button"
          className="dec-btn dec-btn-secondary"
          disabled={picked.length === 0}
          onClick={() => update((u) => ({ ...u, payOptions: [] }))}
        >
          Clear
        </button>
      </div>
      <BarButtons buttons={cancel === null ? model.bar.buttons : [...model.bar.buttons, cancel]} />
    </Dialog>
  );
}
