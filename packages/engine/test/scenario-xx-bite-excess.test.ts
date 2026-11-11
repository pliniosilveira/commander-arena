// "Target creature you control deals damage equal to its power to target creature you don't control. If the creature you control has
// trample, excess damage is dealt to that creature's controller instead." (D-145): `dealDamage.trampleExcess` on a one-sided bite.
// Pins: CR 120.3 (damage dealt by a source to a recipient: a creature, a player), CR 120.6 (lethal damage takes the damage already marked
// into account), CR 702.19b (excess damage: lethal first, the rest elsewhere), CR 702.2c (deathtouch: any damage above 0 is lethal),
// CR 702.19a (trample has no effect on noncombat damage by itself: here the spell says what the excess does), CR 608.2b (a target that is
// no longer legal), CR 120.3f (lifelink). Cards are SYNTHETIC (src/cards/fixtures/synthetic-bite-excess.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import type { GameEvent } from '../src/index';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const TRAMPLE_BITE = 'SYNTHETIC Trample Bite';
const PLAIN_BITE = 'SYNTHETIC Plain Bite';
const TRAMPLER = 'SYNTHETIC Trampler 4/4';
const DEATHTOUCH_TRAMPLER = 'SYNTHETIC Deathtouch Trampler 4/4';
const BEARS = 'Grizzly Bears'; // 2/2, no trample
const V22 = 'SYNTHETIC Vanilla 2/2';
const V33 = 'SYNTHETIC Vanilla 3/3';
const V55 = 'SYNTHETIC Vanilla 5/5';
const LIFELINK = 'SYNTHETIC Double Strike Lifelink 3/3';

const dealt = (events: readonly GameEvent[]) => events.filter((e) => e.kind === 'damageDealt');

function bite(spell: string, mine: string, theirs: string, opts: { marked?: number } = {}) {
  const g = scenario()
    .seat(0)
    .hand(spell)
    .battlefield('Forest', 'Forest')
    .battlefield(mine, { label: 'mine' })
    .seat(1)
    .life(20)
    .battlefield(theirs, {
      label: 'theirs',
      ...(opts.marked === undefined ? {} : { damage: opts.marked }),
    })
    .build();
  const mark = g.mark();
  g.act(0).cast(spell, { targets: ['mine', 'theirs'], pay: true });
  g.passAll();
  return { g, events: g.eventsSince(mark) };
}

