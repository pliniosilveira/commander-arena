/**
 * "Look at the top three cards of your library. Put one of them into your hand, put one of them on the bottom of your library, and exile one of them."
 * (Expressive Iteration, D-216): the `lookAndSplit` effect, run as one instruction that asks the player twice at most.
 *
 * The player looks at the top `count` cards (fewer when the library holds fewer; which they are stays hidden from everyone else, CR 401.2) and
 * sorts them: `hand` of them into the hand, then `bottom` of them on the bottom of the library, then `exile` of them into exile. The instructions
 * are done in the order the card says them (CR 608.2c), so with fewer cards than the sum the first ones are done and the last are not. The player
 * chooses the cards of the first two piles (a `chooseCards` decision of purpose `lookSplit`, asked only when there is a choice to make, with the cards
 * looked at in `looked`); the cards that are left are the exiled ones. The moves are ordinary zone changes (a commander asks its owner, CR 903.9b),
 * and `lastMoved` is what they made, so that "You may play the exiled card this turn" after it reads the exiled card (CR 400.7j).
 */
import type { ObjectId } from '../ids';
import type { ChooseCardsDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import { getSeat } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { moveInstructions } from './effect-support';
import { done, type StepOutcome } from './step-outcome';

type LookSplit = Extract<Instruction, { kind: 'lookSplit' }>;

/** The words of the question of one pile. */
function promptFor(looked: number, pile: 'hand' | 'bottom', count: number): string {
  const cards = `${looked} card${looked === 1 ? '' : 's'}`;
  const what = count === 1 ? 'one of them' : `${count} of them`;
  return `Look at the top ${cards} of your library. Put ${what} ${
    pile === 'hand' ? 'into your hand' : 'on the bottom of your library'
  }`;
}

export function runLookSplit(
  state: GameState,
  res: ResolutionContext,
  ins: LookSplit,
): StepOutcome {
  const { seat } = ins;
  const looked = getSeat(state, seat).library.slice(0, Math.max(ins.count, 0));
  if (looked.length === 0) return done(state);

  // The pile being sorted now: the hand first, then the bottom; both are done in this order and the cards left are exiled.
  const stage: 'hand' | 'bottom' | 'move' =
    ins.toHand === undefined ? 'hand' : ins.toBottom === undefined ? 'bottom' : 'move';

  if (stage !== 'move') {
    const taken: readonly ObjectId[] = ins.toHand ?? [];
    const candidates = looked.filter((id) => !taken.includes(id));
    const wanted = Math.min(stage === 'hand' ? ins.hand : ins.bottom, candidates.length);
    // A pile that takes every card still there (or needs none) is decided: nothing to ask.
    let chosen: readonly ObjectId[] | null =
      wanted === 0 ? [] : candidates.length === wanted ? candidates : ins.chosen;
    if (chosen === null) {
      const decision: Omit<ChooseCardsDecision, 'id'> = {
        kind: 'chooseCards',
        seat,
        source: res.object,
        purpose: 'lookSplit',
        zone: 'library',
        legal: candidates,
        looked,
        to: stage === 'hand' ? 'hand' : 'bottom',
        min: wanted,
        max: wanted,
        reveal: false,
        prompt: promptFor(looked.length, stage, wanted),
      };
      return { state, events: [], front: [], needs: decision };
    }
    chosen = chosen.filter((id) => candidates.includes(id));
    const next: LookSplit =
      stage === 'hand'
        ? { ...ins, toHand: chosen, chosen: null }
        : { ...ins, toBottom: chosen, chosen: null };
    return done(state, [], [next]);
  }

  const toHand = ins.toHand ?? [];
  const toBottom = ins.toBottom ?? [];
  const exiled = looked.filter((id) => !toHand.includes(id) && !toBottom.includes(id));
  // CR 401.2: the cards looked at are seen by their owner only; nobody else is told which went where, only how many.
  const events: GameEvent[] = [{ kind: 'topCardsLooked', seat, count: looked.length }];
  return {
    ...done(state, events, [
      ...moveInstructions(toHand, 'hand'),
      ...moveInstructions(toBottom, 'library', 'bottom'),
      ...moveInstructions(exiled.slice(0, Math.max(ins.exile, 0)), 'exile'),
    ]),
    lastMoved: [],
  };
}
