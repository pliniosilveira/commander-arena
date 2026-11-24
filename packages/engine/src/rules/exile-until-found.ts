/**
 * "Each player exiles cards from the top of their library until they exile a nonland card." (CR 701.13, 101.4, D-660): the `exileUntilFound` effect. Each player the selector names,
 * the active player first and then in turn order (CR 101.4), exiles cards from the top of their own library one at a time, face up, until one that the filter matches has been exiled
 * or their library is empty (a library with no such card is exiled to its end, and the player exiles nothing more: the effect does not make them lose, CR 121.4 is about drawing).
 * Every card exiled, by every player, is what `moved` names afterwards. Each move is an ordinary zone change (CR 400.7), so each card is a new object in exile and triggers what it
 * would; a commander exiled from a library may be put into the command zone at the next state-based check (CR 903.9a, as for any card exiled).
 */
import type { Effect } from '../ast/types';
import type { ObjectId } from '../ids';
import { shuffle } from '../rng';
import type { GameEvent } from '../state/events';
import { getSeat } from '../state/ops';
import type { ChosenTarget, GameState, ResolutionContext } from '../state/types';
import { apnapOrder, matchesFilter, resolvePlayers, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';
import { moveObject } from './zones';

export function runExileUntilFound(
  state: GameState,
  res: ResolutionContext,
  effect: Extract<Effect, { kind: 'exileUntilFound' }>,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  let next = state;
  const events: GameEvent[] = [];
  const exiled: ObjectId[] = [];
  const found: ObjectId[] = [];
  for (const seat of apnapOrder(state, resolvePlayers(state, effect.players, ctx, targets))) {
    const rest: ObjectId[] = [];
    for (;;) {
      const top = getSeat(next, seat).library[0];
      const card = top === undefined ? undefined : next.objects[top];
      if (top === undefined || card === undefined) break;
      // The card is looked at where it is, in the library, before it moves (the filter describes cards in a library).
      const match = matchesFilter(
        next,
        card,
        { ...effect.filter, zone: 'library' },
        { controller: seat, source: res.source },
      );
      const moved = moveObject(next, { object: top, to: 'exile' });
      // A move to exile never asks the commander question (CR 903.9b is for the hand and the library).
      if (moved.kind !== 'done') break;
      next = moved.state;
      events.push(...moved.events);
      if (moved.newObject !== null) exiled.push(moved.newObject);
      if (match) {
        found.push(...(moved.newObject === null ? [] : [moved.newObject]));
        break;
      }
      rest.push(...(moved.newObject === null ? [] : [moved.newObject]));
    }
    // CR 401.4 (Guff Rewrites History): "then puts the rest on the bottom of their library in a random order": the order is the seeded generator's, nobody sees or chooses it.
    if (effect.restToBottom === true && rest.length > 0) {
      const [order, rng] = shuffle(rest, next.rng);
      next = { ...next, rng };
      for (const card of order) {
        const back = moveObject(next, { object: card, to: 'library', position: 'bottom' });
        if (back.kind !== 'done') continue;
        next = back.state;
        events.push(...back.events);
      }
    }
  }
  return { ...done(next, events), lastMoved: effect.restToBottom === true ? found : exiled };
}
