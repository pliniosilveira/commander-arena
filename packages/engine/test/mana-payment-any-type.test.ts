// "Mana of any type can be spent to cast that spell" (D-991, CR 609.4b): the payment planner with `SpendTarget.anyType`.
// Pins: CR 609.4b (mana spent as though it were mana of any type: colored and colorless symbols are paid by any mana), CR 107.4e (hybrid) and 107.4f (Phyrexian:
// the mana option is paid by any mana, the life option is unchanged), CR 107.4h (a snow symbol is paid by mana from a snow source: that is not the mana's type),
// CR 106.6 (a restriction of the mana itself is not about its type and still applies), CR 107.3 (generic mana is paid by any mana already).
// Fixtures are SYNTHETIC mana sources (test/mana-fixtures.ts), not card data.
import { describe, expect, test } from 'vitest';
import { parseManaCost, planPayment } from '../src/mana/index';
import type { PaymentRequest } from '../src/mana/payment';
import { ABILITIES_ONLY, CREATURE_ONLY, land, mana, source } from './mana-fixtures';

function request(
  symbols: string[],
  over: Partial<PaymentRequest> = {},
  anyType = true,
): PaymentRequest {
  return {
    cost: parseManaCost(symbols),
    x: 0,
    pool: [],
    sources: [],
    lifeAvailable: 0,
    spell: anyType ? { types: ['sorcery'], anyType: true } : { types: ['sorcery'] },
    ...over,
  };
}

describe('colored symbols are paid by any mana', () => {
  test('{2}{U} is paid by three red lands, and is not without the permission', () => {
    const lands = [land(1, 'R'), land(2, 'R'), land(3, 'R')];
    expect(planPayment(request(['2', 'U'], { sources: lands }))?.taps).toHaveLength(3);
    expect(planPayment(request(['2', 'U'], { sources: lands }, false))).toBeNull();
  });

  test('every color of a multicolored cost: {W}{U}{B}{R}{G} is paid by five lands of one color', () => {
    const lands = [1, 2, 3, 4, 5].map((n) => land(n, 'G'));
    expect(planPayment(request(['W', 'U', 'B', 'R', 'G'], { sources: lands }))?.taps).toHaveLength(
      5,
    );
    expect(planPayment(request(['W', 'U', 'B', 'R', 'G'], { sources: lands }, false))).toBeNull();
  });

  test('the colorless symbol {C} is paid by colored mana (CR 609.4b: any type includes colorless)', () => {
    expect(planPayment(request(['C'], { sources: [land(1, 'R')] }))?.taps).toHaveLength(1);
    expect(planPayment(request(['C'], { sources: [land(1, 'R')] }, false))).toBeNull();
  });

  test('the mana of the pool pays too, and is spent before a source is tapped', () => {
    const plan = planPayment(request(['U', 'U'], { pool: [mana('R')], sources: [land(1, 'G')] }));
    expect(plan?.fromPool).toEqual([0]);
    expect(plan?.taps).toHaveLength(1);
  });

  test('it still takes as much mana as the cost has: two red lands do not pay {2}{U}', () => {
    expect(planPayment(request(['2', 'U'], { sources: [land(1, 'R'), land(2, 'R')] }))).toBeNull();
  });
});

describe('hybrid and Phyrexian symbols', () => {
  test('a hybrid symbol {W/U} is paid by one mana of any color', () => {
    expect(planPayment(request(['W/U'], { sources: [land(1, 'R')] }))?.taps).toHaveLength(1);
    expect(planPayment(request(['W/U'], { sources: [land(1, 'R')] }, false))).toBeNull();
  });

  test('a Phyrexian symbol {B/P} is paid by any mana or by 2 life, as before', () => {
    expect(planPayment(request(['B/P'], { sources: [land(1, 'R')] }))?.taps).toHaveLength(1);
    // With no mana at all the life is paid, as it is without the permission.
    expect(planPayment(request(['B/P'], { lifeAvailable: 5 }))?.lifePaid).toBe(2);
    // The mana is preferred to the life, and no life is paid for a cost the mana pays.
    expect(
      planPayment(request(['B/P'], { sources: [land(1, 'R')], lifeAvailable: 5 }))?.lifePaid,
    ).toBe(0);
  });
});

describe('what is not the type of the mana still applies', () => {
  test('a snow symbol {S} needs mana from a snow source, whatever its type', () => {
    expect(planPayment(request(['S'], { sources: [land(1, 'R')] }))).toBeNull();
    expect(
      planPayment(request(['S'], { sources: [source(1, [['R']], { snow: true })] }))?.taps,
    ).toHaveLength(1);
  });

  test('mana that may be spent only on creature spells cannot be spent on a sorcery', () => {
    expect(
      planPayment(request(['U'], { pool: [mana('R', { restriction: CREATURE_ONLY })] })),
    ).toBeNull();
  });

  test('mana that may be spent only on abilities cannot be spent on a spell', () => {
    expect(
      planPayment(request(['U'], { pool: [mana('R', { restriction: ABILITIES_ONLY })] })),
    ).toBeNull();
  });

  test('a restriction that the spell meets is met as before: creature-only mana pays a creature spell of any color', () => {
    const plan = planPayment(
      request(['U'], {
        pool: [mana('R', { restriction: CREATURE_ONLY })],
        spell: { types: ['creature'], anyType: true },
      }),
    );
    expect(plan?.fromPool).toEqual([0]);
  });
});

describe('a spell without the permission is paid as before', () => {
  test('the plan for an ordinary cost does not change', () => {
    const lands = [land(1, 'U'), land(2, 'R'), land(3, 'R')];
    const plain = planPayment(request(['2', 'U'], { sources: lands }, false));
    expect(plain?.taps.map((t) => t.object)).toEqual(['o1', 'o2', 'o3']);
  });

  test('{X} and generic mana are paid by any mana either way', () => {
    expect(
      planPayment(request(['X'], { sources: [land(1, 'R'), land(2, 'G')], x: 2 }))?.taps,
    ).toHaveLength(2);
  });
});
