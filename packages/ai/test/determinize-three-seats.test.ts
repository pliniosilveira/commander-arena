// Audit of the AI for three seats (issue 452): `determinize` draws again everything the deciding seat cannot know, for EVERY other seat, not just one opponent. Each opponent's hidden
// cards (hand and library) are pooled per seat and dealt back into that seat's slots (CR 400.2: hands and libraries are hidden zones), so no card crosses to another seat.
import { createRng, determinize, type GameState } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { expect, test } from 'vitest';

const NAMES = ['Grizzly Bears', 'Giant Spider', 'Llanowar Elves', 'Lightning Bolt', 'Sol Ring'];

function game() {
  const b = scenario({ seats: 3 }).seat(0).hand('Island').library('Island', 'Island');
  b.seat(1)
    .hand(...NAMES.slice(0, 2))
    .library(...NAMES.slice(2));
  b.seat(2)
    .hand(...NAMES.slice(0, 2))
    .library(...NAMES.slice(2));
  return b.at('precombatMain', { active: 0, turn: 3 }).build();
}

/** The card of each object in the hand of `seat`, in hand order (a hidden card is its card id). */
const handNames = (state: GameState, seat: number) =>
  (state.seats[seat]?.hand ?? []).map((id) => state.objects[id]?.card ?? id);

test('the hands and libraries of both opponents are drawn again, and no card changes seat', () => {
  const g = game();
  const real1 = handNames(g.state, 1).join('|');
  const real2 = handNames(g.state, 2).join('|');
  let changed1 = false;
  let changed2 = false;
  for (let seed = 1; seed <= 20; seed += 1) {
    const sample = determinize(g.state, 0, createRng(seed));
    // The viewer's own hand is what it is.
    expect(sample.seats[0]?.hand).toEqual(g.state.seats[0]?.hand);
    // Every hidden card stays in the pool of its own seat.
    for (const seat of [1, 2]) {
      const before = [
        ...(g.state.seats[seat]?.hand ?? []),
        ...(g.state.seats[seat]?.library ?? []),
      ];
      const after = [...(sample.seats[seat]?.hand ?? []), ...(sample.seats[seat]?.library ?? [])];
      expect(after.map((id) => sample.objects[id]?.owner)).toEqual(after.map(() => seat));
      expect(after).toHaveLength(before.length);
    }
    if (handNames(sample, 1).join('|') !== real1) changed1 = true;
    if (handNames(sample, 2).join('|') !== real2) changed2 = true;
  }
  expect(changed1).toBe(true);
  expect(changed2).toBe(true);
});
