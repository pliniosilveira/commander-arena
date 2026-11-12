/**
 * Mana payment planner (SPEC 4.2 "Payment planner", SPEC 17.1 A5). A pure helper shared by the
 * UI's auto-pay and the AI: given a cost, the pool and the available mana sources it finds which
 * pool mana to spend and which sources to tap, or reports that the cost cannot be paid.
 *
 * Model. Every symbol of the cost (CR 107.4) becomes a demand: a colored symbol wants mana of
 * that color, {S} wants mana from a snow source (CR 107.4h), generic wants any mana. A hybrid
 * symbol (CR 107.4e) or Phyrexian symbol (CR 107.4f) is first resolved to one of its options,
 * which gives a small number of "profiles" (a demand vector plus life paid). For each profile an
 * exact dynamic program over (source, remaining demand) decides which sources to tap with which
 * outcome and which produced mana pays which demand. The best plan over all profiles under the
 * preference order below is returned, so the planner never reports null when a payment exists
 * and never returns a plan that does not pay.
 *
 * Preference order (lexicographic, first difference wins):
 *   1. least life paid for Phyrexian mana,
 *   2. fewest sacrifice-tier sources tapped,
 *   3. least reserve loss (how many `reserve` colors the tapped sources could have produced),
 *   4. fewest tapped sources whose ability has an extra effect (a pain land hurting its controller),
 *   5. fewest Improvise artifacts and Delve cards used (they exist only as extra sources, `abilityIndex < 0`, in
 *      the artifact tier: real mana sources come first; a Convoke creature stays an ordinary creature-tier source),
 *   6. fewest creature-tier sources tapped (a creature is kept for combat),
 *   7. least produced mana left over (waste from multi-mana outcomes),
 *   8. least flexibility lost (issue 18): the number of colors the tapped sources could have made, so a
 *      colorless land or rock (Sol Ring, Wastes) is tapped before a colored land, a basic before a land that
 *      makes two colors, and any-color mana last,
 *   9. fewest artifact-tier, then land-tier sources tapped (a land before a rock of the same flexibility),
 *  10. fewest unrestricted pool mana spent (restricted pool mana is spent first),
 *  11. determinism: among exact ties the earliest object id, then ability index, then outcome.
 * Pool mana is free in every tier component, so it is spent before any source is tapped.
 * A source object is never tapped twice, even if it has several mana abilities (all of them
 * need the permanent untapped), so abilities of one object are alternatives to each other.
 *
 * Mana abilities that cost mana ("{1}, {T}: Add {U}{B}", a Signet). The planner supports exactly
 * ONE level of them. A costed ability may be used only when its cost is paid from pool mana or
 * from sources whose own abilities have no mana cost, and its own mana never pays for itself or
 * for another costed ability: a Signet cannot be started with a Signet's mana. This keeps the
 * model a single exact search. Each subset of the costed sources (at most `MAX_COSTED`) is tried
 * as "these are activated": their activation costs join the demand as a second set of dimensions
 * (`ACT_BASE` onward) that only free mana can pay, their outputs pay the ordinary dimensions, and
 * a source in the subset that ends up unused invalidates that subset (it is mandatory). The best
 * plan over all subsets under the order above wins, so a plan that needs a Signet is found
 * whenever one exists, and one that does not need it never taps it (artifacts come after lands).
 * A hybrid symbol in a costed ability's cost (a filter land, "{R/W}, {T}: Add {R}{R}, {R}{W}, or
 * {W}{W}", CR 107.4e) is paid with either half: each way of choosing the halves is its own demand
 * for the subset (`activationDemands`), and the best plan over them wins. What a source makes is
 * one of its `produces` outcomes, so a combination ("{R}{R}, {R}{W} or {W}{W}") and a choice of
 * color are both just several outcomes; the plan names the one it uses. Chains of costed abilities (a Signet paid by a Signet) are not planned; with the one-level rule
 * auto-pay may report "cannot pay" where a player could pay by hand.
 */
import type { Color } from '../characteristics';
import type { ObjectId } from '../ids';
import { activationDemands, costedCandidates, hasCost, selections } from './costed';

