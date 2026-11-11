/**
 * SYNTHETIC CARDS FOR THE MANA SPENT TO CAST A SPELL. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-183 (the Korvold slice 5): "When you cast this spell, create X ... tokens, where X is the amount of mana spent to cast it" (the
 * spell is the source of its own cast trigger, CR 601.2i) and "Each creature you control enters with an additional +1/+1 counter on it for each mana from an
 * artifact source spent to cast it" (CR 601.2h, 614.12, 122.6). Names start with "SYNTHETIC "; oracleId is null. The text has the wording of the real cards the
 * shapes come from (the owner's request file of 2026-10-29, the name replaced by ~); it is not their definition.
 */
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

export const SYNTHETIC_MANA_SPENT_LIST: readonly CardDefinition[] = [
  // "When you cast this spell, create X 0/1 red Kobold creature tokens named Kobolds of Kher Keep, where X is the amount of mana spent to cast it. Flying"
  singleFace({
    name: 'SYNTHETIC Kobold Dragon',
    manaCost: ['3', 'B', 'R', 'G'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['B', 'R', 'G'],
    colorIdentity: ['B', 'R', 'G'],
    power: 5,
    toughness: 5,
    oracleText:
      'When you cast this spell, create X 0/1 red Kobold creature tokens named Kobolds of Kher Keep, where X is the amount of mana spent to cast it.\nFlying',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'you', self: true },
        effect: {
          kind: 'createToken',
          token: {
            kind: 'custom',
            definition: {
              name: 'Kobolds of Kher Keep',
              manaCost: null,
              supertypes: [],
              types: ['creature'],
              subtypes: ['Kobold'],
              colors: ['R'],
              power: 0,
              toughness: 1,
              loyalty: null,
              defense: null,
              oracleText: '',
              abilities: [],
            },
          },
          count: { kind: 'manaSpent' },
        },
      },
      kw('flying'),
    ],
  }),
  // "Each creature you control enters with an additional +1/+1 counter on it for each mana from an artifact source spent to cast it.
  //  {T}: Create a Treasure token."
  singleFace({
    name: 'SYNTHETIC Coin Press',
    manaCost: ['4'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'Each creature you control enters with an additional +1/+1 counter on it for each mana from an artifact source spent to cast it.\n{T}: Create a Treasure token.',
    abilities: [
      {
        kind: 'replacement',
        replacement: {
          kind: 'othersEnterWithCounters',
          what: { types: ['creature'], controller: 'you' },
          counter: '+1/+1',
          count: { kind: 'manaSpent', fromType: 'artifact' },
        },
      },
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        effect: {
          kind: 'createToken',
          token: { kind: 'preset', preset: 'Treasure' },
          count: 1,
        },
      },
    ],
  }),
  // "Each creature you control enters with an additional +1/+1 counter on it for each mana spent to cast it." (all the mana, whatever made it)
  singleFace({
    name: 'SYNTHETIC Mana Press',
    manaCost: ['3'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'Each creature you control enters with an additional +1/+1 counter on it for each mana spent to cast it.',
    abilities: [
      {
        kind: 'replacement',
        replacement: {
          kind: 'othersEnterWithCounters',
          what: { types: ['creature'], controller: 'you' },
          counter: '+1/+1',
          count: { kind: 'manaSpent' },
        },
      },
    ],
  }),
];
