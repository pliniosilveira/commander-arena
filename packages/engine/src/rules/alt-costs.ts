/**
 * The costs a card adds to or swaps into casting: the kicker or multikicker cost (CR 702.33a, 702.33c, an additional cost)
 * and the flashback cost (CR 702.34a, an alternative cost, CR 118.9). Both are read from the face's
 * printed keyword; `validateCard` allows one of each and only `mana` (and, for kicker, `payLife`)
 * costs, so the helpers here can add the two kinds up without any other case.
 */
import type { AlternativeCost, Cost, Keyword, NamedAlternativeKind } from '../ast/types';
import type { CardFace } from '../cards/definition';

function keywordCost(
  face: CardFace | null,
  kind: 'kicker' | 'multikicker' | 'flashback' | 'replicate' | 'escalate' | 'buyback',
): readonly Cost[] | null {
  for (const a of face?.abilities ?? []) {
    if (a.kind !== 'keyword') continue;
    const k: Keyword = a.keyword;
    if (k.kind === kind) return k.cost;
  }
  return null;
}

/** The kicker cost of the face, or null when it has no kicker (CR 702.33a). */
export function kickerCostOf(face: CardFace | null): readonly Cost[] | null {
  return keywordCost(face, 'kicker');
}

/** The buyback cost of the face, or null when it has none (CR 702.27a): an optional additional cost, mana only. */
export function buybackCostOf(face: CardFace | null): readonly Cost[] | null {
  return keywordCost(face, 'buyback');
}

/** The multikicker cost of the face, or null when it has none (CR 702.33c: a kicker cost paid any number of times). */
export function multikickerCostOf(face: CardFace | null): readonly Cost[] | null {
  return keywordCost(face, 'multikicker');
}

/** The replicate cost of the face, or null when it has none (CR 702.56a, D-129): paid any number of times as the spell is cast. */
export function replicateCostOf(face: CardFace | null): readonly Cost[] | null {
  return keywordCost(face, 'replicate');
}

/** The escalate cost of the face, or null when it has none (CR 702.120a, D-145): paid for each mode chosen beyond the first. */
export function escalateCostOf(face: CardFace | null): readonly Cost[] | null {
  return keywordCost(face, 'escalate');
}

/**
 * The cost "for each target beyond the first" of the face's spell, or null when it has none (D-641, CR 601.2f; Strive is an ability word, CR 207.2c): the static ability
 * `costPerExtraTarget` of the spell itself, which works on the stack (CR 113.6d). Mana only (`validateCard`).
 */
export function costPerExtraTargetOf(face: CardFace | null): readonly Cost[] | null {
  for (const a of face?.abilities ?? []) {
    if (a.kind === 'static' && a.static.kind === 'costPerExtraTarget') return a.static.cost;
  }
  return null;
}

/** Whether a mode of the face's modal spell has a cost listed before its effect (CR 700.2h, 702.183a, D-433): Tiered. */
export function hasModeCosts(face: CardFace | null): boolean {
  return face?.spell?.modes?.some((m) => m.cost !== undefined) === true;
}

/**
 * The costs of the modes in `chosen` (indexes of the face's modes), to be paid as additional costs of the spell (CR 700.2h: "if more than one such mode is chosen, all
 * additional costs must be paid"; D-433). A mode with no cost adds none; mana only (`validateCard`), so the helpers that add mana up read them like the other costs.
 */
export function modeCostsOf(face: CardFace | null, chosen: readonly number[]): readonly Cost[] {
  const modes = face?.spell?.modes;
  if (modes === undefined) return [];
  return chosen.flatMap((i) => modes[i]?.cost ?? []);
}

/** Whether the face has "Gift a card" (CR 702.174a, D-135): the caster may promise an opponent a gift as the spell is cast. */
export function hasGift(face: CardFace | null): boolean {
  return face?.abilities.some((a) => a.kind === 'keyword' && a.keyword.kind === 'gift') === true;
}

/** Whether the face has Aftermath (CR 702.127a): a half of a split card that is cast only from a graveyard and is exiled when it leaves the stack. */
export function hasAftermath(face: CardFace | null): boolean {
  return (
    face?.abilities.some((a) => a.kind === 'keyword' && a.keyword.kind === 'aftermath') === true
  );
}

/** The cost of whichever kicker ability the face has, kicker or multikicker (CR 702.33c), or null. */
export function kickerLikeCostOf(face: CardFace | null): readonly Cost[] | null {
  return kickerCostOf(face) ?? multikickerCostOf(face);
}

/**
 * The alternative cost of the card's own "You may cast this card from your graveyard by paying {2}{W} rather than paying its mana cost" (CR 118.9, D-656), or null when the face has
 * no such ability (or its ability has no cost of its own).
 */
export function graveyardCostOf(face: CardFace | null): readonly Cost[] | null {
  for (const a of face?.abilities ?? []) {
    if (
      a.kind === 'static' &&
      a.static.kind === 'castFromGraveyard' &&
      a.static.cost !== undefined
    ) {
      return a.static.cost;
    }
  }
  return null;
}

/** The flashback cost of the face, or null when it has no flashback (CR 702.34a). */
export function flashbackCostOf(face: CardFace | null): readonly Cost[] | null {
  return keywordCost(face, 'flashback');
}

/**
 * The flashback cost a card is cast for when something gave it flashback with the cost equal to its mana cost (CR 702.34a, 118.9: `grantFlashbackToGraveyardCards`,
 * `gainFlashbackFromManaCost`): its mana cost, as a mana cost; null when it has none (a cost equal to nothing cannot be paid, CR 202.1b).
 */
export function manaCostAsFlashbackCost(face: CardFace | null): readonly Cost[] | null {
  const symbols = face?.manaCost;
  return symbols === undefined || symbols === null || symbols.length === 0
    ? null
    : [{ kind: 'mana', symbols }];
}

/** The alternative cost of `kind` the face lists (`CardFace.alternativeCosts`, D-121), or null. */
export function alternativeOf<K extends AlternativeCost['kind']>(
  face: CardFace | null,
  kind: K,
): Extract<AlternativeCost, { kind: K }> | null {
  const found = face?.alternativeCosts?.find((a) => a.kind === kind);
  return (found as Extract<AlternativeCost, { kind: K }> | undefined) ?? null;
}

/** The cost of the named alternative cost (overload, ...) the face lists, or null (D-121). */
export function namedAlternativeCostOf(
  face: CardFace | null,
  kind: NamedAlternativeKind,
): readonly Cost[] | null {
  return alternativeOf(face, kind)?.cost ?? null;
}

/** The mana symbols of the `mana` costs in a list, in order (the planner pays these). */
export function manaSymbolsOf(costs: readonly Cost[]): string[] {
  return costs.flatMap((c) => (c.kind === 'mana' ? [...c.symbols] : []));
}
