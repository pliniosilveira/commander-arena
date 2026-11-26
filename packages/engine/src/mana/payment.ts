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
import { classCombinations } from './any-combination';
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
  /** Sources to tap; `outcome` indexes PaymentSource.produces (for a source with `anyCombination`, the number of the combination the plan tried). */
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
  /** Issue 310 (Converge, CR 105.1, 106.1): the color of each mana in `spentTypes`, in the same order (`C` for colorless mana, which is no color). */
  readonly spentColors: readonly ManaColor[];
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
  /** The source the entry is an outcome of, numbered within the items: the entries of one source share their cost vector and flags (`distinctEntries`). */
  readonly source: number;
  /** The payment source itself (none for pool mana): `distinctEntries` keeps its results for it across plans. */
  readonly from?: PaymentSource;
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
  /** Its mana can't pay generic mana (`ManaRestriction` `notGeneric`, CR 106.6): never a generic demand of the cost nor of an activation cost, only a colored symbol. */
  readonly notGeneric: boolean;
  /** The card types of the permanent that makes it (D-183). */
  readonly types: readonly string[];
  /** Issue 144 (CR 609.4b): its mana of a color pays any colored symbol of the spell, as the spell may be paid with mana as though it were of any color. */
  readonly anyColor: boolean;
  /** Grell Philosopher (CR 609.4b): only its blue mana pays any colored symbol of the cost. */
  readonly blueAnyColor: boolean;
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

/**
 * A set of unit indexes of one outcome, as a linked list: adding a unit costs one node and the set has no size limit (an outcome
 * can make more than 31 mana, which a 32-bit mask cannot hold; issue 634).
 */
type UnitSet = { readonly unit: number; readonly rest: UnitSet } | null;

const unitsOf = (set: UnitSet): ReadonlySet<number> => {
  const units = new Set<number>();
  for (let n = set; n !== null; n = n.rest) units.add(n.unit);
  return units;
};

interface Node {
  readonly cost: readonly number[];
  /** Entry index tapped, -1 to skip the item, -2 when nothing more is needed. */
  readonly choice: number;
  readonly next: number;
  /** The units of the tapped outcome that pay a demand (the others are leftover). */
  readonly used: UnitSet;
  /** The units that pay the activation cost of a costed mana ability and not the cost of the spell (D-183). */
  readonly act: UnitSet;
}

