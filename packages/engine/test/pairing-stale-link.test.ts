// The stored link of a pair is read only while it stands (CR 702.95a, 702.95e, D-983): both creatures point at each other, for the same player who formed it.
// A link that is not mirrored (one side lost it, or points at a third creature, or names another player) reads as unpaired for the partner, for the "is paired" test and for the grant. The states are built by hand: no rule makes them, they are what a missed update would leave.
import { describe, expect, test } from 'vitest';
import type { ObjectId, SeatId } from '../src/ids';
import { isPaired, linkedPartnerOf, partnerOf } from '../src/rules/pairing';
import { setObject } from '../src/state/ops';
import type { GameState } from '../src/state/types';
import { scenario } from '../src/testing/index';

const SERAPH = 'SYNTHETIC Soulbound Seraph';
const BEARS = 'Grizzly Bears';

function board() {
  const g = scenario()
    .seat(0)
    .battlefield(SERAPH, { label: 'seraph', pairedWith: 'bears' })
    .battlefield(BEARS, { label: 'bears' })
    .battlefield('Serra Angel', { label: 'serra' })
    .seat(1)
    .build();
  return { g, a: g.id('seraph'), b: g.id('bears'), c: g.id('serra') };
}

/** The object with its stored link replaced (an object without one when `link` is null). */
function relink(
  state: GameState,
  id: ObjectId,
  link: { with: ObjectId; by: SeatId } | null,
): GameState {
  const obj = state.objects[id];
  if (obj === undefined) throw new Error(`no object ${id}`);
  const { paired: _old, ...rest } = obj;
  return setObject(state, (link === null ? rest : { ...rest, paired: link }) as typeof obj);
}

const readers = (state: GameState, a: ObjectId, b: ObjectId) => {
  const first = state.objects[a];
  const second = state.objects[b];
  if (first === undefined || second === undefined) throw new Error('missing object');
  return {
    linked: [linkedPartnerOf(state, first)?.id ?? null, linkedPartnerOf(state, second)?.id ?? null],
    partner: [partnerOf(state, first)?.id ?? null, partnerOf(state, second)?.id ?? null],
    paired: [isPaired(state, first), isPaired(state, second)],
  };
};

describe('a link that is not mirrored reads as unpaired', () => {
  test("the intact link: each is the other's partner", () => {
    const { g, a, b } = board();
    expect(readers(g.state, a, b)).toEqual({
      linked: [b, a],
      partner: [b, a],
      paired: [true, true],
    });
  });

  test('the other creature has no link back', () => {
    const { g, a, b } = board();
    const state = relink(g.state, b, null);
    expect(readers(state, a, b)).toEqual({
      linked: [null, null],
      partner: [null, null],
      paired: [false, false],
    });
  });

  test('the other creature is linked to a third creature', () => {
    const { g, a, b, c } = board();
    const state = relink(g.state, b, { with: c, by: 0 });
    expect(readers(state, a, b).linked[0]).toBeNull();
    expect(readers(state, a, b).paired[0]).toBe(false);
  });

  test('the other creature names another player as the one who formed the pair (the by check)', () => {
    const { g, a, b } = board();
    const state = relink(g.state, b, { with: a, by: 1 });
    expect(readers(state, a, b)).toEqual({
      linked: [null, null],
      partner: [null, null],
      paired: [false, false],
    });
  });

  test('a link to an object that does not exist', () => {
    const { g, a, b } = board();
    const state = relink(g.state, a, { with: 'o999' as ObjectId, by: 0 });
    expect(readers(state, a, b).linked[0]).toBeNull();
  });
});
