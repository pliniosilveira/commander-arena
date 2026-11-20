// The questions of "Partner with [name]" (CR 702.124j) that the game answers itself with Full Control off, when the named card is the
// player's own commander in plain sight. Cards are the SYNTHETIC Partner Seeker and Partner Quarry of the engine's fixtures.
import { type Action, getView } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { pointlessSearchAnswer } from '../src/policy/pointless-search';

const SEEKER = 'SYNTHETIC Partner Seeker';
const QUARRY = 'SYNTHETIC Partner Quarry';
const LIBRARY = Array.from({ length: 12 }, () => 'Swamp');

/** Seat 0 casts the Seeker; `place` puts the Quarry somewhere for seat 0. The trigger asks for its target. */
function entered(
  place: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>,
): ScenarioGame {
  const g = place(scenario().seat(0).hand(SEEKER).battlefield('Swamp', { count: 3 }))
    .library(...LIBRARY)
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
  g.act(0).cast(SEEKER, { pay: true });
  g.pass();
  g.pass();
  expect(g.state.pending?.kind).toBe('targets');
  return g;
}

const answer = (g: ScenarioGame, fullControl = false): Action | null =>
  pointlessSearchAnswer(getView(g.state, 0), fullControl);

describe('partner with, the partner being the commander in the command zone', () => {
  const game = () => entered((b) => b.commander(QUARRY));

  test('the player is the target and the search is declined, without a question', () => {
    const g = game();
    const target = answer(g);
    expect(target).toEqual({
      kind: 'chooseTargets',
      targets: [expect.objectContaining({ kind: 'player', seat: 0 })],
    });
    if (target === null) throw new Error('no answer');
    expect(g.act(0).try.action(target).ok).toBe(true);
    g.passAll();
    expect(g.state.pending?.kind).toBe('confirmOptional');
    const decline = answer(g);
    expect(decline).toEqual({ kind: 'declineOptional' });
    if (decline === null) throw new Error('no answer');
    expect(g.act(0).try.action(decline).ok).toBe(true);
    // Nothing was searched: the library is as it was, and the commander is where it was.
    g.expect.librarySize(0, LIBRARY.length);
    g.expect.invariants();
  });

  test('with Full Control on, both questions are asked', () => {
    const g = game();
    expect(answer(g, true)).toBeNull();
    g.act(0).chooseTargets({ player: 0 });
    g.passAll();
    expect(g.state.pending?.kind).toBe('confirmOptional');
    expect(answer(g, true)).toBeNull();
  });
});

describe('the questions stay when the search could find the card', () => {
  test('the named card is not a commander in sight: it may be in the library', () => {
    const g = entered((b) => b);
    expect(answer(g)).toBeNull();
    g.act(0).chooseTargets({ player: 0 });
    g.passAll();
    expect(answer(g)).toBeNull();
  });

  test('a card of that name on the battlefield that is not the commander proves nothing', () => {
    const g = entered((b) => b.battlefield(QUARRY));
    expect(answer(g)).toBeNull();
  });

  test('the other player is never answered for', () => {
    const g = entered((b) => b.commander(QUARRY));
    expect(pointlessSearchAnswer(getView(g.state, 1), false)).toBeNull();
  });
});
