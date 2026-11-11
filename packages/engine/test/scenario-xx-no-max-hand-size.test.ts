// "You have no maximum hand size."
// Pins: CR 402.2 (Hand: a player's maximum hand size is normally seven, unless an effect changes
// it), CR 514.1 (Cleanup Step: the active player discards down to their maximum hand size),
// CR 604.1 (a static ability does something all the time it is on the battlefield), CR 603 is not
// involved: nothing triggers.
// All cards are SYNTHETIC (src/cards/fixtures/synthetic-mana.ts) or the real fixtures named.
import { describe, expect, test } from 'vitest';
import type { Ability } from '../src/index';
import { validateAbility, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const HAT = 'SYNTHETIC Reading Hat';

/** Seat 0's end step, ready to pass into cleanup. */
function endStep(configure: (b: ReturnType<typeof scenario>) => unknown) {
  const b = scenario().seat(0);
  configure(b);
  return b.seat(1).library('Island', { count: 4 }).at('end', { active: 0, turn: 3 }).build();
}

describe('CR 402.2 and 514.1: no maximum hand size', () => {
  test('without it, nine cards in hand mean a discard of two (the baseline)', () => {
    const g = endStep((b) => b.hand('Forest', { count: 9 }));
    g.passAll();
    g.expect.pending('discard', 0);
  });

  test('with it on the battlefield, the active player discards nothing and keeps all nine', () => {
    const g = endStep((b) => b.hand('Forest', { count: 9 }).battlefield(HAT));
    g.passAll();
    g.expect.noEvent({ kind: 'discarded' });
    g.expect.handSize(0, 9);
    // The turn went on to the opponent without a discard decision.
    g.expect.step('upkeep', { active: 1, turn: 4 });
  });

  test('it works for any hand size, however large', () => {
    const g = endStep((b) => b.hand('Forest', { count: 20 }).battlefield(HAT));
    g.passAll();
    g.expect.handSize(0, 20);
    g.expect.noEvent({ kind: 'discarded' });
  });

  test("an opponent's permanent does nothing for me: I still discard", () => {
    const g = endStep((b) => b.hand('Forest', { count: 9 }).seat(1).battlefield(HAT).seat(0));
    g.passAll();
    g.expect.pending('discard', 0);
  });

  test('it overrides a lowered maximum hand size too', () => {
    const g = endStep((b) => b.handSizeMax(2).hand('Forest', { count: 5 }).battlefield(HAT));
    g.passAll();
    g.expect.handSize(0, 5);
    g.expect.noEvent({ kind: 'discarded' });
  });

  test('two of them do the same as one', () => {
    const g = endStep((b) => b.hand('Forest', { count: 9 }).battlefield(HAT, HAT));
    g.passAll();
    g.expect.handSize(0, 9);
  });

  test('in the hand it does nothing: only a permanent on the battlefield counts', () => {
    const inHand = endStep((b) => b.hand('Forest', { count: 9 }).hand(HAT));
    inHand.passAll();
    inHand.expect.pending('discard', 0);
  });

  test('a hat that is not on the battlefield does nothing: in the graveyard the discard is back', () => {
    const g = endStep((b) => b.hand('Forest', { count: 9 }).graveyard(HAT));
    g.passAll();
    g.expect.pending('discard', 0);
  });
});

describe('validation of the static ability', () => {
  test('noMaximumHandSize is valid; an unknown static effect is not', () => {
    const ok: Ability = { kind: 'static', static: { kind: 'noMaximumHandSize' } };
    expect(validateAbility(ok)).toEqual([]);
    const bad = { kind: 'static', static: { kind: 'flying' } } as never;
    expect(validateAbility(bad).map((i) => i.path)).toEqual(['ability.static']);
    expect(validateAbility({ kind: 'static' } as never)).toHaveLength(1);
  });

  test('the fixture is a valid, supported card', () => {
    const def = scenario()
      .seat(0)
      .battlefield(HAT)
      .build()
      .state.definitions.find((d) => d.name === HAT);
    expect(def && validateCard(def)).toEqual([]);
  });

  test('a static kind outside the registry is rejected as unsupported', () => {
    const def = scenario()
      .seat(0)
      .battlefield(HAT)
      .build()
      .state.definitions.find((d) => d.name === HAT);
    if (!def) throw new Error('no fixture');
    const face = def.faces[0];
    if (!face) throw new Error('no face');
    const other = {
      ...def,
      faces: [{ ...face, abilities: [{ kind: 'static', static: { kind: 'cantAttack' } }] }],
    } as never;
    expect(
      validateCard(other)
        .map((i) => i.message)
        .join(),
    ).toContain('not implemented');
  });
});
