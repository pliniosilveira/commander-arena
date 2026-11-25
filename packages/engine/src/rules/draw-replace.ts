/**
 * Replacement effects that make a player draw more cards in place of a draw (CR 614.1a, 614.11; D-379): "If you would draw a card except the first one you
 * draw in each of your draw steps, draw two cards instead" is the replacement `drawInstead` of a permanent on the battlefield, read from the abilities it
 * has now (so "loses all abilities" turns it off, CR 613.1f).
 *
 * The effects that apply to one draw each apply once (CR 614.5: an effect does not replace the draws it made), so with k of them that make 2 cards each the
 * draw becomes 2^k draws; every other order gives the same number, so the player is never asked (CR 616.1). A `skipDraw` that applies to the draw as
 * it would happen is applied first (D-332): the draw is skipped and nothing else is looked at, which is the order the engine chooses (CR 616.1), the player is not asked.
 * The draws made in its place are draws like any other (a `cardDrawn` event each, the commander question of CR 903.9b each, the `skipDraw` of a library that
 * has run out for each of them) and are all made before the sequence of draws the replaced draw was part of goes on (CR 614.11a): `rules/draw.ts` puts them
 * at the head of the queue and remembers that they were already replaced.
 */
import type { ObjectId, SeatId } from '../ids';
import { opponentsOf } from '../state/ops';
import type { GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import { drawSkippedBy } from './draw-skip';

/** CR 504.1, 504.2: whether a draw of `seat` now would be the first one the player draws in the draw step that is going on (a draw step of theirs). */
export function isFirstDrawOfDrawStep(state: GameState, seat: SeatId): boolean {
  return (
    state.turn.step === 'draw' &&
    state.turn.activeSeat === seat &&
    state.turn.drewInDrawStep !== true
  );
}

/** What replaces a draw: the permanents whose `drawInstead` applies, and how many draws happen in its place (1 when nothing replaces it). */
export interface DrawReplaced {
  readonly sources: readonly ObjectId[];
  readonly count: number;
}

/**
 * The replacement of a draw of `seat` that is about to happen: none (`count` 1, no sources) when nothing applies, a `skipDraw` applies (it goes first,
 * and the draw is skipped by `drawCard`) or the draw is the one the effects except.
 */
export function drawReplacementOf(state: GameState, seat: SeatId): DrawReplaced {
  const none: DrawReplaced = { sources: [], count: 1 };
  if (drawSkippedBy(state, seat) !== null) return none;
  const sources: ObjectId[] = [];
  let count = 1;
  const first = isFirstDrawOfDrawStep(state, seat);
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined || controllerOf(state, obj) !== seat) continue;
    for (const ability of derive(state, obj).abilities) {
      if (ability.kind !== 'replacement' || ability.replacement.kind !== 'drawInstead') continue;
      // CR 504.1: "except the first one you draw in each of your draw steps": that draw is not replaced.
      if (ability.replacement.exceptFirstInDrawStep && first) continue;
      sources.push(id);
      count *= ability.replacement.count;
    }
  }
  return sources.length === 0 ? none : { sources, count };
}

/** A draw that a `drawRedirect` replaces: the permanent whose effect applies, and the player who draws in its place (its controller). */
export interface DrawRedirected {
  readonly source: ObjectId;
  readonly controller: SeatId;
}

/**
 * CR 614.1a, 614.11, 504.1 (Notion Thief): the permanent whose `drawRedirect` replaces a draw of `seat` that is about to happen, or null when none does. It applies to the draws of
 * every opponent of the controller of the permanent but the first one of their own draw step, and to a draw once (CR 614.5: `used` are the permanents whose effect already
 * replaced the draw this one stands for). The oldest permanent goes first when several apply; the player is not asked which (CR 616.1, `docs/ROADMAP.md`). Nothing applies to a
 * player who has lost or to the draw step's own first draw, which the turn-based action of the step makes without asking here.
 */
export function drawRedirectOf(
  state: GameState,
  seat: SeatId,
  used: readonly ObjectId[],
): DrawRedirected | null {
  const first = isFirstDrawOfDrawStep(state, seat);
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined || used.includes(id)) continue;
    const controller = controllerOf(state, obj);
    if (controller === seat || !opponentsOf(state, controller).includes(seat)) continue;
    for (const ability of derive(state, obj).abilities) {
      if (ability.kind !== 'replacement' || ability.replacement.kind !== 'drawRedirect') continue;
      // CR 504.1: "except the first one they draw in each of their draw steps": that draw is not replaced.
      if (ability.replacement.exceptFirstInDrawStep && first) continue;
      return { source: id, controller };
    }
  }
  return null;
}
