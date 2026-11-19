/**
 * SYNTHETIC CARDS FOR EACH PLAYER EXILING THEIR CREATURE CARDS, SACRIFICING, THEN RETURNING WHAT THEY EXILED. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of an exile, a sacrifice and a return that all name the cards of the first step (CR 608.2c, 400.7j): the wording of a real card, the name replaced:
 * "Each player exiles all creature cards from their graveyard, then sacrifices all creatures they control, then puts all cards they exiled this way onto the battlefield.", and a
 * creature whose enters trigger shows that the returned creatures enter. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle
 * text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';
import { ZOMBIE_TOKEN } from './synthetic-amounts';

export const SYNTHETIC_LIVING_DEATH_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Mass Revival',
    manaCost: ['3', 'B', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'Each player exiles all creature cards from their graveyard, then sacrifices all creatures they control, then puts all cards they exiled this way onto the battlefield.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'exile',
            objects: { kind: 'each', filter: { zone: 'graveyard', types: ['creature'] } },
          },
          {
            kind: 'sacrifice',
            objects: { kind: 'each', filter: { zone: 'battlefield', types: ['creature'] } },
          },
          {
            kind: 'moveToZone',
            objects: { kind: 'moved' },
            to: 'battlefield',
            controller: 'owner',
          },
        ],
      },
    },
  }),
  // "When this creature enters, create a 2/2 black Zombie creature token."
  singleFace({
    name: 'SYNTHETIC Zombie Maker',
    manaCost: ['1', 'B'],
    types: ['creature'],
    subtypes: ['Human'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 1,
    toughness: 1,
    oracleText: 'When this creature enters, create a 2/2 black Zombie creature token.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'createToken',
          token: { kind: 'custom', definition: ZOMBIE_TOKEN },
          count: 1,
        },
      },
    ],
  }),
  // "When this creature enters, you gain 1 life."
  singleFace({
    name: 'SYNTHETIC Grave Chanter',
    manaCost: ['1', 'B'],
    types: ['creature'],
    subtypes: ['Zombie'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 2,
    oracleText: 'When this creature enters, you gain 1 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
      },
    ],
  }),
];
