// "This mana can't be spent to pay generic mana costs" (CR 106.6; Jegantha, the Wellspring): the payment planner with `ManaRestriction` `notGeneric`.
// Pins: CR 106.6 (a restriction on how mana is spent), CR 107.3 (an {X} is generic mana once X is chosen), CR 107.4e (hybrid: {R/G} is either color, {2/W} is {W} or generic {2}).
// Fixtures are SYNTHETIC mana sources and mana (test/mana-fixtures.ts), not card data.
import { describe, expect, test } from 'vitest';
import { parseManaCost, planPayment } from '../src/mana/index';
import type { PaymentRequest } from '../src/mana/payment';
import type { ManaRestriction } from '../src/mana/types';
import { land, mana, source } from './mana-fixtures';

const NOT_GENERIC: ManaRestriction = { kind: 'notGeneric' };
const restricted = (n: number, color: 'W' | 'R') =>
  source(n, [[color]], { restriction: NOT_GENERIC });
/** A source like the five-color mana ability: one outcome of five mana, restricted. */
const fiveColor = (n: number) =>
  source(n, [['W', 'U', 'B', 'R', 'G']], { tier: 'creature', restriction: NOT_GENERIC });

function request(symbols: string[], over: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    cost: parseManaCost(symbols),
    x: 0,
    pool: [],
    sources: [],
    lifeAvailable: 0,
    spell: { types: ['sorcery'] },
    ...over,
  };
}

describe('a source whose mana is notGeneric', () => {
  test('pays a colored symbol', () => {
    expect(planPayment(request(['R'], { sources: [restricted(1, 'R')] }))?.taps).toHaveLength(1);
  });

  test('never pays generic mana: {1} and {2}', () => {
    expect(planPayment(request(['1'], { sources: [restricted(1, 'R')] }))).toBeNull();
    expect(
      planPayment(request(['2'], { sources: [restricted(1, 'R'), restricted(2, 'R')] })),
    ).toBeNull();
  });

  test('never pays an {X}, whatever X is', () => {
    expect(planPayment(request(['X'], { x: 1, sources: [restricted(1, 'R')] }))).toBeNull();
    expect(
      planPayment(request(['X', 'R'], { x: 2, sources: [restricted(1, 'R'), land(2, 'R')] })),
    ).toBeNull();
  });

  test('pays the colored side of a hybrid symbol {R/G}', () => {
    expect(planPayment(request(['R/G'], { sources: [restricted(1, 'R')] }))?.taps).toHaveLength(1);
  });

  test('pays the colored side of {2/W}, not its generic side', () => {
    expect(planPayment(request(['2/W'], { sources: [restricted(1, 'W')] }))?.taps).toHaveLength(1);
    // Two red mana would pay the generic side {2}; with the restriction they cannot.
    expect(
      planPayment(request(['2/W'], { sources: [restricted(1, 'R'), restricted(2, 'R')] })),
    ).toBeNull();
    // The same two red mana without the restriction do.
    expect(planPayment(request(['2/W'], { sources: [land(1, 'R'), land(2, 'R')] }))).not.toBeNull();
  });

  test('a mixed cost {2}{R}: the restricted mana pays the {R} and other mana the {2}', () => {
    const plan = planPayment(
      request(['2', 'R'], { sources: [restricted(1, 'R'), land(2, 'G'), land(3, 'G')] }),
    );
    expect(plan?.taps).toHaveLength(3);
    // Without other mana for the generic part there is no plan.
    expect(
      planPayment(request(['2', 'R'], { sources: [restricted(1, 'R'), land(2, 'G')] })),
    ).toBeNull();
  });

  test('the five-color source pays {W}{U}{B}{R}{G} but not {3}{R}', () => {
    expect(
      planPayment(request(['W', 'U', 'B', 'R', 'G'], { sources: [fiveColor(1)] }))?.taps,
    ).toHaveLength(1);
    expect(planPayment(request(['3', 'R'], { sources: [fiveColor(1)] }))).toBeNull();
    // It pays the five colors; the generic part of the cost comes from other mana.
    const lands = [2, 3, 4, 5].map((n) => land(n, 'G'));
    expect(
      planPayment(request(['4', 'W', 'U', 'B', 'R', 'G'], { sources: [fiveColor(1), ...lands] }))
        ?.taps,
    ).toHaveLength(5);
  });

  test('its mana never pays the generic part of the activation cost of a costed mana source', () => {
    const costed = source(9, [['G']], { cost: parseManaCost(['1']), tier: 'artifact' });
    expect(planPayment(request(['G'], { sources: [costed, restricted(1, 'R')] }))).toBeNull();
    expect(planPayment(request(['G'], { sources: [costed, land(2, 'R')] }))?.taps).toHaveLength(2);
  });
});

describe('notGeneric mana in the pool', () => {
  const pooled = () => mana('R', { restriction: NOT_GENERIC });

  test('it stays restricted: pays {R}, never {1} or {X}', () => {
    expect(planPayment(request(['R'], { pool: [pooled()] }))?.fromPool).toEqual([0]);
    expect(planPayment(request(['1'], { pool: [pooled()] }))).toBeNull();
    expect(planPayment(request(['X'], { x: 1, pool: [pooled()] }))).toBeNull();
  });

  test('{1}{R} takes the restricted mana for the {R} and other pool mana for the {1}', () => {
    const plan = planPayment(request(['1', 'R'], { pool: [pooled(), mana('G')] }));
    expect(plan?.fromPool.slice().sort()).toEqual([0, 1]);
    expect(planPayment(request(['1', 'R'], { pool: [pooled(), pooled()] }))).toBeNull();
  });

  test('it may be spent on a spell or an ability alike (it limits the part of the cost)', () => {
    const plan = planPayment(request(['R'], { pool: [pooled()], spell: { ability: true } }));
    expect(plan?.fromPool).toEqual([0]);
  });
});
