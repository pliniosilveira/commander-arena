/** The cast button of a named alternative cost (D-121), from the card's `alternativeCosts`. */
import { manaValue, type ObjectView } from '@commander-arena/engine';
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
  // CR 118.9, 202.3e: "Pay 3 life instead of {2}{U}": the life is the card's mana value; with an {X} it is that much plus the X announced next.
  if (kind === 'lifeForMana') return lifeForManaLabel(card);
  const entry = card?.alternativeCosts?.find((c) => c.kind === kind);
  if (entry === undefined) return ALTERNATIVE_NAMES[kind];
  // D-149 (CR 118.9): "Cast for {W}, tapping four creatures with flying".
  if (kind === 'tapPermanents') return tapAlternativeLabel(entry);
  // Issue 159: "Cast for {B}{B}, sacrificing 2 creatures".
  if (kind === 'sacrificeFromGraveyard' || kind === 'sacrificePermanents') {
    return sacrificeAlternativeLabel(entry);
  }
  // CR 118.9, 118.4 (Snuff Out): "Cast by paying 4 life instead of mana" (`AlternativeCostView.life`).
  if (kind === 'payLife') return payLifeLabel(entry);
  // CR 702.74a: "Evoke—Exile a red card from your hand": no mana, the exile of a card of the hand.
  if (entry.exileFromHand !== undefined) return evokeExileLabel(entry);
  const label = `${ALTERNATIVE_NAMES[kind]} ${symbolsText(withX(entry.cost, 0))}`;
  return entry.exile === undefined ? label : `${label}, exile ${plural(entry.exile, 'other card')}`;
}

/** "Evoke, exile a red card from your hand" (`AlternativeCostView.exileFromHand`): the cast button of an evoke cost that exiles a card instead of paying mana. */
export function evokeExileLabel(
  entry: NonNullable<ObjectView['alternativeCosts']>[number],
): string {
  const colors = (entry.exileFromHand?.colors ?? []).map((c) => COLOR_NAMES[c] ?? c).join(' or ');
  const mana = withX(entry.cost, 0).filter((s) => s !== '0');
  const exile = `exile a ${colors === '' ? '' : `${colors} `}card from your hand`;
  return mana.length === 0
    ? `${ALTERNATIVE_NAMES.evoke}, ${exile}`
    : `${ALTERNATIVE_NAMES.evoke} ${symbolsText(mana)}, ${exile}`;
}

const COLOR_NAMES: Readonly<Record<string, string>> = {
  W: 'white',
  U: 'blue',
  B: 'black',
  R: 'red',
  G: 'green',
};

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

/**
 * "Cast for {B}{B}, sacrificing 2 creatures" (issue 159): the cast button of the alternative cost that sacrifices permanents (`AlternativeCostView.sacrifice`). The count and
 * the kind of permanent are the card's, read from the view.
 */
export function sacrificeAlternativeLabel(
  entry: NonNullable<ObjectView['alternativeCosts']>[number],
): string {
  const { sacrifice } = entry;
  if (sacrifice === undefined) return ALTERNATIVE_NAMES.sacrificeFromGraveyard;
  // A cost of {0} (Flare of Malice: nothing but the sacrifice) has no mana to name.
  const mana = withX(entry.cost, 0).filter((s) => s !== '0');
  const what = plural(sacrifice.count, sacrifice.filter.types?.[0] ?? 'permanent');
  return mana.length === 0
    ? `Cast by sacrificing ${what}`
    : `Cast for ${symbolsText(mana)}, sacrificing ${what}`;
}

/** "Cast by paying 4 life instead of mana": the button of the alternative cost that pays life (`AlternativeCostView.life`), with the mana it still costs, if any. */
export function payLifeLabel(entry: NonNullable<ObjectView['alternativeCosts']>[number]): string {
  const mana = withX(entry.cost, 0).filter((s) => s !== '0');
  const life = `${entry.life ?? 0} life`;
  return mana.length === 0
    ? `Cast by paying ${life} instead of mana`
    : `Cast for ${symbolsText(mana)} and ${life}`;
}

/** "Cast for {R}": the button of a foretold card, from its `alternativeCosts` (D-128). */
export function foretellCastLabel(card: ObjectView | undefined): string {
  const cost = card === undefined ? null : foretellCost(card);
  return cost === null ? 'Cast for its foretell cost' : `Cast for ${symbolsText(withX(cost, 0))}`;
}

/**
 * "Cast by paying 3 life instead of mana" (`lifeForMana`, Marshland Bloodcaster's permission): the button of the choice to pay life equal to the mana value rather than the mana cost. The
 * mana value is read from the card's printed cost; an {X} counts as the X announced afterwards, so such a card says "life equal to its mana value".
 */
export function lifeForManaLabel(card: ObjectView | undefined): string {
  const cost = card?.manaCost;
  if (cost === undefined || cost === null || cost.includes('X')) {
    return 'Cast by paying life equal to its mana value instead of mana';
  }
  return `Cast by paying ${manaValue(cost)} life instead of mana`;
}