export type { PaymentRequest, PaymentSource };

import {
  ACT_BASE,
  ACT_GENERIC,
  COLOR_DIMS,
  compareObjectIds,
  DIMS,
  GENERIC_DIM,
  type PaymentRequest,
  type PaymentSource,
  SNOW_DIM,
  TOTAL_DIMS,
} from './payment-shared';
import { restrictionAllows } from './pool';
import type { HybridOption, ManaColor, ManaCost, ManaObject, ManaRestriction } from './types';

export interface PaymentPlan {
  /** Indices into request.pool that are spent. */
  readonly fromPool: readonly number[];
  /** Sources to tap; `outcome` indexes PaymentSource.produces. */
  readonly taps: readonly { object: ObjectId; abilityIndex: number; outcome: number }[];
  readonly lifePaid: number;
  /**
   * Mana produced by the tapped sources that the cost did not consume, shaped like pool mana
   * (the source's snow flag and restriction). The caller adds it to the pool (CR 106.4).
   * Unspent mana already in the pool is not listed here.
   */
  readonly leftover: readonly ManaObject[];
  /**
   * D-183: the mana this plan spends on `request.cost` itself, one entry for each, with the card types of the permanent that made it (empty
   * when they are not known). The mana that pays the activation cost of a costed mana ability is not listed (it is spent on the ability,
   * CR 605.3a) and neither is mana the cost did not consume. "The amount of mana spent to cast it" reads its length.
   */
  readonly spentTypes: readonly (readonly string[])[];
  /** D-260: how many of the mana in `spentTypes` was made by a snow source (CR 107.4h: "for each {S} spent to cast this spell"). */
  readonly spentSnow: number;
}

// Objective vector components (lower is better, compared lexicographically).
const C_LIFE = 0;
const C_SACRIFICE = 1;
const C_RESERVE = 2;
const C_EXTRA = 3;
const C_PAYOPT = 4;
const C_CREATURE = 5;
const C_WASTE = 6;
const C_FLEX = 7;
const C_ARTIFACT = 8;
const C_LAND = 9;
const C_POOL = 10;
const COMPONENTS = 11;

const TIER_COMPONENT: Record<PaymentSource['tier'], number> = {
  sacrifice: C_SACRIFICE,
  artifact: C_ARTIFACT,
  creature: C_CREATURE,
  land: C_LAND,
};

interface Entry {
  readonly abilityIndex: number;
  readonly outcome: number;
  readonly colors: readonly ManaColor[];
  readonly snow: boolean;
  readonly restriction: ManaRestriction | null;
  /** Cost contributed by tapping with this entry, excluding waste. */
  readonly vec: readonly number[];
  /** Whether its mana may pay the activation cost of a costed ability (free sources and pool). */
  readonly payAct: boolean;
  /** Its mana pays generic mana only (`PaymentSource.genericOnly`). */
  readonly genericOnly: boolean;
  /** The card types of the permanent that makes it (D-183). */
  readonly types: readonly string[];
}

interface Item {
  /** Index into the pool for a pool item, otherwise -1. */
  readonly poolIndex: number;
  readonly object: ObjectId;
  readonly entries: readonly Entry[];
  readonly maxYield: number;
  /** A costed source chosen for this subset: the plan must use it, or the subset is invalid. */
  readonly mandatory: boolean;
}

interface Profile {
  readonly demand: readonly number[];
  readonly life: number;
}

interface Node {
  readonly cost: readonly number[];
  /** Entry index tapped, -1 to skip the item, -2 when nothing more is needed. */
  readonly choice: number;
  readonly next: number;
  /** Bit j set when unit j of the tapped outcome pays a demand (clear bits are leftover). */
  readonly usedMask: number;
  /** Bit j set when unit j pays the activation cost of a costed mana ability and not the cost of the spell (D-183). */
  readonly actMask: number;
}

const ZERO: readonly number[] = new Array<number>(COMPONENTS).fill(0);
const DONE: Node = { cost: ZERO, choice: -2, next: 0, usedMask: 0, actMask: 0 };

