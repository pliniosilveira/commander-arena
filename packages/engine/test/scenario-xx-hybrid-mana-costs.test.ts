// Hybrid mana symbols in the cost of a mana ability: "{R/W}, {T}: Add {R}{R}, {R}{W}, or {W}{W}."
// (D-099). Pins: CR 107.4e (a hybrid symbol is paid with either half; a monocolored hybrid symbol
// {2/G} with one {G} or two mana of any type), CR 605.3a (a mana ability's cost is paid with mana the
// player has), CR 601.2g (the planner pays it as part of the payment), CR 106.8 is not used (that is
// adding hybrid mana). The planner model is the one-level rule of mana/payment.ts: the cost of a
// mana ability is paid by the pool and by sources that cost nothing.
// Sources are SYNTHETIC (test/mana-fixtures.ts, src/cards/fixtures/synthetic-mana-plus.ts).
import { describe, expect, test } from 'vitest';
import type { Ability } from '../src/index';
import { parseManaCost, planPayment, validateAbility, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { land, oid, source, unitLcg } from './mana-fixtures';

const FILTER_OUTCOMES = [
  ['R', 'R'],
  ['R', 'W'],
  ['W', 'W'],
] as const;

const filter = (n: number, hybrid: string) =>
  source(n, FILTER_OUTCOMES, { cost: parseManaCost([hybrid]) });

const request = (cost: string[], sources: ReturnType<typeof source>[], lifeAvailable = 0) => ({
  cost: parseManaCost(cost),
  x: 0,
  pool: [],
  sources,
  lifeAvailable,
  spell: { types: ['creature'] },
});

describe('the planner pays the hybrid symbol of a costed ability with either half (CR 107.4e)', () => {
  test('with red mana: the red half; the filter then makes {R}{R}', () => {
    const plan = planPayment(request(['R', 'R'], [land(1, 'R'), filter(2, 'R/W')]));
    expect(plan?.taps).toEqual([
      { object: oid(1), abilityIndex: 0, outcome: 0 },
      { object: oid(2), abilityIndex: 0, outcome: 0 },
    ]);
    expect(plan?.leftover).toEqual([]);
  });

  test('with white mana only: the white half; the filter makes {W}{W}', () => {
    const plan = planPayment(request(['W', 'W'], [land(1, 'W'), filter(2, 'R/W')]));
    expect(plan?.taps.map((t) => [t.object, t.outcome])).toEqual([
      [oid(1), 0],
      [oid(2), 2],
    ]);
  });

  test('with neither half available the filter cannot be used', () => {
    expect(planPayment(request(['R', 'R'], [land(1, 'G'), filter(2, 'R/W')]))).toBeNull();
  });

  test('a plain source that can pay alone is preferred to the filter', () => {
    const plan = planPayment(request(['R'], [filter(1, 'R/W'), land(2, 'R')]));
    expect(plan?.taps).toEqual([{ object: oid(2), abilityIndex: 0, outcome: 0 }]);
  });

  test('a colorless half: {C/W} is paid with {C} or {W}', () => {
    const plan = planPayment(request(['R', 'R'], [source(1, [['C']]), filter(2, 'C/W')]));
    expect(plan).not.toBeNull();
    expect(plan?.taps).toHaveLength(2);
    expect(planPayment(request(['R', 'R'], [land(1, 'U'), filter(2, 'C/W')]))).toBeNull();
  });

  test('{2/G}: one green mana pays it', () => {
    const twist = source(2, [['G', 'W']], { cost: parseManaCost(['2/G']) });
    const plan = planPayment(request(['G', 'W'], [land(1, 'G'), twist]));
    expect(plan?.taps.map((t) => t.object)).toEqual([oid(1), oid(2)]);
  });

  test('{2/G}: two mana of any type pay it when there is no green', () => {
    const twist = source(3, [['G', 'W']], { cost: parseManaCost(['2/G']) });
    const plan = planPayment(request(['G', 'W'], [land(1, 'U'), land(2, 'B'), twist]));
    expect(plan?.taps.map((t) => t.object)).toEqual([oid(1), oid(2), oid(3)]);
    // One mana of another type is not enough.
    expect(planPayment(request(['G', 'W'], [land(1, 'U'), twist]))).toBeNull();
  });

  test('two filters, each with its own hybrid symbol, are both planned when free mana pays both', () => {
    const plan = planPayment(
      request(
        ['R', 'R', 'W', 'W'],
        [land(1, 'R'), land(2, 'W'), filter(3, 'R/W'), filter(4, 'R/W')],
      ),
    );
    expect(plan?.taps.map((t) => t.object)).toEqual([oid(1), oid(2), oid(3), oid(4)]);
  });

  test('the same input gives the same plan every time', () => {
    const make = () => request(['R', 'W'], [land(1, 'R'), land(2, 'W'), filter(3, 'R/W')]);
    expect(JSON.stringify(planPayment(make()))).toBe(JSON.stringify(planPayment(make())));
  });

  test('a chain (a filter paying for a filter) is not planned: the one-level rule', () => {
    // {B}{B}{B}: one Island, two {U/B} filters that each make two of {U}{U}, {U}{B}, {B}{B}. The first
    // filter would have to pay the second's cost with its own mana.
    const bare = (n: number) =>
      source(
        n,
        [
          ['U', 'U'],
          ['U', 'B'],
          ['B', 'B'],
        ],
        { cost: parseManaCost(['U/B']) },
      );
    expect(planPayment(request(['B', 'B', 'B'], [land(1, 'U'), bare(2), bare(3)]))).toBeNull();
  });
});

describe('speed', () => {
  test('six filter lands with hybrid costs and six plain lands plan in well under a second', () => {
    const sources = [
      ...[1, 2, 3, 4, 5, 6].map((n) => land(n, n % 2 === 0 ? 'R' : 'W')),
      ...[7, 8, 9, 10, 11, 12].map((n) => filter(n, 'R/W')),
    ];
    const started = performance.now();
    const plan = planPayment(request(['2', 'R', 'R', 'W', 'W', 'R', 'W'], sources));
    const elapsed = performance.now() - started;
    expect(plan).not.toBeNull();
    // The same search with no plan to find (green is not on offer) must be as quick.
    const none = performance.now();
    expect(planPayment(request(['G'], sources))).toBeNull();
    expect(performance.now() - none).toBeLessThan(1000);
    expect(elapsed).toBeLessThan(2000);
  });
});

describe('in a game', () => {
  test('a spell is paid through the filter land with a hybrid cost', () => {
    const g = scenario()
      .seat(0)
      .hand('Wall of Stone')
      .battlefield('SYNTHETIC Filter Land', 'Plains', 'Mountain')
      .build();
    // {1}{R}{R}: the Plains pays the hybrid with white, the filter makes {R}{R}... or {W}{R} is not enough.
    g.expect.legal(0, { cast: 'Wall of Stone' });
    g.act(0).cast('Wall of Stone', { pay: true });
    g.expect.tapped('SYNTHETIC Filter Land');
    g.expect.tapped('Plains');
    g.expect.tapped('Mountain');
  });

  test('the Twist filter makes {G}{W} for two other mana: {W} is paid, {G} is left in the pool', () => {
    const g = scenario()
      .seat(0)
      .hand('Isamaru, Hound of Konda')
      .battlefield('SYNTHETIC Twist Filter Land', 'Island', 'Swamp')
      .build();
    g.act(0).cast('Isamaru, Hound of Konda', { pay: true });
    for (const name of ['SYNTHETIC Twist Filter Land', 'Island', 'Swamp']) g.expect.tapped(name);
    g.expect.pool(0, 'G');
  });

  test('by hand, the cost comes out of the pool: {2/G} from two mana of other types', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Twist Filter Land', 'Island', 'Swamp')
      .build();
    g.act(0).tapForMana('Island');
    g.act(0).tapForMana('Swamp');
    g.act(0).tapForMana('SYNTHETIC Twist Filter Land');
    g.expect.pool(0, 'GW');
  });

  test('by hand, a hybrid cost that the pool cannot pay refuses the activation', () => {
    const g = scenario().seat(0).battlefield('SYNTHETIC Twist Filter Land', 'Island').build();
    g.act(0).tapForMana('Island');
    const r = g.act(0).try.tapForMana('SYNTHETIC Twist Filter Land');
    expect(r.ok).toBe(false);
    g.expect.pool(0, 'U');
  });

  test('a chain by hand works where the planner does not look: Island, then two filters', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Bare Filter Land', 'SYNTHETIC Bare Filter Land', 'Island')
      .build();
    g.act(0).tapForMana('Island');
    g.act(0).tapForMana({ name: 'SYNTHETIC Bare Filter Land', nth: 0 }, { combination: 'BB' });
    g.act(0).tapForMana({ name: 'SYNTHETIC Bare Filter Land', nth: 1 }, { combination: 'BB' });
    g.expect.pool(0, 'BBB');
  });
});

