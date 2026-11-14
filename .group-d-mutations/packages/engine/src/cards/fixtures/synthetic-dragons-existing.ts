/**
 * SYNTHETIC CARDS FOR DRAGONS THAT THE ENGINE ALREADY RAN IN SHAPE. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-151 (the Dragons slice): the parts of the Dragons the earlier primitives cover as they are, written the way the parser must
 * write them ("Each Dragon you control enters with an additional +1/+1 counter on it", "{2}, {T}, Sacrifice this land: Return target Dragon creature
 * card or Ugin planeswalker card from your graveyard to your hand", "{R}, {T}, Sacrifice this artifact: Look at the top seven cards of your library. You may
 * reveal a Dragon card from among them and put it into your hand. Put the rest on the bottom of your library in a random order."). Names start with
 * "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_DRAGONS_EXISTING_LIST: readonly CardDefinition[] = [
  // "Each Dragon you control enters with an additional +1/+1 counter on it. {T}: Add one mana of any color."
  singleFace({
    name: 'SYNTHETIC Storm Globe',
    manaCost: ['3'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'Each Dragon you control enters with an additional +1/+1 counter on it.\\n{T}: Add one mana of any color.',
    abilities: [
      {
        kind: 'replacement',
        replacement: {
          kind: 'othersEnterWithCounters',
          what: { subtypes: ['Dragon'], controller: 'you' },
          counter: '+1/+1',
          count: 1,
        },
      },
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'anyColor' },
      },
    ],
  }),
  // "{2}, {T}, Sacrifice this land: Return target Dragon creature card or Ugin planeswalker card from your graveyard to your hand."
  singleFace({
    name: 'SYNTHETIC Dragon Sanctum',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: [],
    oracleText:
      '{2}, {T}, Sacrifice this land: Return target Dragon creature card or Ugin planeswalker card from your graveyard to your hand.',
    abilities: [
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['2'] },
          { kind: 'tap' },
          { kind: 'sacrifice', what: { kind: 'this' } },
        ],
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: {
                zone: 'graveyard',
                controller: 'you',
                anyOf: [
                  { types: ['creature'], subtypes: ['Dragon'] },
                  { types: ['planeswalker'], subtypes: ['Ugin'] },
                ],
              },
            },
          },
        ],
        effect: { kind: 'moveToZone', objects: { kind: 'target', id: 't1' }, to: 'hand' },
      },
    ],
  }),
  // "{R}, {T}, Sacrifice this artifact: Look at the top seven cards of your library. You may reveal a Dragon card from among them and put it into your hand.
  //  Put the rest on the bottom of your library in a random order."
  singleFace({
    name: 'SYNTHETIC Dragon Seeker',
    manaCost: ['1', 'R'],
    types: ['artifact'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      '{R}, {T}, Sacrifice this artifact: Look at the top seven cards of your library. You may reveal a Dragon card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.',
    abilities: [
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['R'] },
          { kind: 'tap' },
          { kind: 'sacrifice', what: { kind: 'this' } },
        ],
        effect: {
          kind: 'lookAtTop',
          count: 7,
          take: { filter: { subtypes: ['Dragon'] }, max: 1 },
          rest: 'bottomRandom',
        },
      },
    ],
  }),
];
