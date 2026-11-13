import type { Action, ChooseOptionDecision, GameView, ObjectView } from '@commander-arena/engine';
import { useEffect, useRef } from 'react';
import { Dialog } from './Dialog';
import { MiniCard } from './MiniCard';
import { pileLabel, pileOption, pilePrompt, pileTitle } from './piles-words';

/**
 * The modal of "pick a pile" (D-303, CR 700.3, Fact or Fiction): both piles the other player made, with their cards (public: they were revealed), and one button for each
 * pile. The cards are listed from `view.pendingCards`, which the engine fills for the player who chooses. There is no way out: the effect cannot go on before the choice.
 */
export function PilesDialog({
  d,
  view,
  act,
}: {
  d: ChooseOptionDecision;
  view: GameView;
  act: (action: Action) => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  const { piles } = d;
  if (piles === undefined) return null;
  const seen = new Map<string, ObjectView>((view.pendingCards ?? []).map((o) => [o.id, o]));
  const pileOf = (ids: readonly string[]): readonly ObjectView[] =>
    ids.flatMap((id) => {
      const o = seen.get(id);
      return o === undefined ? [] : [o];
    });
  const sides = [
    { n: 1 as const, ids: piles.first },
    { n: 2 as const, ids: piles.second },
  ];
  return (
    <Dialog label="Pick a pile" className="dec-piles">
      <h2 className="dec-title">{pileTitle({ seat: d.seat, piles })}</h2>
      {d.sourceOracleText === '' ? null : <p className="dec-source-quote">{d.sourceOracleText}</p>}
      <p className="dec-sub" data-option-prompt>
        {pilePrompt({ seat: d.seat, piles })}
      </p>
      <div className="dec-piles-row">
        {sides.map(({ n, ids }) => (
          <div key={n} className="dec-pile" data-pile={n}>
            <ul className="dec-pile-cards" aria-label={pileLabel(n, ids)}>
              {pileOf(ids).map((card) => (
                <li key={card.id}>
                  <MiniCard card={card} width={84} />
                </li>
              ))}
            </ul>
            <button
              ref={n === 1 ? first : undefined}
              type="button"
              className="dec-btn dec-btn-secondary dec-pile-btn"
              data-option={pileOption(n)}
              onClick={() => act({ kind: 'chooseOption', option: pileOption(n) })}
            >
              {pileLabel(n, ids)}
            </button>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
