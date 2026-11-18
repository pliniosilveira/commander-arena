/**
 * SYNTHETIC CARD FOR AN AURA THAT ENCHANTS A PLAYER (issue 160, D-613). NOT A REAL MAGIC CARD.
 *
 * Invented for the tests of what the real card needs from the engine: "Enchant player. Whenever enchanted player is attacked, untap all nonland permanents you control. Each
 * opponent attacking that player untaps all nonland permanents they control." (the engine's `enchant` keyword with `player`, and an `attackBatch` trigger with
 * `attackedEnchantedPlayer`), a second Curse that gains its controller 1 life each time (to count the triggers), and a creature with protection from enchantments to be the
 * player's shield. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, Effect } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const ENCHANT_PLAYER: Ability = {
  kind: 'keyword',
  keyword: { kind: 'enchant', filter: {}, player: true },
};

const WHEN_ENCHANTED_PLAYER_IS_ATTACKED = {
  kind: 'attackBatch',
  who: 'any',
  atLeast: 1,
  attackedEnchantedPlayer: true,
} as const;

const UNTAP_NONLAND_YOURS: Effect = {
  kind: 'untap',
  objects: { kind: 'each', filter: { zone: 'battlefield', notTypes: ['land'], controller: 'you' } },
};

const UNTAP_NONLAND_OF_ATTACKER: Effect = {
  kind: 'untap',
  objects: {
    kind: 'each',
    filter: { zone: 'battlefield', notTypes: ['land'], controller: 'triggerPlayer' },
  },
};

export const SYNTHETIC_CURSE_LIST: readonly CardDefinition[] = [
  // "Enchant player. Whenever enchanted player is attacked, untap all nonland permanents you control. Each opponent attacking that player untaps all nonland permanents they control."
  singleFace({
    name: 'SYNTHETIC Curse of Plenty',
    manaCost: ['2', 'G'],
    types: ['enchantment'],
    subtypes: ['Aura', 'Curse'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Enchant player. Whenever enchanted player is attacked, untap all nonland permanents you control. Each opponent attacking that player untaps all nonland permanents they control.',
    abilities: [
      ENCHANT_PLAYER,
      {
        kind: 'triggered',
        trigger: WHEN_ENCHANTED_PLAYER_IS_ATTACKED,
        effect: { kind: 'sequence', effects: [UNTAP_NONLAND_YOURS, UNTAP_NONLAND_OF_ATTACKER] },
      },
    ],
  }),
  // "Enchant player. Whenever enchanted player is attacked, you gain 1 life."
  singleFace({
    name: 'SYNTHETIC Curse of Tithes',
    manaCost: ['1', 'W'],
    types: ['enchantment'],
    subtypes: ['Aura', 'Curse'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Enchant player. Whenever enchanted player is attacked, you gain 1 life.',
    abilities: [
      ENCHANT_PLAYER,
      {
        kind: 'triggered',
        trigger: WHEN_ENCHANTED_PLAYER_IS_ATTACKED,
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
      },
    ],
  }),
];
