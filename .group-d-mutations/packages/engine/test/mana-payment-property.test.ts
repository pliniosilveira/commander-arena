// Property-style check of the payment planner against an independent brute force. The generator
// below is a tiny seeded LCG (no Math.random) so failures are reproducible from the seed.
import { describe, expect, test } from 'vitest';
import { parseManaCost, planPayment, restrictionAllows } from '../src/mana/index';
import type { PaymentRequest, PaymentSource } from '../src/mana/payment';
import type { ManaColor, ManaObject, ManaRestriction } from '../src/mana/types';
import { oid, unitLcg } from './mana-fixtures';

const COLORS: ManaColor[] = ['W', 'U', 'B', 'R', 'G', 'C'];
const SYMBOLS = [
  '1',
  '2',
  '3',
  'W',
  'U',
  'B',
  'R',
  'G',
  'C',
  'W/U',
  'B/R',
  'G/W',
  'C/R',
  '2/G',
  '2/U',
  'W/P',
  'B/P',
  'G/P',
  'S',
  'X',
];

interface Unit {
  color: ManaColor;
  snow: boolean;
}

/** Independent reference: minimal life needed to pay `symbols` from exactly these units. */
function minLife(symbols: readonly string[], x: number, units: readonly Unit[]): number {
  type Need =
    | { k: 'color'; c: ManaColor }
    | { k: 'snow' }
    | { k: 'generic' }
    | { k: 'hybrid'; a: ManaColor | 2; b: ManaColor }
    | { k: 'phy'; c: ManaColor };
  const needs: Need[] = [];
  for (const s of symbols) {
    if (/^\d+$/.test(s)) for (let i = 0; i < Number(s); i++) needs.push({ k: 'generic' });
    else if (s === 'X') for (let i = 0; i < x; i++) needs.push({ k: 'generic' });
    else if (s === 'S') needs.push({ k: 'snow' });
    else if (s.length === 1) needs.push({ k: 'color', c: s as ManaColor });
    else if (s.endsWith('/P')) needs.push({ k: 'phy', c: s[0] as ManaColor });
    else {
      const [a, b] = s.split('/') as [string, string];
      needs.push({ k: 'hybrid', a: a === '2' ? 2 : (a as ManaColor), b: b as ManaColor });
    }
  }
  const memo = new Map<string, number>();
  const go = (i: number, used: number): number => {
    if (i === needs.length) return 0;
    const key = `${i}:${used}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const need = needs[i] as Need;
    let best = Number.POSITIVE_INFINITY;
    const spend = (match: (u: Unit) => boolean, extra = 0, count = 1) => {
      // Spend `count` units (hybrid generic uses 2) that all satisfy `match`.
      const pick = (from: number, left: number, mask: number): void => {
        if (left === 0) {
          best = Math.min(best, extra + go(i + 1, mask));
          return;
        }
        for (let j = from; j < units.length; j++) {
          if (mask & (1 << j)) continue;
          if (match(units[j] as Unit)) pick(j + 1, left - 1, mask | (1 << j));
        }
      };
      pick(0, count, used);
    };
    switch (need.k) {
      case 'color':
        spend((u) => u.color === need.c);
        break;
      case 'snow':
        spend((u) => u.snow);
        break;
      case 'generic':
        spend(() => true);
        break;
      case 'phy':
        spend((u) => u.color === need.c);
        best = Math.min(best, 2 + go(i + 1, used));
        break;
      case 'hybrid':
        spend((u) => u.color === need.b);
        if (need.a === 2) spend(() => true, 0, 2);
        else spend((u) => u.color === (need.a as ManaColor));
        break;
    }
    memo.set(key, best);
    return best;
  };
  return go(0, 0);
}

function unitsOf(
  mana: readonly ManaObject[],
  sources: readonly { source: PaymentSource; outcome: number }[],
): Unit[] {
  const units: Unit[] = mana.map((m) => ({ color: m.color, snow: m.snow }));
  for (const { source, outcome } of sources) {
    for (const color of source.produces[outcome] ?? []) units.push({ color, snow: source.snow });
  }
  return units;
}

function randomCase(rand: () => number): PaymentRequest {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)] as T;
  const symbols = Array.from({ length: 1 + Math.floor(rand() * 4) }, () => pick(SYMBOLS));
  const spellKind = Math.floor(rand() * 3);
  const spell =
    spellKind === 0
      ? { ability: true as const }
      : { types: spellKind === 1 ? ['creature'] : ['instant'] };
  const restrictions: (ManaRestriction | null)[] = [
    null,
    null,
    null,
    null,
    { kind: 'spellTypes', types: ['creature'] },
    { kind: 'abilitiesOnly' },
  ];
  const pool: ManaObject[] = Array.from({ length: Math.floor(rand() * 3) }, (_, i) => ({
    color: pick(COLORS),
    snow: rand() < 0.3,
    source: oid(800 + i),
    restriction: pick(restrictions),
  }));
  const tiers = ['land', 'land', 'creature', 'artifact', 'sacrifice'] as const;
  const sources: PaymentSource[] = Array.from({ length: Math.floor(rand() * 6) }, (_, i) => ({
    object: oid(i + 1),
    abilityIndex: 0,
    produces: Array.from({ length: 1 + Math.floor(rand() * 2) }, () =>
      Array.from({ length: 1 + Math.floor(rand() * 2) }, () => pick(COLORS)),
    ),
    tier: pick(tiers),
    snow: rand() < 0.3,
    restriction: pick(restrictions),
  }));
  const reserve = rand() < 0.3 ? [pick(COLORS)] : undefined;
  return {
    cost: parseManaCost(symbols),
    x: Math.floor(rand() * 3),
    pool,
    sources,
    lifeAvailable: Math.floor(rand() * 7),
    spell,
    ...(reserve ? { reserve } : {}),
  };
}

/** Brute force: minimum life over every choice of outcome (or no tap) for each source. */
function bruteMinLife(req: PaymentRequest, symbols: readonly string[]): number {
  const poolUnits = req.pool.filter((m) => restrictionAllows(m.restriction, req.spell));
  const usable = req.sources.filter((s) => restrictionAllows(s.restriction, req.spell));
  let best = Number.POSITIVE_INFINITY;
  const rec = (i: number, chosen: { source: PaymentSource; outcome: number }[]): void => {
    if (i === usable.length) {
      best = Math.min(best, minLife(symbols, req.x, unitsOf(poolUnits, chosen)));
      return;
    }
    const source = usable[i] as PaymentSource;
    rec(i + 1, chosen);
    for (let outcome = 0; outcome < source.produces.length; outcome++) {
      rec(i + 1, [...chosen, { source, outcome }]);
    }
  };
  rec(0, []);
  return best <= req.lifeAvailable ? best : Number.POSITIVE_INFINITY;
}

describe('planPayment property check against brute force', () => {
  const seeds = Array.from({ length: 12 }, (_, i) => 1000 + i);
  test.each(seeds)('seed %i: plans pay, and null only when no payment exists', (seed) => {
    const rand = unitLcg(seed);
    let paid = 0;
    let nulls = 0;
    for (let n = 0; n < 40; n++) {
      const symbols = Array.from(
        { length: 1 + Math.floor(rand() * 4) },
        () => SYMBOLS[Math.floor(rand() * SYMBOLS.length)] as string,
      );
      // Rebuild a request from the same symbols so brute force and planner see one cost.
      const req = { ...randomCase(rand), cost: parseManaCost(symbols) };
      const plan = planPayment(req);
      const expected = bruteMinLife(req, symbols);
      if (plan === null) {
        nulls++;
        expect(expected, `${seed}/${n} ${symbols} returned null but a payment exists`).toBe(
          Number.POSITIVE_INFINITY,
        );
        continue;
      }
      paid++;
      expect(
        expected,
        `${seed}/${n} ${symbols} planner paid but brute force says impossible`,
      ).toBeLessThan(Number.POSITIVE_INFINITY);
      // Minimal life, within what is available.
      expect(plan.lifePaid).toBe(expected);
      expect(plan.lifePaid).toBeLessThanOrEqual(req.lifeAvailable);
      // Pool indices: valid, unique, usable on this spell.
      expect(new Set(plan.fromPool).size).toBe(plan.fromPool.length);
      const spentPool = plan.fromPool.map((i) => req.pool[i] as ManaObject);
      for (const m of spentPool) expect(restrictionAllows(m.restriction, req.spell)).toBe(true);
      // Taps: each object once, real source, valid outcome, restriction allowed.
      expect(new Set(plan.taps.map((t) => t.object)).size).toBe(plan.taps.length);
      const chosen = plan.taps.map((t) => {
        const source = req.sources.find(
          (s) => s.object === t.object && s.abilityIndex === t.abilityIndex,
        );
        expect(source, 'tapped source exists').toBeDefined();
        const s = source as PaymentSource;
        expect(t.outcome).toBeGreaterThanOrEqual(0);
        expect(t.outcome).toBeLessThan(s.produces.length);
        expect(restrictionAllows(s.restriction, req.spell)).toBe(true);
        return { source: s, outcome: t.outcome };
      });
      // The mana actually spent (everything produced minus leftover, plus pool) pays the cost.
      const produced = unitsOf([], chosen);
      expect(plan.leftover.length).toBeLessThanOrEqual(produced.length);
      const remaining = [...produced];
      for (const m of plan.leftover) {
        const at = remaining.findIndex((u) => u.color === m.color && u.snow === m.snow);
        expect(at, 'leftover mana was produced by a tapped source').toBeGreaterThanOrEqual(0);
        remaining.splice(at, 1);
        const owner = chosen.find((c) => c.source.object === m.source);
        expect(owner, 'leftover names a tapped source').toBeDefined();
        expect(m.restriction).toEqual(owner?.source.restriction);
      }
      const spent = [...spentPool.map((m) => ({ color: m.color, snow: m.snow })), ...remaining];
      expect(
        minLife(symbols, req.x, spent),
        `${seed}/${n} ${symbols} plan does not pay`,
      ).toBeLessThanOrEqual(plan.lifePaid);
    }
    expect(paid + nulls).toBe(40);
  });

  test('the generator exercises both outcomes', () => {
    const rand = unitLcg(4242);
    let paid = 0;
    let nulls = 0;
    for (let n = 0; n < 150; n++) {
      if (planPayment(randomCase(rand)) === null) nulls++;
      else paid++;
    }
    expect(paid).toBeGreaterThan(20);
    expect(nulls).toBeGreaterThan(20);
  });
});
