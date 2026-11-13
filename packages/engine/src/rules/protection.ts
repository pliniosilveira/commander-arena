/**
 * Protection from a color or a card type (CR 702.16, D-229, D-376): the DEBT of a permanent that has it. Damage that would be dealt to it by a source of that color is
 * prevented (CR 702.16e), it can't be enchanted or equipped by an Aura or Equipment of that color (CR 702.16d), it can't be blocked by creatures of
 * that color (CR 702.16f), and it can't be the target of spells or of abilities from sources of that color (CR 702.16b). The color of a source is read
 * as it is now, or as it last was when the source has left (CR 113.7a). A colorless source has no color, so protection from a color never stops it.
 * Protection from a card type (D-376, CR 702.16a) is read the same way: it applies to sources that are permanents of that type and to any source
 * not on the battlefield of that type (a spell, an ability's source, a card in another zone), and a source with several types matches when any of
 * them is protected from. Protection from something else (a player, everything) is not read: the keyword names colors and card types only.
 */
import type { CardType, Color } from '../characteristics';
import type { ObjectId } from '../ids';
import type { GameObject, GameState } from '../state/types';
import { colorsNotInCommanderIdentity } from './commander-colors';
import { controllerOf } from './control';
import { derive } from './derive';

/** The colors a source has: the object as it is, or as it last existed. Empty for a source the engine knows nothing about. */
export function sourceColors(state: GameState, source: ObjectId | null): readonly Color[] {
  if (source === null) return [];
  const live = state.objects[source];
  if (live !== undefined) return derive(state, live).colors;
  return state.lki[source]?.characteristics.colors ?? [];
}

/**
 * The card types a source has (CR 702.16a): the object as it is, or as it last existed (CR 113.7a), whatever zone it is in: a spell on the stack has the
 * card types of its card, an ability's source is a permanent. Empty for a source the engine knows nothing about.
 */
export function sourceTypes(state: GameState, source: ObjectId | null): readonly CardType[] {
  if (source === null) return [];
  const live = state.objects[source];
  if (live !== undefined) return derive(state, live).types;
  return state.lki[source]?.characteristics.types ?? [];
}

/** The colors `obj` has protection from, as it has them now. Empty for a permanent with none, or an object that is not on the battlefield. */
export function protectedColors(state: GameState, obj: GameObject): readonly Color[] {
  if (obj.zone !== 'battlefield') return [];
  const colors: Color[] = [];
  for (const a of derive(state, obj).abilities) {
    if (a.kind !== 'keyword' || a.keyword.kind !== 'protection') continue;
    if (a.keyword.from === 'color') colors.push(...a.keyword.colors);
    // CR 903.4f (D-259): printed on the permanent, "your" is its controller. A static grant is resolved to colors as it is applied (`derive-statics.ts`).
    else if (a.keyword.from === 'colorsNotInCommanderIdentity') {
      colors.push(...colorsNotInCommanderIdentity(state, controllerOf(state, obj)));
    }
  }
  return colors;
}

/**
 * The card types `obj` has protection from, as it has them now (D-376, CR 702.16a). Empty for a permanent with none, or an object that is not on the
 * battlefield. "The chosen card type" printed on the permanent is the card type it chose; a static grant is resolved to `cardType` as it is applied
 * (`derive-statics.ts`).
 */
export function protectedTypes(state: GameState, obj: GameObject): readonly CardType[] {
  if (obj.zone !== 'battlefield') return [];
  const types: CardType[] = [];
  for (const a of derive(state, obj).abilities) {
    if (a.kind !== 'keyword' || a.keyword.kind !== 'protection') continue;
    if (a.keyword.from === 'cardType') types.push(...a.keyword.types);
    else if (a.keyword.from === 'chosenCardType' && obj.chosen?.cardType !== undefined) {
      types.push(obj.chosen.cardType);
    }
  }
  return types;
}

/** Whether `obj` has protection from a color or a card type the source has (CR 702.16). */
export function hasProtectionFrom(
  state: GameState,
  obj: GameObject,
  source: ObjectId | null,
): boolean {
  const colors = protectedColors(state, obj);
  const types = protectedTypes(state, obj);
  if (colors.length === 0 && types.length === 0) return false;
  return (
    (colors.length > 0 && sourceColors(state, source).some((c) => colors.includes(c))) ||
    (types.length > 0 && sourceTypes(state, source).some((t) => types.includes(t)))
  );
}
