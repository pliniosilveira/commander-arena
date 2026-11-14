// Property check of the payment planner with mana-cost abilities (a Signet: "{1}, {T}: Add {U}{B}")
// against an independent brute force of the ONE-LEVEL model written in mana/payment.ts: a costed
// ability is activated only when its cost is paid from pool mana or from sources that have no mana
// cost, and its own mana pays only the main cost. SYNTHETIC instances from a seeded LCG (no
// Math.random), so a failure reproduces from the seed. CR 605.3a, 118.3, 106.6.
import { describe, expect, test } from 'vitest';
import { parseManaCost, planPayment } from '../src/mana/index';
import type { PaymentSource } from '../src/mana/payment';
import type { ManaColor, ManaObject } from '../src/mana/types';
import { mana, oid, source, unitLcg } from './mana-fixtures';

const COLORS: ManaColor[] = ['W', 'U', 'B', 'R', 'G'];

/** A unit of mana: `act` when it may pay an activation cost (free sources and unrestricted pool). */
interface Unit {
  color: ManaColor;
  act: boolean;
}
interface Need {
  /** A color, or null for generic. */
  color: ManaColor | null;
  act: boolean;
}

/** Can every need be given its own matching unit? (Plain depth-first matching, tiny inputs.) */
function canPay(needs: readonly Need[], units: readonly Unit[]): boolean {
  const go = (i: number, used: number): boolean => {
    const need = needs[i];
    if (need === undefined) return true;
    return units.some((u, j) => {
      if ((used & (1 << j)) !== 0) return false;
      if (need.act && !u.act) return false;
      if (need.color !== null && need.color !== u.color) return false;
      return go(i + 1, used | (1 << j));
    });
  };
  return go(0, 0);
}

const needsOf = (symbols: readonly string[], act: boolean): Need[] =>
  symbols.flatMap((s): Need[] =>
    /^\d+$/.test(s)
      ? Array.from({ length: Number(s) }, () => ({ color: null, act }))
      : [{ color: s as ManaColor, act }],
  );

interface Instance {
  pool: { color: ManaColor; restricted: boolean }[];
  lands: ManaColor[][][]; // the outcomes of each land, each a list of mana
  signets: { cost: string; makes: ManaColor[][] }[]; // outcomes of each Signet (cost "1" or a color)
  cost: string[];
}

/**
 * Brute force: is there a choice of lands to tap (and their colors), a subset of Signets (and
 * their outcomes) such that the Signets' costs are paid by pool and land mana and the cost by the
 * rest plus the Signets' mana? `must` forces exactly these Signets (by index) to be activated.
 */
function feasible(inst: Instance, must?: { signets: number[]; lands: (number | null)[] }): boolean {
  const poolUnits: Unit[] = inst.pool.map((p) => ({ color: p.color, act: !p.restricted }));
  const landChoices = inst.lands.map((outcomes, i) =>
    must ? [must.lands[i] ?? null] : [null, ...outcomes.keys()],
  );
  const signetChoices = inst.signets.map((s, i) =>
    must ? (must.signets.includes(i) ? [...s.makes.keys()] : [null]) : [null, ...s.makes.keys()],
  );
  const go = (li: number, si: number, units: Unit[], sigUnits: Unit[], act: Need[]): boolean => {
    if (li < inst.lands.length) {
      for (const choice of landChoices[li] ?? [null]) {
        const outcome = choice === null ? null : inst.lands[li]?.[choice];
        const next = outcome
          ? [...units, ...outcome.map((color) => ({ color, act: true }))]
          : units;
        if (go(li + 1, si, next, sigUnits, act)) return true;
      }
      return false;
    }
    if (si < inst.signets.length) {
      for (const choice of signetChoices[si] ?? [null]) {
        const signet = inst.signets[si];
        if (choice === null || signet === undefined) {
          if (go(li, si + 1, units, sigUnits, act)) return true;
          continue;
        }
        const out = (signet.makes[choice] ?? []).map((color) => ({ color, act: false }));
        const needs = needsOf([signet.cost], true);
        if (go(li, si + 1, units, [...sigUnits, ...out], [...act, ...needs])) return true;
      }
      return false;
    }
    // Activation costs and the main cost are matched together: a unit pays one of them only.
    return canPay([...act, ...needsOf(inst.cost, false)], [...units, ...sigUnits]);
  };
  return go(0, 0, poolUnits, [], []);
}

