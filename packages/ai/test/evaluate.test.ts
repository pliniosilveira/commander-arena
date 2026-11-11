// The board evaluator (M7b, PRIOR_ART 7.2 heuristic 4): properties of the life curve, the clocks,
// the creature values and the symmetry, on views built from the scenario DSL (real engine states)
// with ObjectViews and SeatViews overridden for the generated cases.
import type { GameView, ObjectView, SeatView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import {
  commanderClock,
  creatureTerms,
  creatureValue,
  evaluate,
  lifeValue,
  VALUED_KEYWORDS,
} from '../src/evaluate';

/** A real two-seat view with one Grizzly Bears per seat: the base the cases are built from. */
function baseView(): { view: GameView; bears: ObjectView } {
  const g = scenario()
    .seat(0)
    .battlefield('Grizzly Bears')
    .library('Island', { count: 4 })
    .seat(1)
    .battlefield('Grizzly Bears')
    .library('Island', { count: 4 })
    .at('precombatMain', { active: 0 })
    .build();
  const view = g.view(0);
  const bears = view.battlefield.find((o) => o.controller === 0);
  if (bears === undefined) throw new Error('no bears');
  return { view, bears };
}
const { view: BASE, bears: BEARS } = baseView();

const creature = (over: Partial<ObjectView>): ObjectView => ({
  ...BEARS,
  id: 'o900',
  tapped: false,
  summoningSick: false,
  damage: 0,
  isToken: false,
  keywords: [],
  ...over,
});

/** The base view with seat `id` patched and its battlefield replaced by `objects` (seat 1's stays). */
function viewWith(
  patch: { seat0?: Partial<SeatView>; seat1?: Partial<SeatView>; mine?: ObjectView[] },
  extra: Partial<GameView> = {},
): GameView {
  return {
    ...BASE,
    ...extra,
    seats: BASE.seats.map((s) =>
      s.id === 0 ? { ...s, ...patch.seat0 } : s.id === 1 ? { ...s, ...patch.seat1 } : s,
    ),
    battlefield: [
      ...(patch.mine ?? []).map((o) => ({ ...o, controller: 0 })),
      ...BASE.battlefield.filter((o) => o.controller === 1),
    ],
  };
}

const scoreOf = (view: GameView, seat = 0) => evaluate(view, seat).score;
const soloValue = (o: ObjectView) =>
  scoreOf(viewWith({ mine: [o] })) - scoreOf(viewWith({ mine: [] }));

const KEYWORDS = [...VALUED_KEYWORDS];

describe('the life curve', () => {
  test('more life never scores lower, and each extra point is worth less (concave)', () => {
    fc.assert(
      fc.property(fc.integer({ min: -20, max: 150 }), fc.integer({ min: 0, max: 30 }), (l, d) => {
        expect(lifeValue(l + d)).toBeGreaterThanOrEqual(lifeValue(l));
        const gainNow = lifeValue(l + 1) - lifeValue(l);
        const gainLater = lifeValue(l + 1 + d + 1) - lifeValue(l + d + 1);
        expect(gainLater).toBeLessThanOrEqual(gainNow + 1e-9);
      }),
    );
  });

  test('the 41st point is worth less than the 5th, scaled for 40 starting life', () => {
    const fifth = lifeValue(5) - lifeValue(4);
    const fortyFirst = lifeValue(41) - lifeValue(40);
    expect(fortyFirst).toBeLessThan(fifth / 4);
    expect(fortyFirst).toBeGreaterThan(0);
  });

  test('on a view, more life for the seat never lowers its score', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 80 }), fc.integer({ min: 0, max: 40 }), (l, d) => {
        const low = scoreOf(viewWith({ seat0: { life: l } }));
        const high = scoreOf(viewWith({ seat0: { life: l + d } }));
        expect(high).toBeGreaterThanOrEqual(low);
      }),
    );
  });

  test('the opponent having more life lowers the score', () => {
    const low = scoreOf(viewWith({ seat1: { life: 10 } }));
    const high = scoreOf(viewWith({ seat1: { life: 40 } }));
    expect(high).toBeLessThan(low);
  });
});

