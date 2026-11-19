/**
 * SYNTHETIC CARDS FOR "WHENEVER ENCHANTED LAND IS TAPPED FOR MANA, ITS CONTROLLER ADDS AN ADDITIONAL MANA". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what the real cards of that shape need from the engine: an Aura whose triggered mana ability (CR 605.1b) adds mana for the player who tapped the land it
 * enchants (`by: 'tapper'`, a land that the Aura's controller may not control), either mana of a fixed type or one mana of any color the player chooses. Names start with
 * "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, ManaProduction } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const aura = (name: string, oracle: string, mana: ManaProduction): CardDefinition =>
  singleFace({
    name,
    manaCost: ['1', 'G'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: oracle,
    abilities: [
      { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['land'] } } },
      {
        kind: 'triggered',
        trigger: { kind: 'tappedForMana', what: { hostOfSource: true }, by: 'tapper' },
        effect: { kind: 'addMana', mana },
      } satisfies Ability,
    ],
  });

export const SYNTHETIC_ENCHANTED_LAND_MANA_LIST: readonly CardDefinition[] = [
  aura(
    'SYNTHETIC Prismatic Growth',
    'Enchant land. Whenever enchanted land is tapped for mana, its controller adds an additional one mana of any color.',
    { kind: 'anyColor' },
  ),
  aura(
    'SYNTHETIC Verdant Surge',
    'Enchant land. Whenever enchanted land is tapped for mana, its controller adds an additional {G}.',
    { kind: 'fixed', mana: ['G'] },
  ),
];
