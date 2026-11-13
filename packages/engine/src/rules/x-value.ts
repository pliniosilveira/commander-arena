/**
 * X in costs (CR 107.3, D-103): what a cost's X is made of, how it is paid once announced, and how
 * the largest value a player could pay is found.
 *
 * CR 107.3a: if a spell or activated ability has an {X} in its mana cost, alternative cost,
 * additional cost or activation cost, and the text does not define X, its controller announces X as
 * the spell is cast or the ability activated (CR 601.2b, 602.2b). While it is on the stack every X in
 * its costs equals the announced value. So the total cost (CR 601.2f) holds X generic mana for each
 * {X} of the mana cost, X life for each "pay X life" and X cards of the hand to discard for each "discard X cards"
 * (D-1190, provisional). Cost reductions apply to the total, which
 * already has X in it (`rules/cast-cost.ts`).
 */
import type { CastAlternativeKind } from '../ast/features';
import type { Cost } from '../ast/types';
import type { CardFace } from '../cards/definition';
import { manaSymbolsOf, namedAlternativeCostOf } from './alt-costs';

/** How much each point of X costs: generic mana (one per {X} symbol) and life ("pay X life"). */
export interface XCost {
  readonly mana: number;
  readonly life: number;
  /** Loyalty counters for each point of X ("[-X]", CR 606.5, D-200); absent for none. */
  readonly loyalty?: number;
  /** Cards of the hand for each point of X ("discard X cards", CR 701.9, D-1190); absent for none. */
  readonly discard?: number;
}

export const NO_X: XCost = { mana: 0, life: 0 };

/**
 * The largest X the engine offers. A player could pay more only with more than a thousand mana, or
 * life, to spare; the search below stops here so it always ends.
 */
export const MAX_X = 1000;

/** How many {X} symbols a list of mana symbols has. */
export function xSymbolCount(symbols: readonly string[]): number {
  return symbols.filter((s) => s === 'X').length;
}

/**
 * The mana symbols of a cost with every {X} paid as `x` generic mana for each (CR 107.3a: two {X}
 * make 2X). The generic mana takes the place of the first {X}; with X = 0 the symbols vanish.
 */
export function withX(symbols: readonly string[], x: number): string[] {
  const count = xSymbolCount(symbols);
  if (count === 0) return [...symbols];
  const rest = symbols.filter((s) => s !== 'X');
  return x === 0 ? rest : [String(count * x), ...rest];
}

/** What one point of X costs in an activated ability's cost (CR 602.2b). */
export function abilityXCost(costs: readonly Cost[]): XCost {
  let mana = 0;
  let life = 0;
  let loyalty = 0;
  for (const c of costs) {
    if (c.kind === 'mana') mana += xSymbolCount(c.symbols);
    else if (c.kind === 'payXLife') life += 1;
    else if (c.kind === 'loyalty' && c.change === 'x') loyalty += 1;
  }
  return loyalty === 0 ? { mana, life } : { mana, life, loyalty };
}

/**
 * What one point of X costs for a spell cast as `alternative` (CR 107.3a): the {X} of its mana cost
 * when that is what is paid, and the "pay X life" of its additional costs. A spell cast without
 * paying its mana cost, or by paying a flashback cost, has no {X} to pay: its X is 0 and nothing is
 * announced (CR 107.3b, 107.3g). A spell cast for its miracle cost pays that cost instead, and the {X} in it (once, or as many
 * times as the cost has it) is the X announced (D-274, CR 107.3a: any X in an alternative cost is announced as the spell is cast).
 */
export function spellXCost(
  face: CardFace | null,
  alternative: CastAlternativeKind | undefined,
): XCost {
  if (face === null) return NO_X;
  const life = (face.additionalCosts ?? []).filter((c) => c.kind === 'payXLife').length;
  // D-1190 (CR 107.3a): "discard X cards" is an additional cost, announced like "pay X life" and paid whatever way the spell is cast.
  const discard = (face.additionalCosts ?? []).filter((c) => c.kind === 'discardX').length;
  const extra = discard > 0 ? { discard } : {};
  if (alternative === 'miracle') {
    return {
      mana: xSymbolCount(manaSymbolsOf(namedAlternativeCostOf(face, 'miracle') ?? [])),
      life,
      ...extra,
    };
  }
  const printed = xSymbolCount(face.manaCost ?? []);
  if (alternative !== undefined && printed > 0) return NO_X;
  return { mana: printed, life, ...extra };
}

/** Whether announcing X means anything: the cost has an {X} or a "pay X life". */
export function hasX(cost: XCost): boolean {
  return cost.mana + cost.life + (cost.loyalty ?? 0) + (cost.discard ?? 0) > 0;
}

/**
 * The largest X for which `canPay(X)` holds, given that it holds for 0 and that paying more X is
 * never easier than paying less (the cost only grows with X). Doubles until X cannot be paid, then
 * narrows down, so a player with many mana sources costs a few checks, not one per point. Never more
 * than `MAX_X`.
 */
export function largestPayableX(canPay: (x: number) => boolean): number {
  let paid = 0;
  let failed = 1;
  while (failed <= MAX_X && canPay(failed)) {
    paid = failed;
    failed *= 2;
  }
  failed = Math.min(failed, MAX_X + 1);
  while (failed - paid > 1) {
    const mid = Math.floor((paid + failed) / 2);
    if (canPay(mid)) paid = mid;
    else failed = mid;
  }
  return paid;
}