function build(inst: Instance) {
  const sources: PaymentSource[] = [];
  let n = 1;
  for (const outcomes of inst.lands) sources.push(source(n++, outcomes));
  for (const s of inst.signets) {
    sources.push(source(n++, s.makes, { tier: 'artifact', cost: parseManaCost([s.cost]) }));
  }
  const pool: ManaObject[] = inst.pool.map((p) =>
    mana(p.color, {
      restriction: p.restricted ? { kind: 'spellTypes', types: ['instant'] } : null,
    }),
  );
  return planPayment({
    cost: parseManaCost(inst.cost),
    x: 0,
    pool,
    sources,
    lifeAvailable: 0,
    spell: { types: ['instant'] },
  });
}

function random(seed: number): Instance {
  const next = unitLcg(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)] as T;
  const count = (max: number) => Math.floor(next() * (max + 1));
  const inst: Instance = { pool: [], lands: [], signets: [], cost: [] };
  for (let i = count(2); i > 0; i -= 1) {
    inst.pool.push({ color: pick(COLORS), restricted: next() < 0.3 });
  }
  for (let i = count(4); i > 0; i -= 1) {
    inst.lands.push(next() < 0.25 ? [[pick(COLORS)], [pick(COLORS)]] : [[pick(COLORS)]]);
  }
  for (let i = count(2); i > 0; i -= 1) {
    const cost = next() < 0.6 ? '1' : pick(COLORS);
    const makes: ManaColor[][] =
      next() < 0.3 ? [[pick(COLORS)], [pick(COLORS)]] : [[pick(COLORS), pick(COLORS)]];
    inst.signets.push({ cost, makes });
  }
  for (let i = 1 + count(3); i > 0; i -= 1) inst.cost.push(pick(['1', '1', '2', ...COLORS]));
  return inst;
}

describe('planner and brute force agree on the one-level model', () => {
  test('a plan exists exactly when the brute force finds a payment', () => {
    let withSignet = 0;
    let paid = 0;
    for (let seed = 1; seed <= 600; seed += 1) {
      const inst = random(seed);
      const plan = build(inst);
      const feasibleNow = feasible(inst);
      expect(plan !== null, `seed ${seed}: ${JSON.stringify(inst)}`).toBe(feasibleNow);
      if (plan === null) continue;
      paid += 1;
      const tappedObjects = new Set(plan.taps.map((t) => t.object));
      const signetIndexes = inst.signets.flatMap((_, i) =>
        tappedObjects.has(oid(inst.lands.length + 1 + i)) ? [i] : [],
      );
      if (signetIndexes.length > 0) withSignet += 1;
      // The plan's own taps pay: the same brute force restricted to exactly what it tapped.
      const landChoice = inst.lands.map((_outcomes, i) => {
        const tap = plan.taps.find((t) => t.object === oid(i + 1));
        return tap === undefined ? null : tap.outcome;
      });
      const restricted: Instance = {
        ...inst,
        pool: inst.pool.filter((_, i) => plan.fromPool.includes(i)),
      };
      expect(
        feasible(restricted, { signets: signetIndexes, lands: landChoice }),
        `seed ${seed}: the plan does not pay ${JSON.stringify(inst)} ${JSON.stringify(plan)}`,
      ).toBe(true);
      // A source is tapped once, and a plan never taps a Signet it does not need to.
      expect(tappedObjects.size).toBe(plan.taps.length);
    }
    // The generator reaches the interesting cases, so the agreement above means something.
    expect(paid).toBeGreaterThan(100);
    expect(withSignet).toBeGreaterThan(20);
  });
});