function less(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

function add(a: readonly number[], b: readonly number[]): number[] {
  return a.map((v, i) => v + (b[i] ?? 0));
}

function colorDim(color: ManaColor): number {
  return COLOR_DIMS.indexOf(color);
}

/** All ways to choose `count` items among `options` options, as count-per-option arrays. */
function compositions(count: number, options: number): number[][] {
  if (options === 1) return [[count]];
  const out: number[][] = [];
  for (let first = 0; first <= count; first++) {
    for (const rest of compositions(count - first, options - 1)) out.push([first, ...rest]);
  }
  return out;
}

/**
 * Resolve hybrid and Phyrexian symbols into plain demand vectors (CR 107.4e, 107.4f). Identical
 * symbols are grouped so the number of profiles stays small. Sorted by life, then discovery order.
 */
function buildProfiles(cost: ManaCost, x: number, lifeAvailable: number): Profile[] {
  const base = new Array<number>(DIMS).fill(0);
  for (const color of COLOR_DIMS) base[colorDim(color)] = cost.colored[color];
  base[SNOW_DIM] = cost.snow;
  base[GENERIC_DIM] = cost.generic + cost.x * x;

  const hybridGroups = new Map<string, { options: readonly HybridOption[]; count: number }>();
  for (const options of cost.hybrid) {
    const key = JSON.stringify(options);
    const group = hybridGroups.get(key);
    if (group) group.count += 1;
    else hybridGroups.set(key, { options, count: 1 });
  }
  const phyrexianGroups = new Map<Color, number>();
  for (const color of cost.phyrexian)
    phyrexianGroups.set(color, (phyrexianGroups.get(color) ?? 0) + 1);

  let partial: Profile[] = [{ demand: base, life: 0 }];
  for (const { options, count } of hybridGroups.values()) {
    const next: Profile[] = [];
    for (const profile of partial) {
      for (const split of compositions(count, options.length)) {
        const demand = profile.demand.slice();
        split.forEach((n, i) => {
          const option = options[i];
          if (option === undefined) return;
          if ('generic' in option)
            demand[GENERIC_DIM] = (demand[GENERIC_DIM] ?? 0) + option.generic * n;
          else demand[colorDim(option.color)] = (demand[colorDim(option.color)] ?? 0) + n;
        });
        next.push({ demand, life: profile.life });
      }
    }
    partial = next;
  }
  for (const [color, count] of phyrexianGroups) {
    const next: Profile[] = [];
    for (const profile of partial) {
      for (let byLife = 0; byLife <= count; byLife++) {
        const life = profile.life + 2 * byLife; // CR 107.4f: 2 life per Phyrexian symbol
        if (life > lifeAvailable) continue;
        const demand = profile.demand.slice();
        demand[colorDim(color)] = (demand[colorDim(color)] ?? 0) + (count - byLife);
        next.push({ demand, life });
      }
    }
    partial = next;
  }

  const seen = new Set<string>();
  const unique = partial.filter((p) => {
    const key = `${p.demand.join(',')}|${p.life}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p.life - b.p.life || a.i - b.i)
    .map(({ p }) => p);
}

function buildItems(request: PaymentRequest, selection: readonly PaymentSource[]): Item[] {
  const reserve = new Set<ManaColor>(request.reserve ?? []);
  const items: Item[] = [];

  // Pool mana first: free in every tier component (SPEC 10 "spend pool mana first").
  request.pool.forEach((mana, poolIndex) => {
    if (!restrictionAllows(mana.restriction, request.spell)) return;
    const vec = new Array<number>(COMPONENTS).fill(0);
    vec[C_POOL] = mana.restriction === null ? 1 : 0;
    items.push({
      poolIndex,
      object: mana.source,
      entries: [
        {
          abilityIndex: 0,
          outcome: 0,
          colors: [mana.color],
          snow: mana.snow,
          restriction: mana.restriction,
          vec,
          // An activation cost is paid for an ability, which restricted mana may not be spent on.
          payAct: restrictionAllows(mana.restriction, { ability: true }),
          genericOnly: false,
          types: mana.sourceTypes ?? [],
        },
      ],
      maxYield: 1,
      mandatory: false,
    });
  });

  const byObject = new Map<ObjectId, PaymentSource[]>();
  for (const source of request.sources) {
    const list = byObject.get(source.object);
    if (list) list.push(source);
    else byObject.set(source.object, [source]);
  }
  const objects = [...byObject.keys()].sort(compareObjectIds);
  for (const object of objects) {
    const all = (byObject.get(object) ?? [])
      .slice()
      .sort((a, b) => a.abilityIndex - b.abilityIndex);
    // One-level rule: a source in the selection is used through its costed ability only; any other
    // source is used through its abilities that have no mana cost.
    const chosen = selection.find((s) => s.object === object);
    const sources = chosen === undefined ? all.filter((s) => !hasCost(s)) : [chosen];
    const mandatory = chosen !== undefined;
    const reserveColors = new Set<ManaColor>();
    for (const source of sources) {
      for (const outcome of source.produces) {
        for (const color of outcome) if (reserve.has(color)) reserveColors.add(color);
      }
    }
    // Issue 18: what tapping this permanent gives up: the colors (not colorless) it could make through any of its abilities.
    const flexColors = new Set<ManaColor>();
    for (const source of sources) {
      for (const outcome of source.produces) {
        for (const color of outcome) if (color !== 'C') flexColors.add(color);
      }
    }
    const entries: Entry[] = [];
    for (const source of sources) {
      source.produces.forEach((colors, outcome) => {
        if (colors.length === 0) return;
        if (!restrictionAllows(source.restriction, request.spell)) return;
        const vec = new Array<number>(COMPONENTS).fill(0);
        vec[TIER_COMPONENT[source.tier]] = 1;
        vec[C_RESERVE] = reserveColors.size;
        vec[C_FLEX] = flexColors.size;
        vec[C_PAYOPT] = source.abilityIndex < 0 && source.tier === 'artifact' ? 1 : 0;
        vec[C_EXTRA] = source.extraEffect === true || (source.lifeLoss ?? 0) > 0 ? 1 : 0;
        entries.push({
          abilityIndex: source.abilityIndex,
          outcome,
          colors,
          snow: source.snow,
          restriction: source.restriction,
          vec,
          payAct: !mandatory && source.genericOnly !== true,
          genericOnly: source.genericOnly === true,
          types: source.types ?? [],
        });
      });
    }
    if (entries.length === 0) continue;
    items.push({
      poolIndex: -1,
      object,
      entries,
      maxYield: Math.max(...entries.map((e) => e.colors.length)),
      mandatory,
    });
  }
  return items;
}

/**
 * Ways to spend the units of one outcome on the remaining demand: each unit pays its own color,
 * a snow demand (when the source is snow), a generic demand, or is left over. Returns one entry
 * per distinct resulting state with a mask of the units that paid something.
 */
function assignUnits(
  state: readonly number[],
  entry: Entry,
  flex: readonly (readonly ManaColor[])[],
): Map<string, { state: number[]; usedMask: number; actMask: number }> {
  type Level = Map<string, { state: number[]; usedMask: number; actMask: number }>;
  let level: Level = new Map();
  level.set(state.join(','), { state: state.slice(), usedMask: 0, actMask: 0 });
  entry.colors.forEach((color, j) => {
    const nextLevel: Level = new Map();
    const put = (s: number[], used: number, act: number) => {
      const key = s.join(',');
      if (!nextLevel.has(key)) nextLevel.set(key, { state: s, usedMask: used, actMask: act });
    };
    for (const { state: s, usedMask, actMask } of level.values()) {
      // Mana that pays generic mana only (Improvise, Delve, a colorless creature's convoke).
      const dims = entry.genericOnly ? [] : [colorDim(color)];
      if (entry.snow && !entry.genericOnly) dims.push(SNOW_DIM);
      dims.push(GENERIC_DIM);
      // Mana of a source with no mana cost may instead pay an activation cost (one level only).
      if (entry.payAct) {
        dims.push(ACT_BASE + colorDim(color), ACT_GENERIC);
        // A hybrid symbol of a costed ability that this color is one half of (CR 107.4e).
        flex.forEach((colors, k) => {
          if (colors.includes(color)) dims.push(TOTAL_DIMS + k);
        });
      }
      for (const d of dims) {
        if ((s[d] ?? 0) > 0) {
          const t = s.slice();
          t[d] = (t[d] ?? 0) - 1;
          // D-183: a dimension from ACT_BASE on is the activation cost of a costed ability, not the cost of the spell.
          put(t, usedMask | (1 << j), d >= ACT_BASE ? actMask | (1 << j) : actMask);
        }
      }
      put(s, usedMask, actMask); // unit not used by the cost (leftover)
    }
    level = nextLevel;
  });
  return level;
}

interface Solution {
  readonly cost: readonly number[];
  readonly picks: { item: Item; entry: Entry; usedMask: number; actMask: number }[];
}

function solveProfile(
  items: readonly Item[],
  demand: readonly number[],
  flex: readonly (readonly ManaColor[])[],
): Solution | null {
  const radix = demand.map((d) => d + 1);
  const mult: number[] = [];
  let m = 1;
  for (const r of radix) {
    mult.push(m);
    m *= r;
  }
  const encode = (s: readonly number[]) => s.reduce((acc, v, i) => acc + v * (mult[i] ?? 0), 0);
  const decode = (code: number) => radix.map((r, i) => Math.floor(code / (mult[i] ?? 1)) % r);

  const suffixCap = new Array<number>(items.length + 1).fill(0);
  const mandatoryFrom = new Array<boolean>(items.length + 1).fill(false);
  for (let i = items.length - 1; i >= 0; i--) {
    suffixCap[i] = (suffixCap[i + 1] ?? 0) + (items[i]?.maxYield ?? 0);
    mandatoryFrom[i] = (mandatoryFrom[i + 1] ?? false) || items[i]?.mandatory === true;
  }
  const memo: Map<number, Node | null>[] = items.map(() => new Map());

  const solve = (i: number, code: number): Node | null => {
    // Nothing left to pay is only a plan if every costed source chosen for it has been used.
    if (code === 0) return mandatoryFrom[i] ? null : DONE;
    const item = items[i];
    if (item === undefined) return null;
    const table = memo[i] as Map<number, Node | null>;
    if (table.has(code)) return table.get(code) ?? null;
    const state = decode(code);
    const total = state.reduce((a, b) => a + b, 0);
    let best: Node | null = null;
    if (total <= (suffixCap[i] ?? 0)) {
      item.entries.forEach((entry, entryIndex) => {
        for (const { state: after, usedMask, actMask } of assignUnits(
          state,
          entry,
          flex,
        ).values()) {
          const afterCode = encode(after);
          if (afterCode === code) continue; // tapping without paying anything is never useful
          const sub = solve(i + 1, afterCode);
          if (sub === null) continue;
          const assigned = total - after.reduce((a, b) => a + b, 0);
          const own = entry.vec.slice();
          own[C_WASTE] = entry.colors.length - assigned;
          const cost = add(sub.cost, own);
          if (best === null || less(cost, best.cost)) {
            best = { cost, choice: entryIndex, next: afterCode, usedMask, actMask };
          }
        }
      });
      const skipped = item.mandatory ? null : solve(i + 1, code);
      // Taps are tried first and only strictly better plans replace them, so ties prefer
      // tapping earlier items (lower object id), then lower ability index and outcome.
      if (skipped !== null && (best === null || less(skipped.cost, (best as Node).cost))) {
        best = { cost: skipped.cost, choice: -1, next: code, usedMask: 0, actMask: 0 };
      }
    }
    table.set(code, best);
    return best;
  };

  const start = encode(demand);
  const root = solve(0, start);
  if (root === null) return null;
  const picks: Solution['picks'] = [];
  let code = start;
  let node: Node | null | undefined = root;
  for (let i = 0; i < items.length && code !== 0 && node; i++) {
    if (node.choice >= 0) {
      const item = items[i] as Item;
      picks.push({
        item,
        entry: item.entries[node.choice] as Entry,
        usedMask: node.usedMask,
        actMask: node.actMask,
      });
    }
    code = node.next;
    node = code === 0 ? DONE : (memo[i + 1]?.get(code) ?? null);
  }
  return { cost: root.cost, picks };
}

/**
 * Plan how to pay `request.cost`. Returns null when it cannot be paid with the pool, the sources
 * and the life available. Pure and deterministic. Throws RangeError for a negative or
 * non-integer X.
 *
 * Life. The life paid for Phyrexian mana and the `lifeLoss` of the sources a plan taps (a life cost,
 * CR 119.4, 605.3, or damage to the controller) together stay within `lifeAvailable`. The search
 * itself weighs a source with a life loss like any other extra effect (preference 4 above); when the
 * best plan goes over the budget the planner plans again with those sources left out, so a plan
 * that needs one of them is found only when the budget allows it.
 */
export function planPayment(request: PaymentRequest): PaymentPlan | null {
  if (!Number.isInteger(request.x) || request.x < 0) {
    throw new RangeError(`X must be a non-negative integer, got ${request.x}`);
  }
  const plan = planOnce(request);
  if (plan === null) return null;
  const lossOf = new Map<string, number>();
  for (const s of request.sources) lossOf.set(`${s.object}#${s.abilityIndex}`, s.lifeLoss ?? 0);
  const spent = plan.taps.reduce(
    (n, t) => n + (lossOf.get(`${t.object}#${t.abilityIndex}`) ?? 0),
    plan.lifePaid,
  );
  if (spent <= request.lifeAvailable) return plan;
  return planOnce({
    ...request,
    sources: request.sources.filter((s) => (s.lifeLoss ?? 0) === 0),
  });
}

function planOnce(request: PaymentRequest): PaymentPlan | null {
  const profiles = buildProfiles(request.cost, request.x, request.lifeAvailable);
  let best: { solution: Solution; life: number } | null = null;
  // Each subset of costed abilities is a separate search (the empty one first); see the header.
  for (const selection of selections(costedCandidates(request))) {
    const items = buildItems(request, selection);
    // CR 107.4e: a hybrid symbol in a costed ability's cost is paid with either half.
    const { flex, vectors } = activationDemands(selection);
    for (const activation of vectors) {
      for (const profile of profiles) {
        if (best !== null && profile.life > best.life) break; // profiles are sorted by life
        const solution = solveProfile(items, [...profile.demand, ...activation], flex);
        if (solution === null) continue;
        const cost = solution.cost.slice();
        cost[C_LIFE] = profile.life;
        if (best === null || less(cost, best.solution.cost)) {
          best = { solution: { cost, picks: solution.picks }, life: profile.life };
        }
      }
    }
  }
  if (best === null) return null;

  const fromPool: number[] = [];
  const taps: { object: ObjectId; abilityIndex: number; outcome: number }[] = [];
  const leftover: ManaObject[] = [];
  const spentTypes: (readonly string[])[] = [];
  let spentSnow = 0;
  for (const { item, entry, usedMask, actMask } of best.solution.picks) {
    // D-183: a unit that is used and does not pay the activation cost of a costed ability is spent on the cost of the spell.
    entry.colors.forEach((_, j) => {
      if ((usedMask & (1 << j)) === 0 || (actMask & (1 << j)) !== 0) return;
      spentTypes.push(entry.types);
      if (entry.snow) spentSnow += 1;
    });
    if (item.poolIndex >= 0) {
      fromPool.push(item.poolIndex);
      continue;
    }
    taps.push({ object: item.object, abilityIndex: entry.abilityIndex, outcome: entry.outcome });
    entry.colors.forEach((color, j) => {
      if ((usedMask & (1 << j)) === 0) {
        leftover.push({
          color,
          snow: entry.snow,
          source: item.object,
          restriction: entry.restriction,
          ...(entry.types.length === 0 ? {} : { sourceTypes: entry.types }),
        });
      }
    });
  }
  fromPool.sort((a, b) => a - b);
  return { fromPool, taps, lifePaid: best.life, leftover, spentTypes, spentSnow };
}
