import { type Ability, BASIC_LAND_TYPES, type CardType } from '@commander-arena/engine';

/**
 * The mana abilities a land gets from its basic land types (CR 305.6 Basic Land Types): "{T}:
 * Add {W}" for Plains and so on, one per type in the order they appear on the type line. They are
 * not printed in the card's own text (only as reminder text on basic lands and on cards like the
 * original duals), so this is how `Plains` and `Breeding Pool` get them.
 */
export function intrinsicAbilities(
  types: readonly CardType[],
  subtypes: readonly string[],
): Ability[] {
  if (!types.includes('land')) return [];
  const out: Ability[] = [];
  for (const subtype of subtypes) {
    const color = Object.hasOwn(BASIC_LAND_TYPES, subtype) ? BASIC_LAND_TYPES[subtype] : undefined;
    if (color === undefined) continue;
    out.push({
      kind: 'mana',
      cost: [{ kind: 'tap' }],
      production: { kind: 'fixed', mana: [color] },
    });
  }
  return out;
}
