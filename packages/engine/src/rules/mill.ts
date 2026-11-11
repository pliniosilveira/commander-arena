/**
 * Mill (CR 701.17, D-131): "To mill a number of cards, a player puts that many cards from the top of their library into
 * their graveyard." Milling is not drawing: a player with fewer cards than the number mills all of them and does not lose
 * for it (CR 121.4 is about drawing). The cards are moved one after another, the top card first, so each is a new object
 * in the graveyard (CR 400.7) and each move triggers what it would. A commander that is milled goes to the graveyard
 * like any card; its owner may then put it into the command zone (CR 903.9a), which is a state-based action the engine
 * already runs.
 */
import type { SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { getSeat } from '../state/ops';
import type { GameState } from '../state/types';
import { moveObject } from './zones';

export function millCards(
  input: GameState,
  seat: SeatId,
  count: number,
): { state: GameState; events: GameEvent[] } {
  let state = input;
  const events: GameEvent[] = [];
  const objects: GameState['battlefield'][number][] = [];
  for (let i = 0; i < count; i += 1) {
    const top = getSeat(state, seat).library[0];
    if (top === undefined) break;
    const moved = moveObject(state, { object: top, to: 'graveyard' });
    // A card going from a library to a graveyard never asks the commander question (CR 903.9b is for hand and library).
    if (moved.kind !== 'done') break;
    state = moved.state;
    events.push(...moved.events);
    if (moved.newObject !== null) objects.push(moved.newObject);
  }
  if (objects.length > 0) events.push({ kind: 'milled', seat, objects });
  return { state, events };
}