describe('the cards are valid', () => {
  test.each([TRAMPLE_BITE, PLAIN_BITE])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('a creature without trample deals all of it to the creature (the baseline)', () => {
  test('a 5/5 bites a 2/2: the full 5 damage to it, nothing to its controller', () => {
    const { g, events } = bite(TRAMPLE_BITE, V55, V22);
    g.expect.zone(V22, 'graveyard', { seat: 1 });
    g.expect.life(1, 20);
    expect(dealt(events).map((e) => (e.kind === 'damageDealt' ? e.amount : 0))).toEqual([5]);
  });

  test('without the clause the spell never reads trample, even from a trampler', () => {
    const { g } = bite(PLAIN_BITE, TRAMPLER, V22);
    g.expect.life(1, 20);
    g.expect.zone(V22, 'graveyard', { seat: 1 });
  });
});

describe('a creature with trample: lethal to the creature, the excess to its controller (CR 702.19b)', () => {
  test('a 4/4 trampler bites a 2/2: 2 to the creature, 2 to its controller', () => {
    const { g, events } = bite(TRAMPLE_BITE, TRAMPLER, V22);
    g.expect.zone(V22, 'graveyard', { seat: 1 });
    g.expect.life(1, 18);
    expect(dealt(events).map((e) => (e.kind === 'damageDealt' ? e.amount : 0))).toEqual([2, 2]);
  });

  test('exactly lethal: no excess, no damage to the player', () => {
    const { g } = bite(TRAMPLE_BITE, TRAMPLER, V33);
    // 4 damage against a 3/3 is 3 and 1 over; against the same toughness exactly there is none:
    g.expect.life(1, 19);
    const exact = bite(TRAMPLE_BITE, TRAMPLER, 'SYNTHETIC Vanilla 5/5');
    exact.g.expect.life(1, 20);
    exact.g.expect.damage('SYNTHETIC Vanilla 5/5', 4);
  });

  test('damage already marked on the creature counts: a 3/3 with 2 damage needs only 1 more (CR 120.6)', () => {
    const { g } = bite(TRAMPLE_BITE, TRAMPLER, V33, { marked: 2 });
    g.expect.zone(V33, 'graveyard', { seat: 1 });
    g.expect.life(1, 17);
  });

  test('the same on a 5/5 with 4 damage marked: 1 to it, 3 to its controller', () => {
    const { g } = bite(TRAMPLE_BITE, TRAMPLER, V55, { marked: 4 });
    g.expect.zone(V55, 'graveyard', { seat: 1 });
    g.expect.life(1, 17);
  });

  test('deathtouch makes 1 damage lethal: the other 3 go to the controller (CR 702.2c)', () => {
    const { g, events } = bite(TRAMPLE_BITE, DEATHTOUCH_TRAMPLER, V55);
    g.expect.zone(V55, 'graveyard', { seat: 1 });
    g.expect.life(1, 17);
    expect(dealt(events).map((e) => (e.kind === 'damageDealt' ? e.amount : 0))).toEqual([1, 3]);
  });

  test('it is not combat damage, and it is the creature that deals it: lifelink gains for its controller (CR 120.3f)', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .hand(TRAMPLE_BITE)
      .battlefield('Forest', 'Forest')
      .battlefield(LIFELINK, { label: 'mine' })
      .seat(1)
      .life(20)
      .battlefield(BEARS, { label: 'theirs' })
      .build();
    g.act(0).cast(TRAMPLE_BITE, { targets: ['mine', 'theirs'], pay: true });
    g.passAll();
    // The lifelink creature has no trample: all 3 damage goes to the Bears, and its controller gains 3.
    g.expect.life(0, 23);
    g.expect.life(1, 20);
  });
});

describe('only a creature recipient has an excess', () => {
  test('a planeswalker is dealt all of it: loyalty goes down by the full 4, nothing reaches its controller', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Trample Bite Either')
      .battlefield('Forest', 'Forest')
      .battlefield(TRAMPLER, { label: 'mine' })
      .seat(1)
      .life(20)
      .battlefield('SYNTHETIC Vanilla Planeswalker', { label: 'walker', counters: { loyalty: 6 } })
      .build();
    g.act(0).cast('SYNTHETIC Trample Bite Either', { targets: ['mine', 'walker'], pay: true });
    g.passAll();
    g.expect.counters('walker', { loyalty: 2 });
    g.expect.life(1, 20);
  });
});

describe('the creature that deals the damage is not touched', () => {
  test('the creature bitten deals nothing back (a one-sided bite, not a fight)', () => {
    const { g } = bite(TRAMPLE_BITE, TRAMPLER, V55);
    g.expect.damage('mine', 0);
  });
});

describe('validation', () => {
  const withEffect = (e: object) =>
    ({
      ...syntheticCard(TRAMPLE_BITE),
      faces: [
        {
          ...syntheticCard(TRAMPLE_BITE).faces[0],
          spell: { ...syntheticCard(TRAMPLE_BITE).faces[0]?.spell, effect: e },
        },
      ],
    }) as unknown as Parameters<typeof validateCard>[0];
  const base = {
    kind: 'dealDamage',
    amount: 3,
    from: { kind: 'target', id: 't1' },
    to: { kind: 'target', id: 't2' },
  };

  test('the good shape validates', () => {
    expect(validateCard(withEffect({ ...base, trampleExcess: true }))).toEqual([]);
  });

  test.each([
    ['false', { ...base, trampleExcess: false }],
    ['without a creature that deals it', { ...base, from: undefined, trampleExcess: true }],
    ['to a player', { ...base, to: { kind: 'eachOpponent' }, trampleExcess: true }],
  ])('%s is refused', (_name, effect) => {
    expect(validateCard(withEffect(effect)).length).toBeGreaterThan(0);
  });
});
