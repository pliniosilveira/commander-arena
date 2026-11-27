/**
 * SYNTHETIC CARDS FOR DAMAGE THAT IS INCREASED AS IT IS DEALT. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the replacement `damageBonus` (also its `noncombatOnly` and `opponentPlayersOnly`) (CR 614.1a: "If a red source you control would deal damage to an opponent or a permanent an
 * opponent controls, it deals that much damage plus 2 instead", and the same for a red or artifact source plus 1). The names, mana costs and types
 * follow no real card definition (the parser reads the real ones from their Oracle text, `packages/cards`); the power and toughness of the creatures are
 * INVENTED. Names start with "SYNTHETIC "; oracleId is null.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_DAMAGE_BONUS_LIST: readonly CardDefinition[] = [
  // "If a creature you control would deal damage to a permanent or player, it deals double that damage instead." (`damageDouble` of the creatures on the battlefield)
  singleFace({
    name: 'SYNTHETIC Brutal Rite',
    manaCost: ['2', 'R', 'R', 'R'],
    types: ['enchantment'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'If a creature you control would deal damage to a permanent or player, it deals double that damage instead.',
    abilities: [
      {
        kind: 'replacement',
        replacement: {
          kind: 'damageDouble',
          sources: { types: ['creature'], zone: 'battlefield', controller: 'you' },
        },
      },
    ],
  }),
  // "If a source you control would deal noncombat damage to an opponent, it deals that much damage plus 2 instead."
  singleFace({
    name: 'SYNTHETIC Barbed Hall',
    manaCost: ['3', 'R'],
    types: ['enchantment'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'If a source you control would deal noncombat damage to an opponent, it deals that much damage plus 2 instead.',
    abilities: [
      {
        kind: 'replacement',
        replacement: {
          kind: 'damageBonus',
          sources: { controller: 'you' },
          amount: 2,
          noncombatOnly: true,
          opponentPlayersOnly: true,
        },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Red Sovereign',
    manaCost: ['1', 'R', 'R', 'R'],
    types: ['creature'],
    subtypes: ['Dwarf'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 4,
    oracleText:
      'If a red source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 2 instead.',
    abilities: [
      {
        kind: 'replacement',
        replacement: {
          kind: 'damageBonus',
          sources: { colors: ['R'], controller: 'you' },
          amount: 2,
        },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Forge Banner',
    manaCost: ['1', 'R', 'R'],
    types: ['enchantment'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'If a red or artifact source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 1 instead.',
    abilities: [
      {
        kind: 'replacement',
        replacement: {
          kind: 'damageBonus',
          sources: { anyOf: [{ colors: ['R'] }, { types: ['artifact'] }], controller: 'you' },
          amount: 1,
        },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Red Raider',
    manaCost: ['1', 'R'],
    types: ['creature'],
    subtypes: ['Goblin'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText: '',
  }),
  singleFace({
    name: 'SYNTHETIC Bonus Artifact Golem',
    manaCost: ['3'],
    types: ['artifact', 'creature'],
    subtypes: ['Golem'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText: '',
  }),
  singleFace({
    name: 'SYNTHETIC Green Zap',
    manaCost: ['G'],
    types: ['instant'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'SYNTHETIC Green Zap deals 2 damage to any target.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
      effect: { kind: 'dealDamage', amount: 2, to: { kind: 'target', id: 't1' } },
    },
  }),
];
