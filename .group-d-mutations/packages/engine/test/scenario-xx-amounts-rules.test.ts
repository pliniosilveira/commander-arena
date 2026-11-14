// Counted amounts and player effects of D-131, read directly where a scenario would only see them through a card:
// the clamps and the zones of an aggregate, the counter a count names, the comparisons of `amountIs`, a tapped token
// copy that asks its own question, a count of creatures to return, the selector `all` as a recipient of damage and of
// a prevention shield, a creature of a spell that is gone, and the order of CR 101.4 for each player and each opponent.
// Written from the mutation check of the slice: each test pins a behavior that a mutation of the rules had survived.
// Pins: CR 107.1b (a negative number counts as 0), CR 208.3, CR 202.3 (mana value), CR 122.1 (counters of a kind),
// CR 603.4 and 608.2c (a condition is read as it is now), CR 614.12 (a token asks its own question as it enters),
// CR 110.5b (tapped tokens), CR 101.4 (APNAP), CR 120.3 and 608.2b (the creature that deals the damage), CR 615 (prevention).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-amounts.ts, synthetic-player-effects.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import type { Amount, Condition, ObjectId } from '../src/index';
import { syntheticCard, validateCard } from '../src/index';
import { amountOf } from '../src/rules/amounts';
import { evaluateCondition } from '../src/rules/conditions';
import { scenario } from '../src/testing/index';
import { twoSeatGame } from './two-seat-helpers';

const BEARS = 'Grizzly Bears'; // 2/2, {1}{G}
const SPIDER = 'Giant Spider'; // 2/4, {3}{G}
const GIANT = 'SYNTHETIC Echo Giant'; // 4/4
const ZOMBIE = 'SYNTHETIC Plain Zombie';
const CAPTAIN = 'SYNTHETIC Banner Captain'; // chooses a creature type as it enters
const TWIN = 'SYNTHETIC Tapped Twin'; // a tapped token copy of target creature you control
const RECALL = 'SYNTHETIC Zombie Recall'; // return X creatures you control to hand, X = your Zombies
const CULLING = 'SYNTHETIC Instant Culling'; // each player sacrifices a creature (instant)
const BURN = 'SYNTHETIC Shared Burn'; // 2 damage to you and target opponent (instant)
const WARD = 'SYNTHETIC Shared Ward'; // prevent all damage to you and target opponent (instant)
const FLAT_BITE = 'SYNTHETIC Flat Bite'; // target creature you control deals 3 damage to target creature you don't control
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

/** Seat 1's precombat main with seat 0 holding priority. */
function onTheirTurn(place: (b: Builder) => Builder, opponent: (b: Builder) => Builder = (b) => b) {
  const mine = place(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER),
  );
  return opponent(
    mine
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain', { active: 1, priority: 0 })
    .build();
}

const countOf = (filter: Extract<Amount, { kind: 'countOf' }>['filter']): Amount => ({
  kind: 'countOf',
  filter,
});

describe('an aggregate (CR 107.1b, 208.3, 202.3)', () => {
  test('a creature with a negative power adds a negative total, which counts as 0', () => {
    const g = twoSeatGame((b) => b.battlefield(BEARS, { counters: { '-1/-1': 3 } }));
    const total: Amount = {
      kind: 'aggregate',
      how: 'total',
      stat: 'power',
      filter: { types: ['creature'], controller: 'you' },
    };
    expect(amountOf(g.state, total, { controller: 0, source: null }, [])).toBe(0);
    const greatest: Amount = { ...total, how: 'greatest' };
    expect(amountOf(g.state, greatest, { controller: 0, source: null }, [])).toBe(0);
  });

  test('the zone of the filter is read: the mana values of the cards in your graveyard', () => {
    const g = twoSeatGame((b) => b.graveyard(BEARS).graveyard(SPIDER).battlefield(GIANT));
    const inYard = { zone: 'graveyard', controller: 'you' } as const;
    const total: Amount = { kind: 'aggregate', how: 'total', stat: 'manaValue', filter: inYard };
    expect(amountOf(g.state, total, { controller: 0, source: null }, [])).toBe(6);
    expect(
      amountOf(g.state, { ...total, how: 'greatest' }, { controller: 0, source: null }, []),
    ).toBe(4);
  });
});