describe('the clocks: commander damage and poison', () => {
  const damaged = (taken: number) =>
    viewWith({}, { commanderDamage: taken === 0 ? {} : { '0:c1': taken } });

  test('commander damage taken never raises the score and costs more as it nears 21', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20 }), (d) => {
        expect(scoreOf(damaged(d + 1))).toBeLessThan(scoreOf(damaged(d)));
      }),
    );
    const early = scoreOf(damaged(0)) - scoreOf(damaged(2));
    const late = scoreOf(damaged(18)) - scoreOf(damaged(20));
    expect(late).toBeGreaterThan(early);
  });

  test('21 commander damage from one commander is a loss and shows as danger', () => {
    const ev = evaluate(damaged(21), 0);
    expect(ev.score).toBeLessThan(scoreOf(damaged(20)) - 100);
    expect(ev.terms.some((t) => t.reason.includes('commander damage') && t.value < 0)).toBe(true);
    const near = evaluate(damaged(18), 0).terms.find((t) => t.reason.includes('commander damage'));
    expect(near?.reason).toContain('danger');
    const far = evaluate(damaged(3), 0).terms.find((t) => t.reason.includes('commander damage'));
    expect(far?.reason).not.toContain('danger');
  });

  test('the clock is per commander: two commanders at 12 each are less dangerous than one at 21', () => {
    expect(commanderClock({ '0:c1': 12, '0:c2': 12 }, 0)).toBe(12);
    expect(commanderClock({ '0:c1': 21, '1:c9': 3 }, 0)).toBe(21);
    expect(commanderClock({}, 0)).toBe(0);
  });

  test('damage dealt by the seat to the opponent raises its score (the same clock, seen from the other side)', () => {
    const v = viewWith({}, { commanderDamage: { '1:c1': 15 } });
    expect(scoreOf(v)).toBeGreaterThan(scoreOf(viewWith({})));
  });

  test('poison counters never raise the score; ten is a loss', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 8 }), (p) => {
        expect(scoreOf(viewWith({ seat0: { poison: p + 1 } }))).toBeLessThan(
          scoreOf(viewWith({ seat0: { poison: p } })),
        );
      }),
    );
    const lost = evaluate(viewWith({ seat0: { poison: 10 } }), 0);
    expect(lost.score).toBeLessThan(scoreOf(viewWith({ seat0: { poison: 9 } })) - 100);
    expect(lost.terms.some((t) => t.reason.includes('poison'))).toBe(true);
  });

  test('a seat that has lost scores far below, and its opponent far above', () => {
    const lost = viewWith({ seat0: { hasLost: true } });
    expect(scoreOf(lost, 0)).toBeLessThan(-500);
    expect(scoreOf(lost, 1)).toBeGreaterThan(500);
  });
});

