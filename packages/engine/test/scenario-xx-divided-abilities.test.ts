// Damage divided as an ability is put on the stack, and a cast trigger that reads the spell that caused it.
// Pins: CR 601.2d (the division is announced with the targets, each target gets at least 1), CR 602.2b (an activated ability is activated as a spell is
// cast), CR 603.3d (a triggered ability's targets and division are chosen as it goes on the stack), CR 115.1 and 601.2c ("any number", "one or two"),
// CR 602.5b ("Activate only if"), CR 608.2b (an illegal target is not affected), CR 603.3 and 608.2c (a cast trigger reads the spell it came from: its
// mana value in a target filter, its power in a condition), CR 202.3 (mana value), CR 208.1 (power). Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-divide-abilities.ts).
import { describe, expect, test } from 'vitest';
import type { ChosenTarget } from '../src/index';
import { syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';
import { targetsDecision } from './pending-helpers';

const ENTERER = 'SYNTHETIC Divided Enterer'; // {5}{R} 6/6, enters: 5 divided among any number of opposing creatures and/or planeswalkers
const PINGER = 'SYNTHETIC Divided Pinger'; // {3}{R} 3/3, {3}{R}: 2 divided among one or two targets, only with a +1/+1 counter
const BOUNCER = 'SYNTHETIC Spell Bouncer'; // cast a spell: bounce a nonland opposing permanent with mana value at most the spell's
const WATCHER = 'SYNTHETIC Cast Counter'; // cast a creature spell: counter; power 4+: draw; power 6+: damage equal to its power to each opponent
const V11 = 'SYNTHETIC Vanilla 1/1';
const V22 = 'SYNTHETIC Vanilla 2/2';
const V33 = 'SYNTHETIC Vanilla 3/3';
const V55 = 'SYNTHETIC Vanilla 5/5';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 10 }, () => 'Mountain');

const answer = (g: ScenarioGame, picks: readonly (readonly [string, number | undefined])[]) =>
  g.act(0).try.action({
    kind: 'chooseTargets',
    targets: picks.map(
      ([label, share]): ChosenTarget => ({
        kind: 'object',
        id: g.id(label),
        specId: 't1',
        ...(share === undefined ? {} : { share }),
      }),
    ),
  });

describe('the cards are valid', () => {
  test.each([ENTERER, PINGER, BOUNCER, WATCHER])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('a division of an ability needs the effect that deals it, and the other way round', () => {
    const card = syntheticCard(ENTERER);
    const face = card.faces[0];
    const ability = face?.abilities[0];
    if (face === undefined || ability?.kind !== 'triggered') throw new Error('no trigger');
    const withAbility = (changed: unknown) =>
      ({ ...card, faces: [{ ...face, abilities: [changed] }] }) as never;
    expect(
      validateCard(
        withAbility({ ...ability, effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } }),
      ).length,
    ).toBeGreaterThan(0);
    const [spec] = ability.targets ?? [];
    expect(
      validateCard(withAbility({ ...ability, targets: [{ ...spec, divide: undefined }] })).length,
    ).toBeGreaterThan(0);
  });

  test('a mode, a static ability and a reflexive ability have no division', () => {
    const card = syntheticCard(ENTERER);
    const face = card.faces[0];
    const ability = face?.abilities[0];
    if (face === undefined || ability?.kind !== 'triggered') throw new Error('no trigger');
    const withAbility = (changed: unknown) =>
      ({ ...card, faces: [{ ...face, abilities: [changed] }] }) as never;
    const reflexive = {
      ...ability,
      targets: undefined,
      effect: {
        kind: 'may',
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        reflexive: { targets: ability.targets, effect: ability.effect },
      },
    };
    expect(validateCard(withAbility(reflexive)).length).toBeGreaterThan(0);
  });

  test('a target filter that reads the triggering spell needs a cast trigger', () => {
    const card = syntheticCard(BOUNCER);
    const face = card.faces[0];
    const ability = face?.abilities[0];
    if (face === undefined || ability?.kind !== 'triggered') throw new Error('no trigger');
    const upkeep = { ...ability, trigger: { kind: 'dies', what: { kind: 'this' } } };
    expect(
      validateCard({ ...card, faces: [{ ...face, abilities: [upkeep] }] } as never).length,
    ).toBeGreaterThan(0);
  });
});

