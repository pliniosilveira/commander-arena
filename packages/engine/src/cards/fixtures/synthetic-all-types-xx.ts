/**
 * SYNTHETIC CARD FOR "{X}: UNTIL END OF TURN, CREATURES YOU CONTROL HAVE BASE POWER AND TOUGHNESS X/X AND GAIN ALL CREATURE TYPES". NOT A REAL MAGIC CARD.
 *
 * Invented for the tests of what a real card of that shape needs from the engine: an activated ability with {X} whose effect sets the base power and toughness of a
 * group to X (layer 7b) and adds every creature type to it (layer 4), both fixed as the ability resolves. Names start with "SYNTHETIC "; oracleId is null. The text
 * describes what the AST does; it is not Oracle text, and it is not the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const GROUP = { kind: 'each', filter: { types: ['creature'], controller: 'you' } } as const;

export const SYNTHETIC_ALL_TYPES_XX_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Shapeshifter Choir',
    manaCost: ['2', 'W'],
    types: ['creature'],
    subtypes: ['Shapeshifter'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 1,
    toughness: 1,
    oracleText:
      '{X}: Until end of turn, creatures you control have base power and toughness X/X and gain all creature types.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['X'] }],
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'setPt',
              objects: GROUP,
              power: { kind: 'x' },
              toughness: { kind: 'x' },
              duration: 'untilEndOfTurn',
            },
            {
              kind: 'setTypes',
              objects: GROUP,
              allCreatureTypes: true,
              duration: 'untilEndOfTurn',
            },
          ],
        },
      },
    ],
  }),
];
