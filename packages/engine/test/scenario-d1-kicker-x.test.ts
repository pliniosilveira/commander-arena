// "Kicker {X}. X can't be 0. ... When this creature enters, if it was kicked, gain control of target artifact with mana value X or less. If that artifact is an Equipment, attach it to this
// creature." (Thieving Skydiver): the kicker keyword with an {X} cost and `xNotZero`, the X announced when the spell is kicked and remembered by the permanent (`enteredX`).
// Pins: CR 702.33a (Kicker: an additional cost, optional), CR 107.3a (an X in an additional cost is announced as the spell is cast: X can't be 0 here), CR 601.2b (kicker, then X, then targets),
// CR 107.3m (the X the spell had is the X of its enters trigger), CR 603.4 (an intervening "if": it was kicked), CR 701.3 (attach), CR 613.2 and 108.4 (control kept permanently).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-d1.ts). Played with three seats.
import { describe, expect, test } from 'vitest';
import { checkInvariants, getLegalActions, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const MAGPIE = 'SYNTHETIC Kicked Magpie'; // {1}{U} 2/1 flier, Kicker {X}, X can't be 0
const BLADE = 'SYNTHETIC Plain Blade'; // Equipment, mana value 2
const IDOL = 'SYNTHETIC Heavy Idol'; // artifact, mana value 4
const RING = 'Sol Ring'; // artifact, mana value 1

test('the card is valid', () => {
  expect(validateCard(syntheticCard(MAGPIE))).toEqual([]);
});

describe('what a kicker {X} may be', () => {
  const card = syntheticCard(MAGPIE);
  const face = card.faces[0];
  if (face === undefined) throw new Error('no face');
  const withKeyword = (keyword: Record<string, unknown>) =>
    ({
      ...card,
      faces: [{ ...face, abilities: [{ kind: 'keyword', keyword }, ...face.abilities.slice(1)] }],
    }) as never;
  const X = [{ kind: 'mana', symbols: ['X'] }];

  test('an {X} that may be 0 is not built', () => {
    expect(validateCard(withKeyword({ kind: 'kicker', cost: X })).length).toBeGreaterThan(0);
  });

  test('a multikicker has no {X}', () => {
    expect(
      validateCard(withKeyword({ kind: 'multikicker', cost: X, xNotZero: true })).length,
    ).toBeGreaterThan(0);
  });

  test('xNotZero goes with an {X}', () => {
    expect(
      validateCard(
        withKeyword({ kind: 'kicker', cost: [{ kind: 'mana', symbols: ['1'] }], xNotZero: true }),
      ).length,
    ).toBeGreaterThan(0);
    expect(validateCard(withKeyword({ kind: 'kicker', cost: X, xNotZero: true }))).toEqual([]);
  });
});

/** Seat 0 has the Magpie in hand and `lands` Islands; seat 1 has the Blade and the Idol, seat 2 the Ring. */
function game(lands: number) {
  return scenario({ seats: 3 })
    .seat(0)
    .life(20)
    .hand(MAGPIE)
    .battlefield('Island', { count: lands })
    .library('Island', { count: 4 })
    .seat(1)
    .life(20)
    .battlefield(BLADE, IDOL)
    .library('Island', { count: 4 })
    .seat(2)
    .life(20)
    .battlefield(RING)
    .library('Island', { count: 4 })
    .at('precombatMain', { active: 0 })
    .build();
}

describe('Kicker {X}. X can’t be 0 (CR 702.33a, 107.3a)', () => {
  test('the kicker is asked, then X from 1 up to what the mana pays for, then the targets', () => {
    const g = game(6);
    const cast = g.act(0).cast(MAGPIE, { kicked: true });
    expect(cast.stage).toBe('x');
    const d = g.state.pending;
    if (d?.kind !== 'chooseX') throw new Error(`expected chooseX, got ${d?.kind}`);
    // Six lands: {1}{U} for the spell, so X is at most 4; "X can't be 0".
    expect(d.min).toBe(1);
    expect(d.max).toBe(4);
    expect(d.purpose).toBe('spell');
  });

  test('X = 0 is refused', () => {
    const g = game(6);
    g.act(0).cast(MAGPIE, { kicked: true });
    expect(getLegalActions(g.state, 0).some((a) => a.kind === 'chooseX' && a.value === 0)).toBe(
      false,
    );
    expect(() => g.act(0).chooseX(0)).toThrow();
  });

  test('the kicker costs X: the spell and X = 2 take four of six lands', () => {
    const g = game(6);
    g.act(0).cast(MAGPIE, { kicked: true, x: 2, pay: true });
    g.passAll();
    g.expect.pending('targets', 0);
    // Only the artifacts of mana value 2 or less: the Blade and the Ring, not the Idol.
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error('no targets');
    const ids = d.specs[0]?.legal.flatMap((t) => (t.kind === 'object' ? [t.id] : [])) ?? [];
    expect(ids.sort()).toEqual([g.id(BLADE), g.id(RING)].sort());
    expect(g.state.seats[0]?.hand).toHaveLength(0);
    expect(g.state.battlefield.filter((id) => g.state.objects[id]?.tapped === true)).toHaveLength(
      4,
    );
  });

  test('not enough mana for X = 1: the kicker is not even offered', () => {
    const g = game(2);
    const cast = g.act(0).cast(MAGPIE, { pay: true });
    expect(cast.stage).toBe('cast');
    g.passAll();
    g.expect.zone(MAGPIE, 'battlefield', { seat: 0 });
    // Not kicked: its trigger does nothing, and nothing was asked.
    g.expect.pending('priority', 0);
  });

  test('cast without the kicker nothing happens when it enters', () => {
    const g = game(6);
    g.act(0).cast(MAGPIE, { kicked: false, pay: true });
    g.passAll();
    g.expect.zone(MAGPIE, 'battlefield', { seat: 0 });
    g.expect.pending('priority', 0);
    g.expect.zone(IDOL, 'battlefield', { seat: 1 });
    g.expect.zone(RING, 'battlefield', { seat: 2 });
  });
});

describe('gain control of target artifact with mana value X or less, then attach an Equipment (CR 701.3)', () => {
  test('an artifact of another opponent changes sides for good', () => {
    const g = game(6);
    g.act(0).cast(MAGPIE, { kicked: true, x: 1, pay: true });
    g.passAll();
    // X = 1: only the Ring.
    g.expect.pending('priority', 0);
    g.expect.zone(RING, 'battlefield', { seat: 0 });
    g.expect.zone(IDOL, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('an Equipment is attached to the creature', () => {
    const g = game(6);
    g.act(0).cast(MAGPIE, { kicked: true, x: 2, pay: true });
    g.passAll();
    g.act(0).chooseTargets({ name: BLADE, seat: 1 });
    g.passAll();
    g.expect.zone(BLADE, 'battlefield', { seat: 0 });
    const blade = g.object({ name: BLADE, seat: 0 });
    const magpie = g.object({ name: MAGPIE, seat: 0 });
    expect(g.state.objects[blade.id]?.attachedTo).toBe(magpie.id);
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('an artifact that is not an Equipment is only taken', () => {
    const g = game(6);
    g.act(0).cast(MAGPIE, { kicked: true, x: 2, pay: true });
    g.passAll();
    g.act(0).chooseTargets({ name: RING, seat: 2 });
    g.passAll();
    g.expect.zone(RING, 'battlefield', { seat: 0 });
    const ring = g.object({ name: RING, seat: 0 });
    expect(g.state.objects[ring.id]?.attachedTo ?? null).toBeNull();
  });
});