describe('objectMatches of the spell that caused a cast trigger', () => {
  const withFilter = (filter: unknown, trigger: unknown = undefined) => {
    const card = syntheticCard(WATCHER);
    const face = card.faces[0];
    const ability = face?.abilities[0];
    if (face === undefined || ability?.kind !== 'triggered') throw new Error('no trigger');
    const effect = JSON.parse(JSON.stringify(ability.effect));
    effect.effects[1].condition.filter = filter;
    return {
      ...card,
      faces: [
        {
          ...face,
          abilities: [{ ...ability, ...(trigger === undefined ? {} : { trigger }), effect }],
        },
      ],
    } as never;
  };

  test('compares power, toughness or mana value (CR 208.1, 202.3)', () => {
    expect(validateCard(withFilter({ toughness: { cmp: 'atMost', value: 2 } }))).toEqual([]);
    expect(validateCard(withFilter({ manaValue: { cmp: 'equal', value: 3 } }))).toEqual([]);
  });

  test('a trigger whose subject is neither a permanent nor a spell has nothing to read', () => {
    const upkeep = { kind: 'step', step: 'upkeep', whose: 'you' };
    expect(
      validateCard(withFilter({ power: { cmp: 'atLeast', value: 4 } }, upkeep)).length,
    ).toBeGreaterThan(0);
  });
});

describe('a triggered ability divides damage among any number of targets', () => {
  const game = () =>
    scenario()
      .seat(0)
      .hand(ENTERER)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .battlefield(V22, { label: 'mine' })
      .seat(1)
      .battlefield(V22, { label: 'a' })
      .battlefield(V33, { label: 'b' })
      .battlefield(V55, { label: 'c' })
      .battlefield(WALKER, { label: 'walker' })
      .battlefield('Mountain', { label: 'land' })
      .build();

  /** Casts the creature and lets the spell resolve: the enters trigger then asks for its targets. */
  const entered = () => {
    const g = game();
    g.act(0).cast(ENTERER, { pay: true });
    g.passAll();
    return g;
  };

  test('the decision names the total, offers only opposing creatures and planeswalkers, and takes none at least', () => {
    const g = entered();
    const spec = targetsDecision(g).specs[0];
    expect(spec?.divide).toBe(5);
    expect(spec?.min).toBe(0);
    expect(spec?.max).toBe(5); // at most the total: each target needs 1
    const labels = (spec?.legal ?? []).map((t) => (t.kind === 'object' ? t.id : -1)).sort();
    expect(labels).toEqual([g.id('a'), g.id('b'), g.id('c'), g.id('walker')].sort());
    expect((spec?.legal ?? []).some((t) => t.kind === 'object' && t.id === g.id('mine'))).toBe(
      false,
    );
  });

  test('the creature deals the damage: each target gets its share, a planeswalker loses loyalty', () => {
    const g = entered();
    expect(
      answer(g, [
        ['a', 2],
        ['walker', 3],
      ]).ok,
    ).toBe(true);
    g.passAll();
    g.expect.zone(V22, 'graveyard', { seat: 1 });
    g.expect.counters('walker', { loyalty: 1 });
    g.expect.damage('b', 0);
    g.expect.damage('c', 0);
    g.expect.invariants();
  });

  test('all of it may go to one target', () => {
    const g = entered();
    expect(answer(g, [['c', 5]]).ok).toBe(true);
    g.passAll();
    g.expect.zone(V55, 'graveyard', { seat: 1 });
  });

  test('the division must give out exactly the total, at least 1 to each target', () => {
    const g = entered();
    expect(
      answer(g, [
        ['a', 2],
        ['b', 2],
      ]).ok,
    ).toBe(false);
    expect(
      answer(g, [
        ['a', 3],
        ['b', 3],
      ]).ok,
    ).toBe(false);
    expect(
      answer(g, [
        ['a', 5],
        ['b', 0],
      ]).ok,
    ).toBe(false);
    expect(answer(g, [['a', undefined]]).ok).toBe(false);
    expect(answer(g, [['mine', 5]]).ok).toBe(false);
    expect(answer(g, [['land', 5]]).ok).toBe(false);
    g.expect.pending('targets', 0);
  });

  test('no target at all is allowed: the ability resolves and does nothing', () => {
    const g = entered();
    expect(answer(g, []).ok).toBe(true);
    g.passAll();
    g.expect.damage('a', 0);
    g.expect.damage('b', 0);
    g.expect.counters('walker', { loyalty: 4 });
    g.expect.stack([]);
  });

  test("a single legal target is still asked: the division is the player's to announce", () => {
    const g = scenario()
      .seat(0)
      .hand(ENTERER)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .battlefield(V22, { label: 'a' })
      .build();
    g.act(0).cast(ENTERER, { pay: true });
    g.passAll();
    g.expect.pending('targets', 0);
    expect(answer(g, [['a', 5]]).ok).toBe(true);
    g.passAll();
    g.expect.zone(V22, 'graveyard', { seat: 1 });
  });

  test('nothing to target: the ability goes on the stack with no question', () => {
    const g = scenario()
      .seat(0)
      .hand(ENTERER)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .build();
    g.act(0).cast(ENTERER, { pay: true });
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('targets');
  });
});