describe("an object's toughness and the counters of a kind", () => {
  test('a toughness below zero counts as 0, one above is read as it is', () => {
    const dying = twoSeatGame((b) => b.battlefield(BEARS, { counters: { '-1/-1': 3 } }));
    const toughness: Amount = { kind: 'toughnessOf', of: { kind: 'this' } };
    const id = dying.id(BEARS);
    expect(amountOf(dying.state, toughness, { controller: 0, source: id }, [])).toBe(0);
    const fine = twoSeatGame((b) => b.battlefield(BEARS, { counters: { '-1/-1': 1 } }));
    expect(amountOf(fine.state, toughness, { controller: 0, source: fine.id(BEARS) }, [])).toBe(1);
  });

  test('only the counters of the named kind are counted', () => {
    const g = twoSeatGame((b) => b.battlefield(BEARS, { counters: { '+1/+1': 2, '-1/-1': 1 } }));
    const id = g.id(BEARS);
    const counters = (counter: string): number =>
      amountOf(
        g.state,
        { kind: 'countersOn', of: { kind: 'this' }, counter },
        { controller: 0, source: id },
        [],
      );
    expect(counters('+1/+1')).toBe(2);
    expect(counters('-1/-1')).toBe(1);
    expect(counters('stun')).toBe(0);
  });
});

describe('an amount compared with a number (CR 603.4, 608.2c)', () => {
  const creatures = countOf({ types: ['creature'], controller: 'you' });
  const holds = (
    g: ReturnType<typeof twoSeatGame>,
    c: Condition,
    source: ObjectId | null = null,
  ): boolean => evaluateCondition(g.state, c, { controller: 0, source });

  test('at most, exactly and at least read the same number three ways', () => {
    const g = twoSeatGame((b) => b.battlefield(BEARS).battlefield(SPIDER));
    const is = (cmp: 'atLeast' | 'atMost' | 'equal', value: number): Condition => ({
      kind: 'amountIs',
      amount: creatures,
      compare: { cmp, value },
    });
    expect([
      holds(g, is('atMost', 1)),
      holds(g, is('atMost', 2)),
      holds(g, is('atMost', 3)),
    ]).toEqual([false, true, true]);
    expect([holds(g, is('equal', 1)), holds(g, is('equal', 2)), holds(g, is('equal', 3))]).toEqual([
      false,
      true,
      false,
    ]);
    expect([
      holds(g, is('atLeast', 1)),
      holds(g, is('atLeast', 2)),
      holds(g, is('atLeast', 3)),
    ]).toEqual([true, true, false]);
  });

  test('the permanent that has the condition is "this": the counters on it', () => {
    const g = twoSeatGame((b) => b.battlefield(BEARS, { counters: { '+1/+1': 2 } }));
    const c: Condition = {
      kind: 'amountIs',
      amount: { kind: 'countersOn', of: { kind: 'this' }, counter: '+1/+1' },
      compare: { cmp: 'equal', value: 2 },
    };
    expect(holds(g, c, g.id(BEARS))).toBe(true);
    expect(holds(g, c, null)).toBe(false);
  });
});

