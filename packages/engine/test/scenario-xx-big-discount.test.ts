// "Creature spells you cast with power 4 or greater cost {2} less to cast." (D-145): a cost reduction for the spells a filter names, here by
// a comparison with the spell's own power. The engine already had the pieces (D-095, D-111); this pins their combination.
// Pins: CR 601.2f (the total cost is determined with the reductions, generic mana only, never below zero: CR 118.7a), CR 208.1 (power:
// a creature spell on the stack has the power printed on the card), CR 202.3 (mana value), CR 604.2 (a static ability of a permanent
// works on spells while the permanent is on the battlefield). Cards are SYNTHETIC (src/cards/fixtures/synthetic-big-discount.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const TAMER = 'SYNTHETIC Titan Tamer';
const RING = 'SYNTHETIC Small Thrift Ring';
const TRAMPLER = 'SYNTHETIC Trampler 4/4'; // {3}{G}, power 4
const V33 = 'SYNTHETIC Vanilla 3/3'; // {3}, power 3
const V55 = 'SYNTHETIC Vanilla 5/5'; // {5}, power 5
const WRATH = 'SYNTHETIC Wrath'; // {2}{W}{W}, a sorcery

const tappedLands = (g: ReturnType<ReturnType<typeof scenario>['build']>) =>
  g.find({ name: 'Forest', zone: 'battlefield' }).filter((o) => o.tapped).length;

describe('the cards are valid', () => {
  test.each([TAMER, RING])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('creature spells with power 4 or greater cost {2} less', () => {
  test('a 4/4 for {3}{G} costs {1}{G}', () => {
    const g = scenario().seat(0).battlefield(TAMER, 'Forest', 'Forest').hand(TRAMPLER).build();
    g.act(0).cast(TRAMPLER, { pay: true });
    g.passAll();
    g.expect.zone(TRAMPLER, 'battlefield', { seat: 0 });
    expect(g.find({ name: 'Forest', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(2);
  });

  test('a 5/5 for {5} costs {3}', () => {
    const g = scenario().seat(0).battlefield(TAMER, 'Forest', 'Forest', 'Forest').hand(V55).build();
    g.act(0).cast(V55, { pay: true });
    g.passAll();
    g.expect.zone(V55, 'battlefield', { seat: 0 });
    expect(tappedLands(g)).toBe(3);
  });

  test('a 3/3 is not reduced: it still costs {3}', () => {
    const g = scenario().seat(0).battlefield(TAMER, 'Forest', 'Forest').hand(V33).build();
    expect(g.act(0).try.cast(V33).ok).toBe(false);
    const full = scenario()
      .seat(0)
      .battlefield(TAMER, 'Forest', 'Forest', 'Forest')
      .hand(V33)
      .build();
    full.act(0).cast(V33, { pay: true });
    expect(tappedLands(full)).toBe(3);
  });

  test('the reduction is applied to what can be cast: the 4/4 is castable with two lands only with the Tamer', () => {
    const without = scenario().seat(0).battlefield('Forest', 'Forest').hand(TRAMPLER).build();
    without.expect.illegal(0, { cast: TRAMPLER });
    const withTamer = scenario()
      .seat(0)
      .battlefield(TAMER, 'Forest', 'Forest')
      .hand(TRAMPLER)
      .build();
    withTamer.expect.legal(0, { cast: TRAMPLER });
  });

  test('an opponent\'s spells are not reduced: "spells you cast"', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TAMER)
      .seat(1)
      .battlefield('Forest', 'Forest')
      .hand(TRAMPLER)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.expect.illegal(1, { cast: TRAMPLER });
  });

  test('two Tamers reduce twice: {3}{G} for a 4/4 becomes {G}', () => {
    const g = scenario().seat(0).battlefield(TAMER, TAMER, 'Forest').hand(TRAMPLER).build();
    g.act(0).cast(TRAMPLER, { pay: true });
    g.passAll();
    g.expect.zone(TRAMPLER, 'battlefield', { seat: 0 });
  });

  test('only the generic part: the colored mana is still paid (it never goes below zero, CR 118.7a)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TAMER, 'Mountain', 'Mountain', 'Mountain')
      .hand(TRAMPLER)
      .build();
    g.expect.illegal(0, { cast: TRAMPLER });
  });

  test('a creature with its power boosted on the battlefield is not a spell: only the card on the stack counts', () => {
    const g = scenario().seat(0).battlefield(TAMER, 'Forest', 'Forest', 'Forest').hand(V33).build();
    g.act(0).cast(V33, { pay: true });
    expect(tappedLands(g)).toBe(3);
  });
});

describe('the same shape with another comparison and a type to leave out', () => {
  test('noncreature spells with mana value 3 or less cost {1} less: a Wrath at 4 is not reduced', () => {
    const g = scenario()
      .seat(0)
      .battlefield(RING, 'Plains', 'Plains', 'Plains')
      .hand(WRATH)
      .build();
    g.expect.illegal(0, { cast: WRATH });
  });

  test('a noncreature spell at mana value 3: Divination {2}{U} costs {1}{U}', () => {
    const g = scenario()
      .seat(0)
      .battlefield(RING, 'Island', 'Island')
      .hand('Divination')
      .library('Island', 'Island', 'Island')
      .build();
    g.act(0).cast('Divination', { pay: true });
    g.passAll();
    g.expect.handSize(0, 2);
  });

  test('a creature spell is left out by the filter', () => {
    const g = scenario().seat(0).battlefield(RING, 'Forest', 'Forest').hand(V33).build();
    g.expect.illegal(0, { cast: V33 });
  });
});
