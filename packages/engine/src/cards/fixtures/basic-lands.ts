/**
 * The five basic lands (CR 305.6). Hand-written from the cards' Oracle text; UNVERIFIED
 * against Scryfall until the M4 import or the A20 spike matches them (oracleId is null).
 *
 * Each has the supertype basic, no mana cost (CR 202.1), no color (CR 105.2), and its land
 * type as the only subtype. Its one ability is the intrinsic "{T}: Add {X}" of CR 305.6, a
 * mana ability (CR 605.1a). Color identity: that rules text contains a colored mana symbol,
 * so CR 903.4 gives the identity of the land type's color, for example Plains is white.
 */
import type { Ability } from '../../ast/types';
import type { Color } from '../../characteristics';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

function basicLand(name: string, color: Color): CardDefinition {
  const ability: Ability = {
    kind: 'mana',
    cost: [{ kind: 'tap' }],
    production: { kind: 'fixed', mana: [color] },
  };
  return singleFace({
    name,
    manaCost: null,
    supertypes: ['basic'],
    types: ['land'],
    subtypes: [name],
    colors: [],
    colorIdentity: [color],
    oracleText: `({T}: Add {${color}}.)`,
    abilities: [ability],
  });
}

export const BASIC_LAND_FIXTURES: readonly CardDefinition[] = [
  basicLand('Plains', 'W'),
  basicLand('Island', 'U'),
  basicLand('Swamp', 'B'),
  basicLand('Mountain', 'R'),
  basicLand('Forest', 'G'),
];
