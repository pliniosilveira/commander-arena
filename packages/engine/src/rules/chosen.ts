/**
 * Choices made as a permanent enters (D-100): "As this enters, choose a creature type" and "choose a
 * color" (CR 614.12, 614.12a), and what reads them ("of the chosen type", CR 607.2d). The options of
 * each question, the check of an answer, and where the answer is found afterwards. The answer lives on
 * the permanent (`GameObject.chosen`) and is gone when it leaves the battlefield (CR 400.7).
 */
import { COLORS } from '../characteristics';
import { CREATURE_TYPES } from '../data/creature-types';
import type { ObjectId } from '../ids';
import type { ChosenValues, GameState } from '../state/types';

export type ChoiceKind = 'creatureType' | 'color' | 'option';

/** The options of a question, in the fixed order its legal actions follow. */
export function optionsFor(what: ChoiceKind, named: readonly string[] = []): readonly string[] {
  return what === 'creatureType' ? CREATURE_TYPES : what === 'option' ? named : COLORS;
}

/**
 * Two creature type names are the same type. The rules spell two of them with a typographic apostrophe
 * (C’tan, Shi’ar); a card definition may write the plain one, and it is the same type.
 */
export function sameCreatureType(a: string, b: string): boolean {
  return a === b || a.replaceAll('’', "'") === b.replaceAll('’', "'");
}

/** The answer `option` makes to a question, or null when it is not one of its options. */
export function chosenFromOption(
  what: ChoiceKind,
  option: string,
  named: readonly string[] = [],
): ChosenValues | null {
  if (what === 'option') return named.includes(option) ? { option } : null;
  if (what === 'creatureType')
    return CREATURE_TYPES.includes(option) ? { creatureType: option } : null;
  const color = COLORS.find((c) => c === option);
  return color === undefined ? null : { color };
}

/**
 * What `source` chose as it entered: read from the object while it is in the game, from its last-known
 * information after it left (CR 113.7a, 608.2h: a triggered ability of a permanent that is gone still
 * reads what it chose). Undefined when nothing was chosen.
 */
export function chosenOf(state: GameState, source: ObjectId | null): ChosenValues | undefined {
  if (source === null) return undefined;
  return (state.objects[source] ?? state.lki[source]?.object)?.chosen;
}