const ZERO: readonly number[] = new Array<number>(COMPONENTS).fill(0);
const DONE: Node = { cost: ZERO, choice: -2, next: 0, used: null, act: null };

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
function buildProfiles(
  cost: ManaCost,
  x: number,
  lifeAvailable: number,
  anyType = false,
): Profile[] {
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

  // D-351, CR 609.4b: mana of any type can be spent as though it were mana of any type, so a demand for a color (or for colorless) is met by any mana: it is generic.
  // (The snow demand is the source's, not the mana's type.)
  if (anyType) {
    partial = partial.map((profile) => {
      const demand = profile.demand.slice();
      for (const color of COLOR_DIMS) {
        const dim = colorDim(color);
        demand[GENERIC_DIM] = (demand[GENERIC_DIM] ?? 0) + (demand[dim] ?? 0);
        demand[dim] = 0;
      }
      return { demand, life: profile.life };
    });
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

/**
 * Issue 144 (CR 602.2b): "Spend only mana of the chosen color to activate this ability": the mana of any other color is left out of the plan. `null` is a color nobody chose,
 * which no mana is.
 */
function onlyColorOf(request: PaymentRequest): ManaColor | null | undefined {
  return 'ability' in request.spell ? request.spell.onlyColor : undefined;
}

function spendsAnyColor(request: PaymentRequest): boolean {
  return 'anyColor' in request.spell && request.spell.anyColor === true;
}

/** Grell Philosopher (CR 609.4b): only blue mana is spent as though it were mana of any color. */
function spendsBlueAsAnyColor(request: PaymentRequest): boolean {
  return 'ability' in request.spell && request.spell.blueAsAnyColor === true;
}

/** What `buildItems` needs to build the combinations of an "any combination" source for the cost: the most demand on each dimension over every way to pay it, and the hybrid halves. */
interface Demanded {
  readonly envelope: readonly number[];
  readonly flex: readonly (readonly ManaColor[])[];
}

function buildItems(
  request: PaymentRequest,
  selection: readonly PaymentSource[],
  demanded: Demanded,
): Item[] {
  const reserve = new Set<ManaColor>(request.reserve ?? []);
  const items: Item[] = [];
  const only = onlyColorOf(request);
  let sourceCount = 0;

  // Pool mana first: free in every tier component (SPEC 10 "spend pool mana first").
  request.pool.forEach((mana, poolIndex) => {
    if (!restrictionAllows(mana.restriction, request.spell)) return;
    if (only !== undefined && mana.color !== only) return;
    const vec = new Array<number>(COMPONENTS).fill(0);
    vec[C_POOL] = mana.restriction === null ? 1 : 0;
    items.push({
      poolIndex,
      object: mana.source,
      entries: [
        {
          abilityIndex: 0,
          source: -1,
          outcome: 0,
          colors: [mana.color],
          snow: mana.snow,
          restriction: mana.restriction,
          vec,
          // An activation cost is paid for an ability, which restricted mana may not be spent on.
          payAct: restrictionAllows(
            mana.restriction,
            'ability' in request.spell ? request.spell : { ability: true },
          ),
          genericOnly: false,
          notGeneric: mana.restriction?.kind === 'notGeneric',
          types: mana.sourceTypes ?? [],
          anyColor: spendsAnyColor(request),
          blueAnyColor: spendsBlueAsAnyColor(request),
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
      const sourceNumber = sourceCount;
      sourceCount += 1;
      const makeEntry = (
        colors: readonly ManaColor[],
        outcome: number,
        from: PaymentSource,
      ): Entry => {
        const vec = new Array<number>(COMPONENTS).fill(0);
        vec[TIER_COMPONENT[source.tier]] = 1;
        vec[C_RESERVE] = reserveColors.size;
        vec[C_FLEX] = flexColors.size;
        vec[C_PAYOPT] = source.abilityIndex < 0 && source.tier === 'artifact' ? 1 : 0;
        vec[C_EXTRA] =
          source.weighExtraByLife === true
            ? (source.lifeLoss ?? 0)
            : source.extraEffect === true ||
                (source.lifeLoss ?? 0) > 0 ||
                (source.energyCost ?? 0) > 0
              ? 1
              : 0;
        return {
          abilityIndex: source.abilityIndex,
          source: sourceNumber,
          from,
          outcome,
          colors,
          snow: source.snow,
          restriction: source.restriction,
          vec,
          payAct: !mandatory && source.genericOnly !== true,
          genericOnly: source.genericOnly === true,
          notGeneric: source.restriction?.kind === 'notGeneric',
          types: source.types ?? [],
          anyColor: spendsAnyColor(request),
          blueAnyColor: spendsBlueAsAnyColor(request),
        };
      };
      const usable = (colors: readonly ManaColor[]): boolean =>
        colors.length > 0 &&
        restrictionAllows(source.restriction, request.spell) &&
        (only === undefined || colors.every((c) => c === only));
      if (source.anyCombination === undefined) {
        source.produces.forEach((colors, outcome) => {
          if (usable(colors)) entries.push(makeEntry(colors, outcome, source));
        });
        continue;
      }
      // Issue 632: one combination for each class of outcome against this cost. The entries are kept for this request only (a fresh `from`): which combinations
      // there are, and so their numbers, depend on the demand.
      const from = { ...source };
      const proto = makeEntry([], 0, from);
      const colorsOf = COLOR_DIMS.slice(0, 5).map((color) => unitDims(proto, color, demanded.flex));
      const shared = colorsOf[0]?.filter((d) => colorsOf.every((dims) => dims.includes(d))) ?? [];
      const own = colorsOf.map((dims) =>
        dims
          .filter((d) => !shared.includes(d) && (demanded.envelope[d] ?? 0) > 0)
          .sort((x, y) => x - y),
      );
      const keys: string[] = [];
      const caps: number[] = [];
      const kindOfColor = own.map((dims) => {
        const key = dims.join('.');
        let kind = keys.indexOf(key);
        if (kind < 0) {
          kind = keys.length;
          keys.push(key);
          caps.push(dims.reduce((n, d) => n + (demanded.envelope[d] ?? 0), 0));
        }
        return kind;
      });
      classCombinations(source.anyCombination, kindOfColor, caps).forEach((colors, outcome) => {
        if (usable(colors)) entries.push(makeEntry(colors, outcome, from));
      });
    }
    if (entries.length === 0) continue;
    // A loop, not a spread: "X mana in any combination of colors" can have more outcomes than one call takes as arguments (issue 632).
    let maxYield = 0;
    for (const entry of entries) maxYield = Math.max(maxYield, entry.colors.length);
    items.push({
      poolIndex: -1,
      object,
      entries,
      maxYield,
      mandatory,
    });
  }
  return items;
}

/** The demands one unit of mana of `color` from `entry` may pay (`assignUnits`), before leaving it over. */
function unitDims(
  entry: Entry,
  color: ManaColor,
  flex: readonly (readonly ManaColor[])[],
): number[] {
  // Mana that pays generic mana only (Improvise, Delve, a colorless creature's convoke).
  const dims = entry.genericOnly ? [] : [colorDim(color)];
  // CR 609.4b (issue 144): mana as though it were mana of any color pays a symbol of any color, not {C}; colorless mana is no color.
  if (
    (entry.anyColor || (entry.blueAnyColor && color === 'U')) &&
    !entry.genericOnly &&
    color !== 'C'
  ) {
    for (const other of COLOR_DIMS) {
      if (other !== 'C' && other !== color) dims.push(colorDim(other));
    }
  }
  if (entry.snow && !entry.genericOnly) dims.push(SNOW_DIM);
  if (!entry.notGeneric) dims.push(GENERIC_DIM);
  // Mana of a source with no mana cost may instead pay an activation cost (one level only).
  if (entry.payAct) {
    dims.push(ACT_BASE + colorDim(color));
    if (!entry.notGeneric) dims.push(ACT_GENERIC);
    // A hybrid symbol of a costed ability that this color is one half of (CR 107.4e).
    flex.forEach((colors, k) => {
      if (colors.includes(color)) dims.push(TOTAL_DIMS + k);
    });
  }
  return dims;
}

/**
 * The entries among `among` (indices into the item's entries, in order) worth trying against the remaining demand `state` (issue 632). `assignUnits` gives each unit one of the open
 * demands it may pay or leaves it over, so what an entry can reach depends only on how many units it has of each kind (the open demands a
 * unit may pay), and no more units of a kind are ever used than those demands add up to: the rest are left over whatever happens. Two
 * entries of the same source (so the same cost vector and flags), with as many units, that have the same count of each kind once capped
 * that way reach the same remaining demands with as much mana left over, so they offer the same plans at the same cost: the later one can
 * never be strictly better (`solve` keeps the first of equal plans) and is left out, which changes no plan. "Add X mana in any combination
 * of colors" has C(X + 4, 4) outcomes, but against a demand of a few mana only a few of them differ.
 */
function distinctEntries(
  item: Item,
  among: readonly number[],
  state: readonly number[],
  flex: readonly (readonly ManaColor[])[],
): number[] {
  // By source: the kind of a unit of each color (the open demands it may pay) and, by kind, how many units could be used at most.
  const shapes = new Map<number, { kindOfColor: number[]; caps: number[] }>();
  const shapeOf = (entry: Entry): { kindOfColor: number[]; caps: number[] } => {
    let shape = shapes.get(entry.source);
    if (shape === undefined) {
      const keys: string[] = [];
      const caps: number[] = [];
      const kindOfColor: number[] = [];
      for (const color of COLOR_DIMS) {
        const dims = unitDims(entry, color, flex)
          .filter((d) => (state[d] ?? 0) > 0)
          .sort((x, y) => x - y);
        const key = dims.join('.');
        let kind = keys.indexOf(key);
        if (kind < 0) {
          kind = keys.length;
          keys.push(key);
          caps.push(dims.reduce((n, d) => n + (state[d] ?? 0), 0));
        }
        kindOfColor.push(kind);
      }
      shape = { kindOfColor, caps };
      shapes.set(entry.source, shape);
    }
    return shape;
  };
  // The key of an entry is its number of units and its capped count of each kind, as the digits of one number in base `maxYield + 1` (a
  // count is at most `maxYield`), within each source; a string when that number could pass the safe integers.
  const base = item.maxYield + 1;
  const seen = new Map<number, Set<number | string>>();
  const perKind = COLOR_DIMS.map(() => 0);
  const kept: number[] = [];
  for (const index of among) {
    const entry = item.entries[index] as Entry;
    const { kindOfColor, caps } = shapeOf(entry);
    perKind.fill(0);
    const counts = colorCounts(entry.colors);
    for (let c = 0; c < counts.length; c += 1) {
      const kind = kindOfColor[c] as number;
      perKind[kind] = (perKind[kind] ?? 0) + (counts[c] ?? 0);
    }
    let key: number | string = entry.colors.length;
    if (base ** (caps.length + 1) <= Number.MAX_SAFE_INTEGER) {
      for (let k = 0; k < caps.length; k += 1) {
        key = key * base + Math.min(perKind[k] ?? 0, caps[k] ?? 0);
      }
    } else {
      key = `${key}#${caps.map((cap, k) => Math.min(perKind[k] ?? 0, cap)).join(',')}`;
    }
    let keys = seen.get(entry.source);
    if (keys === undefined) {
      keys = new Set();
      seen.set(entry.source, keys);
    }
    if (keys.has(key)) continue;
    keys.add(key);
    kept.push(index);
  }
  return kept;
}

const countsOf = new WeakMap<readonly ManaColor[], readonly number[]>();

/** How many units of each type (in the order of `COLOR_DIMS`) an outcome holds, kept for the outcome: the payment sources of a state are kept, and so are their outcomes. */
function colorCounts(colors: readonly ManaColor[]): readonly number[] {
  let counts = countsOf.get(colors);
  if (counts === undefined) {
    const fresh = COLOR_DIMS.map(() => 0);
    for (const color of colors) {
      const c = colorDim(color);
      fresh[c] = (fresh[c] ?? 0) + 1;
    }
    counts = fresh;
    countsOf.set(colors, counts);
  }
  return counts;
}

/**
 * Ways to spend the units of one outcome on the remaining demand: each unit pays its own color,
 * a snow demand (when the source is snow), a generic demand, or is left over. Returns one entry
 * per distinct resulting state with the set of the units that paid something.
 */
function assignUnits(
  state: readonly number[],
  entry: Entry,
  flex: readonly (readonly ManaColor[])[],
  encode: (s: readonly number[]) => number,
): Map<number, { state: number[]; used: UnitSet; act: UnitSet }> {
  // A state is keyed by `solveProfile`'s number for the remaining demand.
  type Level = Map<number, { state: number[]; used: UnitSet; act: UnitSet }>;
  let level: Level = new Map();
  level.set(encode(state), { state: state.slice(), used: null, act: null });
  entry.colors.forEach((color, j) => {
    const nextLevel: Level = new Map();
    const put = (s: number[], used: UnitSet, act: UnitSet) => {
      const key = encode(s);
      if (!nextLevel.has(key)) nextLevel.set(key, { state: s, used, act });
    };
    const dims = unitDims(entry, color, flex);
    for (const { state: s, used, act } of level.values()) {
      for (const d of dims) {
        if ((s[d] ?? 0) > 0) {
          const t = s.slice();
          t[d] = (t[d] ?? 0) - 1;
          // D-183: a dimension from ACT_BASE on is the activation cost of a costed ability, not the cost of the spell.
          put(t, { unit: j, rest: used }, d >= ACT_BASE ? { unit: j, rest: act } : act);
        }
      }
      put(s, used, act); // unit not used by the cost (leftover)
    }
    level = nextLevel;
  });
  return level;
}

/** The entries of one source within an item: a run of its entries, in order. */
interface EntryGroup {
  readonly from: PaymentSource | undefined;
  /** What the entries' kept outcomes depend on besides the demand: their flags, the hybrid halves and the request's `only` color. */
  readonly key: string;
  readonly indices: readonly number[];
  readonly indexOfOutcome: ReadonlyMap<number, number>;
}

/** The outcomes `distinctEntries` keeps for a source, by `EntryGroup.key` and the capped demand (issue 632). */
const keptOutcomes = new WeakMap<PaymentSource, Map<string, readonly number[]>>();

function entryGroups(
  item: Item,
  flex: readonly (readonly ManaColor[])[],
  only: string,
): EntryGroup[] {
  const out: {
    from: PaymentSource | undefined;
    key: string;
    indices: number[];
    indexOfOutcome: Map<number, number>;
  }[] = [];
  item.entries.forEach((entry, index) => {
    let group = out.at(-1);
    if (group === undefined || item.entries[index - 1]?.source !== entry.source) {
      group = {
        from: entry.from,
        key: `${only}|${JSON.stringify(flex)}|${entry.genericOnly}|${entry.notGeneric}|${entry.snow}|${entry.payAct}|${entry.anyColor}|${entry.blueAnyColor}`,
        indices: [],
        indexOfOutcome: new Map(),
      };
      out.push(group);
    }
    group.indices.push(index);
    group.indexOfOutcome.set(entry.outcome, index);
  });
  return out;
}

interface Solution {
  readonly cost: readonly number[];
  readonly picks: { item: Item; entry: Entry; used: UnitSet; act: UnitSet }[];
}

function solveProfile(
  items: readonly Item[],
  demand: readonly number[],
  flex: readonly (readonly ManaColor[])[],
  only: string,
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
  // `distinctEntries` of each item, by the demand capped at the most mana one of its entries makes (a demand past that caps no count further).
  // It is found for each source of the item and kept for the source (`keptOutcomes`) under everything else it depends on: the flags of its
  // entries, the hybrid halves `flex`, and `only`, which decides which of its outcomes are entries.
  const tried: Map<string, readonly number[]>[] = items.map(() => new Map());
  const groups: (readonly EntryGroup[] | undefined)[] = items.map(() => undefined);
  const entriesToTry = (i: number, item: Item, state: readonly number[]): readonly number[] => {
    if (item.entries.length === 1) return [0];
    const capped = state.map((v) => Math.min(v, item.maxYield));
    const cappedKey = `${item.maxYield}|${capped.join(',')}`;
    const table = tried[i] as Map<string, readonly number[]>;
    const hit = table.get(cappedKey);
    if (hit !== undefined) return hit;
    let itemGroups = groups[i];
    if (itemGroups === undefined) {
      itemGroups = entryGroups(item, flex, only);
      groups[i] = itemGroups;
    }
    // The groups are runs of the entries in order, so their kept entries, one group after the other, are in order too.
    const kept: number[] = [];
    for (const group of itemGroups) {
      if (group.from === undefined || group.indices.length === 1) {
        for (const index of group.indices) kept.push(index);
        continue;
      }
      let byKey = keptOutcomes.get(group.from);
      if (byKey === undefined) {
        byKey = new Map();
        keptOutcomes.set(group.from, byKey);
      }
      const outcomesOf = (indices: readonly number[]): number[] =>
        indices.map((index) => (item.entries[index] as Entry).outcome);
      // First against the whole demand of the profile, which every remaining demand is at most: entries alike there are alike against any
      // remaining demand too (fewer open demands only merge kinds, and lower caps only cap more), so the second step, against `state`,
      // starts from the first step's survivors and keeps what it would keep from all the entries.
      const whole = demand.map((v) => Math.min(v, item.maxYield));
      const firstKey = `${group.key}|${item.maxYield}|${whole.join(',')}`;
      let first = byKey.get(firstKey);
      if (first === undefined) {
        first = outcomesOf(distinctEntries(item, group.indices, whole, flex));
        byKey.set(firstKey, first);
      }
      const key = `${group.key}|${cappedKey}`;
      let outcomes = byKey.get(key);
      if (outcomes === undefined) {
        const among = first.map((outcome) => group.indexOfOutcome.get(outcome) as number);
        outcomes = outcomesOf(distinctEntries(item, among, capped, flex));
        byKey.set(key, outcomes);
      }
      for (const outcome of outcomes) kept.push(group.indexOfOutcome.get(outcome) as number);
    }
    table.set(cappedKey, kept);
    return kept;
  };

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
      for (const entryIndex of entriesToTry(i, item, state)) {
        const entry = item.entries[entryIndex] as Entry;
        for (const { state: after, used, act } of assignUnits(
          state,
          entry,
          flex,
          encode,
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
            best = { cost, choice: entryIndex, next: afterCode, used, act };
          }
        }
      }
      const skipped = item.mandatory ? null : solve(i + 1, code);
      // Taps are tried first and only strictly better plans replace them, so ties prefer
      // tapping earlier items (lower object id), then lower ability index and outcome.
      if (skipped !== null && (best === null || less(skipped.cost, (best as Node).cost))) {
        best = { cost: skipped.cost, choice: -1, next: code, used: null, act: null };
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
        used: node.used,
        act: node.act,
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
  const energyOf = new Map<string, number>();
  for (const s of request.sources) energyOf.set(`${s.object}#${s.abilityIndex}`, s.energyCost ?? 0);
  const energySpent = plan.taps.reduce(
    (n, t) => n + (energyOf.get(`${t.object}#${t.abilityIndex}`) ?? 0),
    0,
  );
  const withinEnergy = energySpent <= (request.energyAvailable ?? 0);
  if (spent <= request.lifeAvailable && withinEnergy) return plan;
  // CR 107.14, 118.3: a source that costs energy is left out when the plan would pay more than the player has.
  return planOnce({
    ...request,
    sources: request.sources.filter(
      (s) =>
        (spent > request.lifeAvailable ? (s.lifeLoss ?? 0) === 0 : true) &&
        (withinEnergy ? true : (s.energyCost ?? 0) === 0),
    ),
  });
}

/** The units of mana a profile asks the sources for: its colored, snow and generic demands (not the activation costs of costed abilities). */
function demandUnits(demand: readonly number[]): number {
  let n = 0;
  for (let i = 0; i < DIMS; i += 1) n += demand[i] ?? 0;
  return n;
}

/** The most demand on each dimension, over every profile of the cost and every way to pay the activation costs: what no search below asks for more of. */
function demandEnvelope(
  profiles: readonly Profile[],
  vectors: readonly (readonly number[])[],
): number[] {
  const envelope: number[] = [];
  for (const profile of profiles) {
    for (const vector of vectors) {
      [...profile.demand, ...vector].forEach((v, i) => {
        envelope[i] = Math.max(envelope[i] ?? 0, v);
      });
    }
  }
  return envelope;
}

function planOnce(request: PaymentRequest): PaymentPlan | null {
  const profiles = buildProfiles(
    request.cost,
    request.x,
    request.lifeAvailable,
    'anyType' in request.spell && request.spell.anyType === true,
  );
  // Every unit of mana pays exactly one demand (`assignUnits`), so a cost with more mana in its cheapest profile than the pool and every
  // source could ever make cannot be paid: the search below is skipped (the common case of a player with no mana to spare).
  let supply = request.pool.length;
  for (const source of request.sources) {
    let most = 0;
    for (const outcome of source.produces) if (outcome.length > most) most = outcome.length;
    supply += most;
  }
  if (profiles.every((profile) => demandUnits(profile.demand) > supply)) return null;
  let best: { solution: Solution; life: number } | null = null;
  // Each subset of costed abilities is a separate search (the empty one first); see the header.
  for (const selection of selections(costedCandidates(request))) {
    // CR 107.4e: a hybrid symbol in a costed ability's cost is paid with either half.
    const { flex, vectors } = activationDemands(selection);
    const items = buildItems(request, selection, {
      envelope: demandEnvelope(profiles, vectors),
      flex,
    });
    for (const activation of vectors) {
      for (const profile of profiles) {
        if (best !== null && profile.life > best.life) break; // profiles are sorted by life
        const solution = solveProfile(
          items,
          [...profile.demand, ...activation],
          flex,
          String(onlyColorOf(request)),
        );
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
  const spentColors: ManaColor[] = [];
  let spentSnow = 0;
  for (const { item, entry, used, act } of best.solution.picks) {
    const usedUnits = unitsOf(used);
    const actUnits = unitsOf(act);
    // D-183: a unit that is used and does not pay the activation cost of a costed ability is spent on the cost of the spell.
    entry.colors.forEach((color, j) => {
      if (!usedUnits.has(j) || actUnits.has(j)) return;
      spentTypes.push(entry.types);
      spentColors.push(color);
      if (entry.snow) spentSnow += 1;
    });
    if (item.poolIndex >= 0) {
      fromPool.push(item.poolIndex);
      continue;
    }
    taps.push({ object: item.object, abilityIndex: entry.abilityIndex, outcome: entry.outcome });
    entry.colors.forEach((color, j) => {
      if (!usedUnits.has(j)) {
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
  return { fromPool, taps, lifePaid: best.life, leftover, spentTypes, spentSnow, spentColors };
}