describe('a tapped token that is a copy (CR 110.5b, 614.12)', () => {
  test('a copy that asks its own question enters tapped when it is answered', () => {
    const g = twoSeatGame((b) =>
      b
        .hand(TWIN)
        .battlefield(CAPTAIN, { chosen: { creatureType: 'Elf' } })
        .battlefield('Island', { count: 2 }),
    );
    g.act(0).cast(TWIN, { targets: [CAPTAIN], pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('Bear');
    const token = g.find({ name: CAPTAIN, zone: 'battlefield' }).find((o) => o.token !== null);
    expect(token?.tapped).toBe(true);
    g.expect.invariants();
  });

  test('a copy that asks nothing enters tapped too', () => {
    const g = twoSeatGame((b) =>
      b.hand(TWIN).battlefield(BEARS).battlefield('Island', { count: 2 }),
    );
    g.act(0).cast(TWIN, { targets: [BEARS], pay: true });
    g.passAll();
    const token = g.find({ name: BEARS, zone: 'battlefield' }).find((o) => o.token !== null);
    expect(token?.tapped).toBe(true);
    expect(g.find({ name: BEARS, zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(1);
  });
});

describe('a number of creatures to return that is an amount (CR 608.2d)', () => {
  test('X = the Zombies you control: the player returns that many, and not fewer', () => {
    const g = twoSeatGame((b) =>
      b
        .hand(RECALL)
        .battlefield(ZOMBIE, { count: 2 })
        .battlefield(BEARS)
        .battlefield('Island', { count: 2 }),
    );
    g.act(0).cast(RECALL, { pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    const one = g.act(0).try.action({ kind: 'choosePermanents', objects: [g.id(BEARS)] });
    expect(one.ok).toBe(false);
    const [zombie] = g.find({ name: ZOMBIE });
    g.choose(0, { kind: 'choosePermanents', objects: [g.id(BEARS), zombie?.id as never] });
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.invariants();
  });
});

describe('each player acts in turn order (CR 101.4)', () => {
  test("on the opponent's turn, the opponent chooses the sacrifice first", () => {
    const g = onTheirTurn(
      (b) =>
        b.hand(CULLING).battlefield('Swamp', { count: 2 }).battlefield(BEARS).battlefield(SPIDER),
      (b) => b.battlefield(GIANT).battlefield(BEARS),
    );
    g.act(0).cast(CULLING, { pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 1);
    g.act(1).choosePermanents(BEARS);
    g.expect.pending('choosePermanent', 0);
  });
});

describe('several players as the recipient of damage and of a prevention shield', () => {
  test('2 damage to you and to target opponent', () => {
    const g = twoSeatGame((b) => b.hand(BURN).battlefield('Mountain', { count: 2 }));
    g.act(0).cast(BURN, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(0, 18);
    g.expect.life(1, 18);
  });

  test('a shield for both players prevents the damage to each of them', () => {
    const g = twoSeatGame((b) =>
      b.hand(WARD, BURN).battlefield('Plains', { count: 2 }).battlefield('Mountain', { count: 2 }),
    );
    g.act(0).cast(WARD, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).cast(BURN, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(0, 20);
    g.expect.life(1, 20);
  });
});

describe('a creature that is not a legal target deals no damage (CR 608.2b)', () => {
  test('3 damage from a creature that left in response: the other target takes none', () => {
    const g = twoSeatGame(
      (b) =>
        b
          .hand(FLAT_BITE, 'Unsummon')
          .battlefield(BEARS)
          .battlefield('Forest')
          .battlefield('Island'),
      (b) => b.battlefield(SPIDER),
    );
    g.act(0).cast(FLAT_BITE, { targets: [BEARS, SPIDER], pay: true });
    g.act(0).cast('Unsummon', { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    expect(g.object(SPIDER).damage).toBe(0);
    g.expect.invariants();
  });

  test('3 damage from a creature that stays: the target takes 3', () => {
    const g = twoSeatGame(
      (b) => b.hand(FLAT_BITE).battlefield(BEARS).battlefield('Forest'),
      (b) => b.battlefield(SPIDER),
    );
    g.act(0).cast(FLAT_BITE, { targets: [BEARS, SPIDER], pay: true });
    g.passAll();
    expect(g.object(SPIDER).damage).toBe(3);
    expect(g.object(BEARS).damage).toBe(0);
  });
});

describe('what the validator refuses, with a reason', () => {
  const stub = (effect: unknown) => {
    const base = syntheticCard('SYNTHETIC Stalwart Study');
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    return { ...base, faces: [{ ...face, spell: { effect } }] } as never;
  };
  const reasons = (card: never) => validateCard(card).map((i) => i.message);
  const conditional = (condition: unknown) =>
    stub({
      kind: 'conditional',
      condition,
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    });

  test('a condition counts the counters on this permanent only', () => {
    const amount = { kind: 'countersOn', of: { kind: 'target', id: 't1' }, counter: '+1/+1' };
    expect(
      reasons(conditional({ kind: 'amountIs', amount, compare: { cmp: 'atLeast', value: 1 } })),
    ).toEqual(expect.arrayContaining([expect.stringContaining('counters on this permanent only')]));
  });

  test('a number compared with is a whole number that is not negative', () => {
    expect(
      reasons(
        conditional({
          kind: 'amountIs',
          amount: { kind: 'commanderColors' },
          compare: { cmp: 'atLeast', value: -1 },
        }),
      ),
    ).toEqual([expect.stringContaining('non-negative whole number')]);
  });

  test('"tapped" is a flag that is true or absent', () => {
    expect(
      reasons(
        stub({
          kind: 'createToken',
          token: { kind: 'preset', preset: 'Treasure' },
          count: 1,
          tapped: false,
        }),
      ),
    ).toEqual([expect.stringContaining('tapped must be true')]);
  });

  test('a sum in a characteristic-defining ability names at least two counts', () => {
    const horde = syntheticCard('SYNTHETIC Grave Horde');
    const face = horde.faces[0];
    if (face === undefined) throw new Error('no face');
    const one = { kind: 'sum', of: [{ kind: 'countOf', filter: {} }] };
    const bad = {
      ...horde,
      faces: [
        {
          ...face,
          abilities: [
            { kind: 'static', static: { kind: 'characteristicPt', power: one, toughness: one } },
          ],
        },
      ],
    } as never;
    expect(reasons(bad)).toEqual(
      expect.arrayContaining([expect.stringContaining('a sum needs at least two counts')]),
    );
  });
});
