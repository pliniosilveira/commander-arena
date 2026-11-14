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
  kind: 'kicker' | 'multikicker' | 'flashback' | 'replicate' | 'escalate',
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

/** The cost of whichever kicker ability the face has, kicker or multikicker (CR 702.33c), or null. */
export function kickerLikeCostOf(face: CardFace | null): readonly Cost[] | null {
  return kickerCostOf(face) ?? multikickerCostOf(face);
}

/** The flashback cost of the face, or null when it has no flashback (CR 702.34a). */
export function flashbackCostOf(face: CardFace | null): readonly Cost[] | null {
  return keywordCost(face, 'flashback');
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