describe('an activated ability divides damage among one or two targets', () => {
  const game = (counters: boolean) => {
    const b = scenario()
      .seat(0)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .battlefield(PINGER, { label: 'pinger', ...(counters ? { counters: { '+1/+1': 1 } } : {}) })
      .seat(1)
      .battlefield(V11, { label: 'a' })
      .battlefield(V33, { label: 'b' });
    return b.build();
  };

  test('"Activate only if this creature has a +1/+1 counter on it": without one it cannot be activated (CR 602.5b)', () => {
    const g = game(false);
    expect(g.act(0).try.activate('pinger').ok).toBe(false);
  });

  test('with a counter the decision says 2 is divided, one or two targets, players included', () => {
    const g = game(true);
    g.act(0).activate('pinger');
    const spec = targetsDecision(g).specs[0];
    expect(spec?.divide).toBe(2);
    expect(spec?.min).toBe(1);
    expect(spec?.max).toBe(2);
    expect((spec?.legal ?? []).filter((t) => t.kind === 'player')).toHaveLength(2);
  });

  test('1 to a player and 1 to a creature', () => {
    const g = game(true);
    g.act(0).activate('pinger', { targets: [{ player: 1 }, 'a'], divide: [1, 1], pay: true });
    g.passAll();
    g.expect.life(1, 39);
    g.expect.zone(V11, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('all 2 to one target', () => {
    const g = game(true);
    g.act(0).activate('pinger', { targets: ['b'], divide: [2], pay: true });
    g.passAll();
    g.expect.damage('b', 2);
    g.expect.life(1, 40);
  });

  test('three targets, no target, or a wrong total are refused', () => {
    const g = game(true);
    g.act(0).activate('pinger');
    expect(answer(g, []).ok).toBe(false);
    expect(
      answer(g, [
        ['a', 1],
        ['b', 1],
        ['pinger', 1],
      ]).ok,
    ).toBe(false);
    expect(
      answer(g, [
        ['a', 1],
        ['b', 2],
      ]).ok,
    ).toBe(false);
    expect(answer(g, [['a', 1]]).ok).toBe(false);
  });

  test('the ability on the stack keeps its division: the permanent that deals the damage is the creature', () => {
    const g = game(true);
    g.act(0).activate('pinger', { targets: ['a', 'b'], divide: [1, 1], pay: true });
    g.expect.stack([`${PINGER} (ability)`]);
    g.passAll();
    g.expect.zone(V11, 'graveyard', { seat: 1 });
    g.expect.damage('b', 1);
  });
});

describe('a target filter that reads the mana value of the spell that caused the trigger', () => {
  const game = () =>
    scenario()
      .seat(0)
      .hand(V33, V55, V11)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .battlefield(BOUNCER)
      .seat(1)
      .battlefield(V11, { label: 'one' })
      .battlefield(V33, { label: 'three' })
      .battlefield(V55, { label: 'five' })
      .battlefield('Mountain', { label: 'land' })
      .build();

  test("the targets are the nonland permanents an opponent controls with mana value at most the spell's", () => {
    const g = game();
    g.act(0).cast(V33, { pay: true });
    const spec = targetsDecision(g).specs[0];
    expect(spec?.min).toBe(0);
    expect(spec?.max).toBe(1);
    const legal = (spec?.legal ?? []).map((t) => (t.kind === 'object' ? t.id : -1)).sort();
    expect(legal).toEqual([g.id('one'), g.id('three')].sort());
  });

  test('a bigger spell reaches a bigger permanent', () => {
    const g = game();
    g.act(0).cast(V55, { pay: true });
    const legal = (targetsDecision(g).specs[0]?.legal ?? []).map((t) =>
      t.kind === 'object' ? t.id : -1,
    );
    expect(legal.sort()).toEqual([g.id('one'), g.id('three'), g.id('five')].sort());
  });

  test("the target returns to its owner's hand when the ability resolves, before the spell does", () => {
    const g = game();
    g.act(0).cast(V33, { pay: true });
    expect(answer(g, [['three', undefined]]).ok).toBe(true);
    g.expect.stack([`${BOUNCER} (ability)`, V33]);
    g.passAll();
    g.expect.zone(V33, 'hand', { seat: 1 });
    g.expect.zone(V33, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('"up to one": the ability may be given no target', () => {
    const g = game();
    g.act(0).cast(V11, { pay: true });
    expect(answer(g, []).ok).toBe(true);
    g.passAll();
    g.expect.zone(V11, 'battlefield', { seat: 1 });
  });

  test('a target with a bigger mana value is not legal', () => {
    const g = game();
    g.act(0).cast(V11, { pay: true });
    expect(answer(g, [['three', undefined]]).ok).toBe(false);
    expect(answer(g, [['land', undefined]]).ok).toBe(false);
    expect(answer(g, [['one', undefined]]).ok).toBe(true);
  });

  test("the limit is the spell's own mana value: a two-mana instant reaches the 1/1 and the ability asks", () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .battlefield(BOUNCER)
      .seat(1)
      .battlefield(V11, { label: 'one' })
      .build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    // The Bolt fixture costs {1}{G}: mana value 2, so the 1/1 is legal and the trigger asks.
    g.expect.pending('targets', 0);
  });
});

describe('a condition that reads the power of the spell that caused the trigger', () => {
  const game = (hand: readonly string[]) =>
    scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(...hand)
      .battlefield(
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
      )
      .battlefield(WATCHER, { label: 'watcher' })
      .seat(1)
      .library(...LIBRARY)
      .build();

  test('power 2: only the counter', () => {
    const g = game([V22]);
    g.act(0).cast(V22, { pay: true });
    g.passAll();
    g.expect.counters('watcher', { '+1/+1': 1 });
    g.expect.handSize(0, 0);
    g.expect.life(1, 40);
  });

  test('power 5: the counter and a card, but no damage', () => {
    const g = game([V55]);
    g.act(0).cast(V55, { pay: true });
    g.passAll();
    g.expect.counters('watcher', { '+1/+1': 1 });
    g.expect.handSize(0, 1);
    g.expect.life(1, 40);
  });

  test("power 6: the counter, a card, and damage equal to the creature's power, counter included", () => {
    const g = game([ENTERER]);
    g.act(0).cast(ENTERER, { pay: true });
    g.passAll();
    g.expect.counters('watcher', { '+1/+1': 1 });
    g.expect.handSize(0, 1);
    g.expect.life(1, 37);
    g.expect.invariants();
  });

  test('a spell that is not a creature spell does not trigger it', () => {
    const g = game([BOLT]);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.counters('watcher', {});
  });

  test('the power is read as the spell is: the second trigger sees its own spell, not the first', () => {
    const g = game([V22, V55]);
    g.act(0).cast(V22, { pay: true });
    g.passAll();
    g.act(0).cast(V55, { pay: true });
    g.passAll();
    g.expect.counters('watcher', { '+1/+1': 2 });
    g.expect.handSize(0, 1);
  });
});
