/** The cast button of a named alternative cost (D-121), from the card's `alternativeCosts`. */
import type { ObjectView } from '@commander-arena/engine';
import { ALTERNATIVE_NAMES, type NamedAlternative } from '../../game/alt-cost';
import { tappedWhat } from '../../game/cost-text';
import { foretellCost } from '../../game/later-text';
import { symbolsText, withX } from './cast-cost';
import { plural } from './lookup';

/**
 * "Overload {3}{R}{R}", the cast button of a named alternative: the keyword and the cost it has now
 * (`ObjectView.alternativeCosts`). A card whose view lists no such cost (it cannot happen for an
 * option the engine offers) gets the keyword alone rather than a guessed cost. The view appends a
 * commander tax as its own generic symbol ({1}{R}{2}); the label adds it to the generic mana, as a
 * player counts ({3}{R}). A named alternative has no {X}, so `withX` only merges. Escape (D-124)
 * says what else it costs: "Escape {G}{G}{U}{U}, exile 5 other cards" (`exile` is the count).
 */
export function alternativeLabel(kind: NamedAlternative, card: ObjectView | undefined): string {
  const entry = card?.alternativeCosts?.find((c) => c.kind === kind);
  if (entry === undefined) return ALTERNATIVE_NAMES[kind];
  // D-149 (CR 118.9): "Cast for {W}, tapping four creatures with flying".
  if (kind === 'tapPermanents') return tapAlternativeLabel(entry);
  const label = `${ALTERNATIVE_NAMES[kind]} ${symbolsText(withX(entry.cost, 0))}`;
  return entry.exile === undefined ? label : `${label}, exile ${plural(entry.exile, 'other card')}`;
}

/**
 * "Cast for {W}, tapping four creatures with flying", "Cast by tapping four creatures" (no mana): the cast button of the alternative
 * cost that taps permanents (`AlternativeCostView.tap`). The count and the filter are the card's, read from the view.
 */
export function tapAlternativeLabel(
  entry: NonNullable<ObjectView['alternativeCosts']>[number],
): string {
  const { tap } = entry;
  if (tap === undefined) return ALTERNATIVE_NAMES.tapPermanents;
  // "four untapped creatures you control with flying": the cast says the creatures are tapped, and whose they are is plain.
  const what = tappedWhat(tap.filter, tap.count)
    .replace(' untapped', '')
    .replace(' you control', '');
  const mana = withX(entry.cost, 0);
  return mana.length === 0
    ? `Cast by tapping ${what}`
    : `Cast for ${symbolsText(mana)}, tapping ${what}`;
}

/** "Cast for {R}": the button of a foretold card, from its `alternativeCosts` (D-128). */
export function foretellCastLabel(card: ObjectView | undefined): string {
  const cost = card === undefined ? null : foretellCost(card);
  return cost === null ? 'Cast for its foretell cost' : `Cast for ${symbolsText(withX(cost, 0))}`;
}
