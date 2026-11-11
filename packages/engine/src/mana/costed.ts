/**
 * Mana abilities that cost mana ("{1}, {T}: Add {U}{B}"), as the payment planner sees them. The
 * one-level rule is explained in the header of payment.ts; this file picks which of the costed
 * sources a search treats as "activated" and what their costs add to the demand. A hybrid symbol in
 * such a cost ("{R/W}, {T}: Add {R}{R}, {R}{W}, or {W}{W}", CR 107.4e) is paid with either of its
 * halves, so a selection has one demand per way of choosing the halves.
 */
import {
  ACT_BASE,
  ACT_GENERIC,
  COLOR_DIMS,
  compareObjectIds,
  DIMS,
  MAX_COSTED,
  type PaymentRequest,
  type PaymentSource,
  TOTAL_DIMS,
} from './payment-shared';
import type { HybridOption, ManaColor, ManaCost } from './types';

/** True when the cost is only generic, colored and hybrid mana, the part the planner can plan. */
function isPlainCost(cost: ManaCost): boolean {
  return cost.x === 0 && cost.snow === 0 && cost.phyrexian.length === 0;
}

/** Whether activating the source costs any mana at all (a cost the planner cannot plan counts). */
export function hasCost(source: PaymentSource): boolean {
  const cost = source.cost;
  if (cost === undefined) return false;
  const colored = COLOR_DIMS.reduce((n, c) => n + cost.colored[c], 0);
  const other = cost.snow + cost.x + cost.hybrid.length + cost.phyrexian.length;
  return cost.generic + colored + other > 0;
}

/** Adds one chosen half of a hybrid symbol to a demand on the activation dimensions. */
function addOption(demand: readonly number[], option: HybridOption): number[] {
  const next = demand.slice();
  const dim = 'generic' in option ? ACT_GENERIC - ACT_BASE : COLOR_DIMS.indexOf(option.color);
  next[dim] = (next[dim] ?? 0) + ('generic' in option ? option.generic : 1);
  return next;
}

/** The colors of a hybrid symbol whose halves are both a color ({R/W}, {C/W}), else null. */
function colorHalves(options: readonly HybridOption[]): ManaColor[] | null {
  const colors: ManaColor[] = [];
  for (const option of options) {
    if ('generic' in option) return null;
    colors.push(option.color);
  }
  return colors;
}

/** What a selection asks of the free mana that pays for its activations. */
export interface ActivationDemand {
  /**
   * The colors that may pay each hybrid class: the activation dimensions after `TOTAL_DIMS` (one for
   * each distinct pair of colors, "{R/W}" or "{W/R}" being the same class), in order of first use.
   */
  readonly flex: readonly (readonly ManaColor[])[];
  /** Demand per dimension from `ACT_BASE` on: the activation colors, generic, then the classes. */
  readonly vectors: number[][];
}

/**
 * The activation costs of the sources in `selection` as demand on the activation dimensions (CR
 * 107.4e for hybrid symbols). A hybrid symbol of two colors ({R/W}) is one unit of demand in a class
 * dimension that a unit of either color pays, so the search chooses the half; a symbol with a generic
 * half ({2/W}) is one vector for each way of choosing (the first half of each symbol first, without
 * repeats: n identical symbols have n + 1 outcomes, not 2^n). A selection with no such symbol has
 * exactly one vector.
 */
export function activationDemands(selection: readonly PaymentSource[]): ActivationDemand {
  const width = TOTAL_DIMS - DIMS;
  const base = new Array<number>(width).fill(0);
  const flex: ManaColor[][] = [];
  const flexCounts: number[] = [];
  const choices: (readonly HybridOption[])[] = [];
  for (const source of selection) {
    const cost = source.cost;
    if (cost === undefined) continue;
    for (const [i, color] of COLOR_DIMS.entries()) base[i] = (base[i] ?? 0) + cost.colored[color];
    base[ACT_GENERIC - ACT_BASE] = (base[ACT_GENERIC - ACT_BASE] ?? 0) + cost.generic;
    for (const options of cost.hybrid) {
      const colors = colorHalves(options);
      if (colors === null) {
        choices.push(options);
        continue;
      }
      const key = colors.slice().sort().join('');
      let k = flex.findIndex((c) => c.slice().sort().join('') === key);
      if (k < 0) {
        k = flex.length;
        flex.push(colors);
        flexCounts.push(0);
      }
      flexCounts[k] = (flexCounts[k] ?? 0) + 1;
    }
  }
  let vectors: number[][] = [[...base, ...flexCounts]];
  for (const options of choices) {
    const seen = new Set<string>();
    const next: number[][] = [];
    for (const vector of vectors) {
      for (const option of options) {
        const choice = addOption(vector, option);
        const key = choice.join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(choice);
      }
    }
    vectors = next;
  }
  return { flex, vectors };
}

/**
 * The costed sources that may be activated, lowest object id first, one per ability. A source
 * whose cost the planner cannot plan (hybrid, Phyrexian, snow, X) is left out.
 */
export function costedCandidates(request: PaymentRequest): PaymentSource[] {
  return request.sources
    .filter((s) => hasCost(s) && s.cost !== undefined && isPlainCost(s.cost))
    .sort((a, b) => compareObjectIds(a.object, b.object) || a.abilityIndex - b.abilityIndex)
    .slice(0, MAX_COSTED);
}

/** Every subset of the candidates with at most one ability per object, smallest mask first. */
export function selections(candidates: readonly PaymentSource[]): PaymentSource[][] {
  const out: PaymentSource[][] = [];
  for (let mask = 0; mask < 1 << candidates.length; mask++) {
    const chosen = candidates.filter((_, i) => (mask & (1 << i)) !== 0);
    if (new Set(chosen.map((s) => s.object)).size === chosen.length) out.push(chosen);
  }
  return out;
}
