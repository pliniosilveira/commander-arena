/**
 * Explore (CR 701.44, issue 81): "Target creature you control explores." The permanent's controller reveals the top card of their library. A land card goes into their hand; otherwise
 * the permanent gets a +1/+1 counter and the player may put the card into their graveyard. Several permanents explore one after the other (CR 701.44d): this effect handles the first
 * one it finds and leaves the rest to another `explore` effect queued after the answer of the "may".
 */
import type { Effect } from '../ast/types';
import type { ObjectId } from '../ids';
import type { GameEvent } from '../state/events';
import { getSeat } from '../state/ops';
import type { GameState, Instruction } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import { moveInstructions } from './effect-support';
import { done, type StepOutcome } from './step-outcome';

type Explore = Extract<Effect, { kind: 'explore' }>;

/** One permanent explores (CR 701.44a); `rest` are the permanents that explore after it, which the instructions queued here continue with. */
export function runExplore(
  state: GameState,
  explorers: readonly ObjectId[],
  _effect: Explore,
): StepOutcome {
  // CR 701.44c: a permanent that is no longer on the battlefield as the effect says to explore is skipped here (the engine has no last-known explore).
  const [first, ...rest] = explorers.filter((id) => state.objects[id]?.zone === 'battlefield');
  if (first === undefined) return done(state);
  const exploring = state.objects[first];
  if (exploring === undefined) return done(state);
  const seat = controllerOf(state, exploring);
  const top = getSeat(state, seat).library[0];
  const card = top === undefined ? undefined : state.objects[top];
  const events: GameEvent[] = [];
  const queue: Instruction[] = [];
  const isLand = card !== undefined && derive(state, card).types.includes('land');
  if (top !== undefined && card !== undefined && card.card !== null) {
    events.push({
      kind: 'cardsRevealed',
      seat,
      cards: [card.card],
      names: [derive(state, card).name],
      from: 'library',
    });
  }
  if (top !== undefined && isLand) {
    queue.push(...moveInstructions([top], 'hand', 'top', false, undefined));
  } else {
    queue.push({
      kind: 'effect',
      as: seat,
      effect: {
        kind: 'addCounters',
        objects: { kind: 'boundObjects', ids: [first] },
        counter: '+1/+1',
        count: 1,
      },
    });
    if (top !== undefined) {
      queue.push({
        kind: 'effect',
        as: seat,
        effect: {
          kind: 'may',
          effect: {
            kind: 'moveToZone',
            objects: { kind: 'boundObjects', ids: [top], zone: 'library' },
            to: 'graveyard',
          },
        },
      });
    }
  }
  if (rest.length > 0) {
    queue.push({
      kind: 'effect',
      effect: { kind: 'explore', objects: { kind: 'boundObjects', ids: rest } },
    });
  }
  return done(state, events, queue);
}
