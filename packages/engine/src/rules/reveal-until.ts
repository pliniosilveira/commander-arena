/**
 * "Reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield tapped and the rest on the
 * bottom of your library in a random order." (D-145, CR 701.20 Reveal, 401.4): the `revealUntil` effect. The controller reveals cards one at
 * a time from the top of their library until one matches the filter; every card revealed is public (`cardsRevealed`); the card found is
 * put onto the battlefield (tapped or not) or into the hand, and the others go on the bottom in a random order from the seeded generator
 * (`bottomInRandomOrder`). A library with no match is revealed to its end and all of it goes to the bottom, which changes nothing but the
 * order. The card found is what `moved` names afterwards.
 */
import type { Effect } from '../ast/types';
import type { ObjectId } from '../ids';
import type { GameEvent } from '../state/events';
import { getSeat } from '../state/ops';
import type { GameState, ResolutionContext } from '../state/types';
import { derive } from './derive';
import { moveInstructions } from './effect-support';
import { bottomInRandomOrder } from './look-take';
import { matchesFilter } from './select';
import { done, type StepOutcome } from './step-outcome';

type RevealUntil = Extract<Effect, { kind: 'revealUntil' }>;

export function runRevealUntil(
  state: GameState,
  res: ResolutionContext,
  effect: RevealUntil,
): StepOutcome {
  const seat = res.controller;
  const revealed: ObjectId[] = [];
  let found: ObjectId | null = null;
  for (const id of getSeat(state, seat).library) {
    revealed.push(id);
    const card = state.objects[id];
    if (
      card !== undefined &&
      matchesFilter(
        state,
        card,
        { ...effect.filter, zone: 'library' },
        { controller: seat, source: res.source },
      )
    ) {
      found = id;
      break;
    }
  }
  if (revealed.length === 0) return { ...done(state), lastMoved: [] };
  const cards = revealed.flatMap((id) => {
    const card = state.objects[id];
    return card?.card == null ? [] : [{ card: card.card, name: derive(state, card).name }];
  });
  const events: GameEvent[] = [
    {
      kind: 'cardsRevealed',
      seat,
      cards: cards.map((c) => c.card),
      names: cards.map((c) => c.name),
      from: 'library',
    },
  ];
  const bottom = bottomInRandomOrder(
    state,
    seat,
    revealed.filter((id) => id !== found),
  );
  const put =
    found === null
      ? []
      : moveInstructions(
          [found],
          effect.put,
          'top',
          effect.put === 'battlefield' && effect.tapped === true,
          effect.put === 'battlefield' ? 'you' : undefined,
        );
  return {
    ...done(bottom.state, [...events, ...bottom.events], [...put, ...bottom.front]),
    lastMoved: [],
  };
}