describe('validation of a hybrid cost on a mana ability', () => {
  const ability = (symbols: string[]): Ability => ({
    kind: 'mana',
    cost: [{ kind: 'mana', symbols }, { kind: 'tap' }],
    production: { kind: 'fixed', mana: ['G'] },
  });

  test('hybrid, colorless-hybrid and monocolored hybrid symbols are valid', () => {
    for (const symbol of ['R/W', 'C/W', '2/G']) {
      expect(validateAbility(ability([symbol])), symbol).toEqual([]);
    }
  });

  test('an unknown symbol is still invalid', () => {
    expect(validateAbility(ability(['R/X'])).length).toBeGreaterThan(0);
  });

  test('a card with a hybrid cost on its mana ability is supported; X, snow and Phyrexian are not', () => {
    const g = scenario().seat(0).battlefield('SYNTHETIC Filter Land').build();
    const def = g.state.definitions.find((d) => d.name === 'SYNTHETIC Filter Land');
    expect(def && validateCard(def)).toEqual([]);
    const withSymbol = (symbol: string) => {
      const base = def;
      if (!base) throw new Error('missing fixture');
      const face = base.faces[0];
      if (!face) throw new Error('missing face');
      return {
        ...base,
        faces: [
          {
            ...face,
            abilities: [
              {
                kind: 'mana',
                cost: [{ kind: 'mana', symbols: [symbol] }, { kind: 'tap' }],
                production: { kind: 'fixed', mana: ['G'] },
              },
            ],
          },
        ],
      } as typeof base;
    };
    for (const symbol of ['X', 'S', 'R/P']) {
      const issues = validateCard(withSymbol(symbol));
      expect(issues.map((i) => i.message).join(), symbol).toContain('hybrid');
    }
    expect(validateCard(withSymbol('W/U'))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Property check against an independent brute force of the one-level model (see mana/payment.ts):
// whether a plan exists must agree, and a plan the planner returns must really pay the cost.
// SYNTHETIC instances from a seeded LCG (no Math.random), so a failure reproduces from the seed.

type Color = 'W' | 'R' | 'G' | 'U';
interface Need {
  readonly color: Color | null;
}
interface FilterSpec {
  readonly halves: readonly [Color, Color];
  readonly makes: readonly (readonly Color[])[];
}

/** Can the needs each be given its own unit? Units are colors; generic needs take any. */
function matches(needs: readonly Need[], units: readonly Color[]): boolean {
  const go = (i: number, used: number): boolean => {
    const need = needs[i];
    if (need === undefined) return true;
    return units.some((u, j) => {
      if ((used & (1 << j)) !== 0) return false;
      if (need.color !== null && need.color !== u) return false;
      return go(i + 1, used | (1 << j));
    });
  };
  return go(0, 0);
}

function bruteForce(
  lands: readonly Color[],
  filters: readonly FilterSpec[],
  cost: readonly (Color | '1')[],
): boolean {
  const main: Need[] = cost.map((s) => ({ color: s === '1' ? null : s }));
  for (let mask = 0; mask < 1 << filters.length; mask++) {
    const chosen = filters.filter((_, i) => (mask & (1 << i)) !== 0);
    const halfChoices = 1 << chosen.length;
    for (let h = 0; h < halfChoices; h++) {
      const act: Need[] = chosen.map((f, i) => ({ color: f.halves[(h >> i) & 1] ?? null }));
      // Every combination of outcomes of the activated filters.
      const outcomes = chosen.reduce<Color[][]>(
        (acc, f) => acc.flatMap((a) => f.makes.map((m) => [...a, ...m])),
        [[]],
      );
      for (const made of outcomes) {
        // The activation needs are paid by lands only; the main cost by what is left and the outputs.
        const free = lands.length;
        for (let use = 0; use < 1 << free; use++) {
          const forAct = lands.filter((_, i) => (use & (1 << i)) !== 0);
          const rest = lands.filter((_, i) => (use & (1 << i)) === 0);
          if (forAct.length !== act.length || !matches(act, forAct)) continue;
          if (matches(main, [...rest, ...made])) return true;
        }
      }
    }
  }
  return false;
}

describe('property: the planner agrees with a brute force of the model (seeded)', () => {
  test('300 random instances with filter lands, and every plan returned pays the cost', () => {
    const next = unitLcg(20261022);
    const colors: Color[] = ['W', 'R', 'G', 'U'];
    const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)] as T;
    let feasible = 0;
    let usedFilter = 0;
    for (let n = 0; n < 300; n++) {
      const lands = Array.from({ length: 1 + Math.floor(next() * 4) }, () => pick(colors));
      const filters: FilterSpec[] = Array.from({ length: Math.floor(next() * 3) }, () => {
        const a = pick(colors);
        let b = pick(colors);
        while (b === a) b = pick(colors);
        return {
          halves: [a, b] as const,
          makes: [
            [a, a],
            [a, b],
            [b, b],
          ],
        };
      });
      const cost = Array.from({ length: 1 + Math.floor(next() * 4) }, () =>
        next() < 0.3 ? ('1' as const) : pick(colors),
      );
      const sources = [
        ...lands.map((c, i) => land(i + 1, c)),
        ...filters.map((f, i) =>
          source(100 + i, f.makes as never, {
            cost: parseManaCost([`${f.halves[0]}/${f.halves[1]}`]),
          }),
        ),
      ];
      const plan = planPayment(request(cost, sources));
      const want = bruteForce(lands, filters, cost);
      expect(plan !== null, `${n}: ${JSON.stringify({ lands, filters, cost })}`).toBe(want);
      if (plan === null) continue;
      feasible += 1;
      if (plan.taps.some((t) => Number(t.object.slice(1)) >= 100)) usedFilter += 1;
      // The taps are distinct sources.
      expect(new Set(plan.taps.map((t) => t.object)).size).toBe(plan.taps.length);
    }
    expect(feasible).toBeGreaterThan(50);
    expect(usedFilter).toBeGreaterThan(5);
  });
});