describe('creatures', () => {
  test('a 3/3 flier outscores a vanilla 3/3', () => {
    const vanilla = creature({ power: 3, toughness: 3 });
    const flier = creature({ power: 3, toughness: 3, keywords: ['flying'] });
    expect(creatureValue(flier)).toBeGreaterThan(creatureValue(vanilla));
    expect(soloValue(flier)).toBeGreaterThan(soloValue(vanilla));
  });

  test('a token scores below the same card', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 1, max: 9 }),
        fc.subarray(KEYWORDS),
        (power, toughness, keywords) => {
          const card = creature({ power, toughness, keywords });
          const token = creature({ power, toughness, keywords, isToken: true });
          expect(creatureValue(token)).toBeLessThan(creatureValue(card));
          expect(soloValue(token)).toBeLessThan(soloValue(card));
        },
      ),
    );
  });

  test('adding a keyword never lowers a creature, and a valued one raises it', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 1, max: 9 }),
        fc.subarray(KEYWORDS),
        fc.constantFrom(...KEYWORDS),
        (power, toughness, have, extra) => {
          const before = creature({ power, toughness, keywords: have });
          const after = creature({ power, toughness, keywords: [...new Set([...have, extra])] });
          expect(creatureValue(after)).toBeGreaterThanOrEqual(creatureValue(before));
          if (!have.includes(extra)) {
            expect(creatureValue(after)).toBeGreaterThan(creatureValue(before));
          }
        },
      ),
    );
  });

  test('more power or more toughness never lowers a creature', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 0, max: 9 }),
        fc.subarray(KEYWORDS),
        (power, toughness, keywords) => {
          const base = creatureValue(creature({ power, toughness, keywords }));
          expect(
            creatureValue(creature({ power: power + 1, toughness, keywords })),
          ).toBeGreaterThan(base);
          expect(
            creatureValue(creature({ power, toughness: toughness + 1, keywords })),
          ).toBeGreaterThan(base);
        },
      ),
    );
  });

  test('evasion and combat keywords are worth more on a bigger creature', () => {
    for (const keyword of [
      'flying',
      'menace',
      'trample',
      'firstStrike',
      'doubleStrike',
      'lifelink',
    ]) {
      const gain = (power: number) =>
        creatureValue(creature({ power, toughness: 2, keywords: [keyword] })) -
        creatureValue(creature({ power, toughness: 2, keywords: [] }));
      expect(gain(5), keyword).toBeGreaterThan(gain(1));
    }
  });

  test('a tapped or summoning-sick creature is worth less than a ready one, but still something', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9 }), fc.subarray(KEYWORDS), (power, keywords) => {
        const ready = creatureValue(creature({ power, toughness: 3, keywords }));
        const tapped = creatureValue(creature({ power, toughness: 3, keywords, tapped: true }));
        const sick = creatureValue(
          creature({ power, toughness: 3, keywords, summoningSick: true }),
        );
        expect(tapped).toBeLessThan(ready);
        expect(sick).toBeLessThan(ready);
        expect(tapped).toBeGreaterThan(0);
        expect(sick).toBeGreaterThan(0);
      }),
    );
  });

  test('damage marked on a creature lowers it, never below zero toughness', () => {
    const fresh = creatureValue(creature({ power: 3, toughness: 3 }));
    expect(creatureValue(creature({ power: 3, toughness: 3, damage: 2 }))).toBeLessThan(fresh);
    expect(creatureValue(creature({ power: 3, toughness: 3, damage: 9 }))).toBeGreaterThan(0);
  });

  test('every creature term has a reason that names the creature, and the terms sum to its value', () => {
    const o = creature({
      name: 'Test Angel',
      power: 4,
      toughness: 4,
      keywords: ['flying', 'vigilance'],
    });
    const terms = creatureTerms(o);
    expect(terms.length).toBeGreaterThanOrEqual(3);
    for (const t of terms) expect(t.reason).toContain('Test Angel');
    expect(terms.reduce((s, t) => s + t.value, 0)).toBeCloseTo(creatureValue(o), 9);
  });

  test('a second creature raises the score of its controller', () => {
    const one = scoreOf(viewWith({ mine: [creature({ power: 2, toughness: 2 })] }));
    const two = scoreOf(
      viewWith({
        mine: [
          creature({ power: 2, toughness: 2 }),
          creature({ id: 'o901', power: 2, toughness: 2 }),
        ],
      }),
    );
    expect(two).toBeGreaterThan(one);
  });
});

