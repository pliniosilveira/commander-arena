/**
 * "An opponent chooses a nonland card exiled this way." (CR 608.2d, 101.4, D-652): the `opponentChoosesCard` effect, run as one instruction that asks at most once.
 *
 * The cards are the ones the earlier effects of the resolution moved (`moved`) that the filter matches and that are face up in exile (a card nobody may look at is not a card an
 * opponent can choose by what it is). An opponent of the controller chooses one of them: the first opponent in turn order who is still in the game, because with more than two
 * players the CR gives the controller no choice of which opponent (D-233 set the same limit for Coin of Fate). The choice is public (the cards are public) and nothing is done to
 * the card chosen: it is only set aside, so that `moved` names the others afterwards ("the other cards exiled this way", which the next instruction reads). With one card to choose
 * nothing is asked (there is one answer); with none nothing is asked and `moved` stays as it was.
 */
import type { Effect } from '../ast/types';
import type { ObjectId } from '../ids';
import type { GameEvent } from '../state/events';
import { opponentsOf } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { matchesFilter, type SelectContext } from './select';
import { sourceInfo } from './source-info';
import { done, type StepOutcome } from './step-outcome';

type OpponentChoosesCard = Extract<Instruction, { kind: 'opponentChoosesCard' }>;

/** The effect as it starts: the cards that can be chosen, and the opponent who chooses. */
export function startOpponentChoosesCard(
  state: GameState,
  res: ResolutionContext,
  effect: Extract<Effect, { kind: 'opponentChoosesCard' }>,
  ctx: SelectContext,
): StepOutcome {
  const cards = (res.lastMoved ?? []).filter((id) => {
    const card = state.objects[id];
    return (
      card !== undefined &&
      card.zone === 'exile' &&
      card.exiledFaceDown !== true &&
      matchesFilter(state, card, { ...effect.filter, zone: 'exile' }, ctx)
    );
  });
  const [opponent] = opponentsOf(state, res.controller);
  if (cards.length === 0 || opponent === undefined) return done(state);
  return done(state, [], [{ kind: 'opponentChoosesCard', seat: opponent, cards, chosen: null }]);
}

export function runOpponentChoosesCard(
  state: GameState,
  res: ResolutionContext,
  ins: OpponentChoosesCard,
): StepOutcome {
  // A card that left exile since (a new object, CR 400.7) is no longer one to choose.
  const cards = ins.cards.filter((id) => state.objects[id]?.zone === 'exile');
  const rest = (res.lastMoved ?? []).filter((id) => !ins.cards.includes(id) || cards.includes(id));
  if (cards.length === 0) return { ...done(state), lastMoved: rest };
  const only = cards.length === 1 ? cards[0] : undefined;
  const picked: readonly ObjectId[] | null = ins.chosen ?? (only === undefined ? null : [only]);
  if (picked === null) {
    const info = sourceInfo(state, res.source);
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'chooseCards',
        seat: ins.seat,
        source: res.object,
        purpose: 'opponentChoice',
        zone: 'exile',
        legal: cards,
        min: 1,
        max: 1,
        reveal: true,
        prompt: `Choose one of the cards exiled by ${info?.name ?? 'this effect'}.`,
      },
    };
  }
  const events: GameEvent[] = [
    {
      kind: 'cardsChosen',
      seat: ins.seat,
      source: res.source,
      objects: picked,
      automatic: ins.chosen === null,
    },
  ];
  return { ...done(state, events), lastMoved: rest.filter((id) => !picked.includes(id)) };
}
