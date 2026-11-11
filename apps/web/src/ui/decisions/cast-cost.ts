/**
 * The cost a card in the hand or the command zone has now (CR 601.2f, D-095). `ObjectView.castCost`
 * is the front face's mana cost after commander tax and cost reductions: the cost the engine would
 * ask, which differs from the printed one when a tax or a reduction applies. Kicker, additional
 * costs and alternative costs are not in it. Pure, so the labels and the card frame share it.
 */
import type { ObjectView } from '@commander-arena/engine';

/** "{1}{R}"; "{0}" for a cost reduced to nothing (the empty cost). */
export function symbolsText(symbols: readonly string[]): string {
  return symbols.length === 0 ? '{0}' : symbols.map((s) => `{${s}}`).join('');
}

/** How many {X} the symbols hold: {X}{X} is 2 (CR 107.3, D-103). */
export function xCount(symbols: readonly string[]): number {
  return symbols.filter((s) => s === 'X').length;
}

/**
 * A cost with an {X} the way a player reads it, since its real size depends on the X chosen as it is
 * cast: "X + {1}{R}", "2X + {U}" for {X}{X}{U}, "X" for {X} alone. A cost without X reads as
 * `symbolsText`.
 */
export function costText(symbols: readonly string[]): string {
  const xs = xCount(symbols);
  if (xs === 0) return symbolsText(symbols);
  const rest = symbols.filter((s) => s !== 'X');
  const x = xs === 1 ? 'X' : `${xs}X`;
  return rest.length === 0 ? x : `${x} + ${symbolsText(rest)}`;
}

/**
 * The mana cost with X announced as `x` (CR 107.3a, 601.2f): each {X} becomes `x` generic mana, added
 * to the generic mana already in the cost, generic first as the engine locks it in. Commander tax,
 * reductions and kicker are not part of it. {X} announced as 0 and nothing else is the empty cost.
 */
export function withX(symbols: readonly string[], x: number): readonly string[] {
  const generic = symbols.reduce(
    (sum, s) => sum + (s === 'X' ? x : /^\d+$/.test(s) ? Number(s) : 0),
    0,
  );
  const rest = symbols.filter((s) => s !== 'X' && !/^\d+$/.test(s));
  return generic > 0 ? [String(generic), ...rest] : rest;
}

/** True for a card in the hand or the command zone whose cost has an {X}: its cost is chosen as it is cast. */
export function costsX(card: ObjectView | undefined): boolean {
  if (card === undefined || card.layout === 'split') return false;
  return xCount(card.castCost ?? card.manaCost ?? []) > 0;
}

/** The hover text of an {X} cost that no tax or reduction changed; null for a card without {X}. */
export function xCostTitle(card: ObjectView): string | null {
  if (!costsX(card) || castCostChanged(card)) return null;
  return `Costs ${costText(card.castCost ?? card.manaCost ?? [])}. You choose X as you cast it, up to what you can pay.`;
}

/** The printed mana cost of the front face: the cost `castCost` is compared with. */
function printedCost(card: ObjectView): readonly string[] | null {
  return card.faces?.[0]?.manaCost ?? card.manaCost;
}

/**
 * True when the engine's cost for casting the front face differs from the printed one (a commander
 * tax, a reduction, an increase). A split card shows both halves in its `manaCost`, so it is never
 * compared; nothing is guessed for it.
 */
export function castCostChanged(card: ObjectView | undefined): boolean {
  if (card?.castCost === undefined || card.layout === 'split') return false;
  const printed = printedCost(card);
  return printed !== null && symbolsText(printed) !== symbolsText(card.castCost);
}

/** The cost to show on a card: the cost now when it changed, else the printed one. */
export function shownCost(card: ObjectView): readonly string[] | null {
  return castCostChanged(card) ? (card.castCost ?? null) : card.manaCost;
}

/** "Costs {1}{R} now (printed {3}{R})", the hover text of a changed cost; null when unchanged. */
export function costNowTitle(card: ObjectView): string | null {
  if (!castCostChanged(card) || card.castCost === undefined) return null;
  const printed = printedCost(card);
  return `Costs ${costText(card.castCost)} now (printed ${printed === null ? 'none' : symbolsText(printed)}). Commander tax and cost reductions are included.`;
}

/**
 * " for {1}{R}" when casting costs something other than the printed cost, " for X + {R}" when the
 * cost has an {X} (the real cost depends on the X chosen); "" otherwise.
 */
export function castCostSuffix(card: ObjectView | undefined): string {
  if (card === undefined || card.castCost === undefined) return '';
  if (card.layout === 'split') return '';
  return castCostChanged(card) || costsX(card) ? ` for ${costText(card.castCost)}` : '';
}