describe('cards in hand and mana development', () => {
  test('more cards in hand and more lands never lower the score', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 12 }), (n) => {
        expect(scoreOf(viewWith({ seat0: { handCount: n + 1 } }))).toBeGreaterThan(
          scoreOf(viewWith({ seat0: { handCount: n } })),
        );
      }),
    );
    const land = (id: ObjectView['id']) =>
      creature({ id, types: ['land'], power: null, toughness: null });
    const lands = (n: number) =>
      viewWith({ mine: Array.from({ length: n }, (_, i) => land(`o${100 + i}`)) });
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 12 }), (n) => {
        expect(scoreOf(lands(n + 1))).toBeGreaterThan(scoreOf(lands(n)));
      }),
    );
  });

  test('a card in hand is worth less than the creature it could become', () => {
    const card =
      scoreOf(viewWith({ seat0: { handCount: 1 } })) -
      scoreOf(viewWith({ seat0: { handCount: 0 } }));
    expect(card).toBeLessThan(creatureValue(creature({ power: 2, toughness: 2 })));
  });
});

describe('the score and its terms', () => {
  test('the terms sum to the score, and each has a reason and a seat', () => {
    const view = viewWith({
      mine: [creature({ power: 3, toughness: 3, keywords: ['flying'] })],
      seat0: { life: 31, poison: 2 },
    });
    const ev = evaluate(view, 0);
    expect(ev.terms.reduce((s, t) => s + t.value, 0)).toBeCloseTo(ev.score, 9);
    for (const t of ev.terms) {
      expect(t.reason.length).toBeGreaterThan(0);
      expect([0, 1]).toContain(t.seat);
      expect(Number.isFinite(t.value)).toBe(true);
    }
    expect(ev.terms.some((t) => t.seat === 0 && t.reason.startsWith('life'))).toBe(true);
    expect(ev.terms.some((t) => t.seat === 1 && t.reason.startsWith('life'))).toBe(true);
  });

  test('the score is antisymmetric: seat a sees exactly what seat b sees, negated', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 60 }),
        fc.integer({ min: 1, max: 60 }),
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 0, max: 9 }),
        fc.subarray(KEYWORDS),
        fc.integer({ min: 0, max: 20 }),
        (life0, life1, power, hand, keywords, cd) => {
          const view = viewWith(
            {
              mine: [creature({ power, toughness: 2, keywords })],
              seat0: { life: life0, handCount: hand },
              seat1: { life: life1 },
            },
            { commanderDamage: { '0:cx': cd } },
          );
          expect(scoreOf(view, 0)).toBeCloseTo(-scoreOf(view, 1), 9);
        },
      ),
    );
  });

  test('an even board evaluates to zero for both seats', () => {
    const view = viewWith({ mine: [creature({ id: BEARS.id })] });
    const even = {
      ...view,
      battlefield: BASE.battlefield,
      seats: BASE.seats.map((s) => ({ ...s, life: 40, handCount: 3, poison: 0 })),
      commanderDamage: {},
    };
    expect(scoreOf(even, 0)).toBeCloseTo(0, 9);
    expect(scoreOf(even, 1)).toBeCloseTo(0, 9);
  });

  test('a view is only read: evaluating twice gives the same answer', () => {
    const view = viewWith({ mine: [creature({ power: 3, toughness: 3 })] });
    expect(evaluate(view, 0)).toEqual(evaluate(view, 0));
  });
});

describe('pressure (M7c)', () => {
  test('damage to a player is worth more as the creatures could kill them sooner', () => {
    const big = [creature({ power: 6, toughness: 6 })];
    const drop = (mine: ObjectView[]) =>
      scoreOf(viewWith({ mine, seat1: { life: 10 } })) -
      scoreOf(viewWith({ mine, seat1: { life: 20 } }));
    // The same ten life points, taken from a player who is 10 from dead against a 6 power board, is
    // worth more than from one with no board of ours to threaten them.
    expect(drop(big)).toBeGreaterThan(drop([]));
  });

  test('a creature that cannot attack (defender) adds no pressure', () => {
    const plain = soloValue(creature({ power: 4, toughness: 4, keywords: [] }));
    const wall = soloValue(creature({ power: 4, toughness: 4, keywords: ['defender'] }));
    expect(plain).toBeGreaterThan(wall);
  });
});
