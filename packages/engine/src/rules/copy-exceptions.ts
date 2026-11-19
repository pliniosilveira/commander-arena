/**
 * The exceptions of a copy effect (CR 707.9): "..., except it's a 4/4 black Zombie", "..., except it has no mana cost", "..., except it's a Spirit in addition to its other types
 * and it has ...". They apply as the values are copied, so the final set of a changed characteristic is part of the copiable values of the copy (CR 707.9b), and a
 * characteristic-defining ability of the original that defines a characteristic the exception gives a specific value to is not copied (CR 707.9d: Tarmogoyf copied "except it's
 * 7/7" is 7/7 with no ability that defines its power and toughness). An exception "in addition to its other types" copies those abilities (CR 707.9d, last sentence).
 */
import type { Ability, Effect } from '../ast/types';
import { isNonCreatureSubtype } from '../characteristics';
import type { CopiableValues } from '../state/types';

type CopyToken = Extract<Extract<Effect, { kind: 'createToken' }>['token'], { kind: 'copyOf' }>;

/** The exceptions of a copy effect, as `copyOf` carries them. */
export type CopyExceptions = Pick<
  CopyToken,
  | 'addSubtypes'
  | 'addTypes'
  | 'setCreatureTypes'
  | 'setColors'
  | 'setPt'
  | 'noManaCost'
  | 'notLegendary'
  | 'startingLoyalty'
  | 'abilities'
>;

/**
 * The abilities the copy keeps of the original: a characteristic-defining power or toughness is dropped when the exception sets them (CR 707.9d), changeling
 * (CR 702.73a, it defines creature types, CR 604.3) when the exception gives the creature types, devoid (CR 702.114a, it defines color) when it gives the colors.
 */
function copiedAbilities(abilities: readonly Ability[], exceptions: CopyExceptions): Ability[] {
  const kept: Ability[] = [];
  for (const ability of abilities) {
    if (
      ability.kind === 'static' &&
      ability.static.kind === 'characteristicPt' &&
      exceptions.setPt !== undefined
    ) {
      // The exception sets both numbers, so the ability that defines either one has nothing left to define.
      continue;
    }
    if (
      ability.kind === 'keyword' &&
      ((ability.keyword.kind === 'changeling' && exceptions.setCreatureTypes !== undefined) ||
        (ability.keyword.kind === 'devoid' && exceptions.setColors !== undefined))
    ) {
      continue;
    }
    kept.push(ability);
  }
  return kept;
}

/**
 * The copiable values of a copy: those of the original with the exceptions applied (CR 707.9), then the abilities the exception gives (CR 707.9a). The creature types an
 * exception sets replace the creature types of the original; its other subtypes (an artifact type, a land type) belong to a card type the copy keeps and stay.
 */
export function withCopyExceptions(
  values: CopiableValues,
  exceptions: CopyExceptions,
): CopiableValues {
  const original = values.characteristics;
  const subtypes =
    exceptions.setCreatureTypes !== undefined
      ? [
          ...new Set([
            ...original.subtypes.filter((s) => isNonCreatureSubtype(s)),
            ...exceptions.setCreatureTypes,
          ]),
        ]
      : [...new Set([...original.subtypes, ...(exceptions.addSubtypes ?? [])])];
  // CR 707.9b (issue 103): "except it's a 4/4 Dragon creature ... in addition to its other types": the card types the exception adds.
  const addedTypes = (exceptions.addTypes ?? []).filter((t) => !original.types.includes(t));
  return {
    characteristics: {
      ...original,
      subtypes,
      ...(addedTypes.length === 0 ? {} : { types: [...original.types, ...addedTypes] }),
      ...(exceptions.setColors === undefined ? {} : { colors: [...exceptions.setColors] }),
      ...(exceptions.setPt === undefined
        ? {}
        : { power: exceptions.setPt.power, toughness: exceptions.setPt.toughness }),
      ...(exceptions.noManaCost === true ? { manaCost: null } : {}),
      // CR 707.9b, 205.4a (Galadriel group 3): "except it's not legendary": the other supertypes stay.
      ...(exceptions.notLegendary === true
        ? { supertypes: original.supertypes.filter((s) => s !== 'legendary') }
        : {}),
      // CR 707.9b, 306.5b (Galadriel group 3): "except its starting loyalty is 1": only a copy of a planeswalker has a loyalty to set.
      ...(exceptions.startingLoyalty !== undefined && original.loyalty !== null
        ? { loyalty: exceptions.startingLoyalty }
        : {}),
    },
    abilities: [...copiedAbilities(values.abilities, exceptions), ...(exceptions.abilities ?? [])],
    // CR 709.5b: the halves of a copied Room are part of the copiable values.
    ...(values.doors === undefined ? {} : { doors: values.doors }),
  };
}
