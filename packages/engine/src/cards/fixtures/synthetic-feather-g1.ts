/**
 * SYNTHETIC CARDS FOR THE FEATHER DECK (ISSUE 27), GROUP 1 (D-1300 TO D-1309). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of "gains protection from the color of your choice" (CR 702.16, 608.2d, D-1301: a color chosen as the effect resolves), of an effect that
 * gives protection from a named color (D-1302), and of "for each card you've drawn this turn" (CR 121.1, D-1300). Each one has the wording of a real card, the name
 * replaced. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real
 * card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const END = 'untilEndOfTurn' as const;
const CREATURE_YOU_CONTROL = {
  id: 't1',
  what: { kind: 'object', filter: { types: ['creature'], controller: 'you' } },
} as const;

export const SYNTHETIC_FEATHER_G1_LIST: readonly CardDefinition[] = [
  // "Target creature you control gains protection from the color of your choice until end of turn."
  singleFace({
    name: 'SYNTHETIC Feather Ward',
    manaCost: ['W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'Target creature you control gains protection from the color of your choice until end of turn.',
    spell: {
      targets: [CREATURE_YOU_CONTROL],
      effect: {
        kind: 'grantKeyword',
        objects: { kind: 'target', id: 't1' },
        keyword: { kind: 'protection', from: 'colorOfChoice' },
        duration: END,
      },
    },
  }),
  // "Creatures you control gain protection from the color of your choice until end of turn." (one choice for the whole group)
  singleFace({
    name: 'SYNTHETIC Feather Rally',
    manaCost: ['1', 'W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'Creatures you control gain protection from the color of your choice until end of turn.',
    spell: {
      effect: {
        kind: 'grantKeyword',
        objects: { kind: 'each', filter: { types: ['creature'], controller: 'you' } },
        keyword: { kind: 'protection', from: 'colorOfChoice' },
        duration: END,
      },
    },
  }),
  // "Target creature gains protection from red until end of turn."
  singleFace({
    name: 'SYNTHETIC Feather Veil',
    manaCost: ['W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Target creature gains protection from red until end of turn.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
      effect: {
        kind: 'grantKeyword',
        objects: { kind: 'target', id: 't1' },
        keyword: { kind: 'protection', from: 'color', colors: ['R'] },
        duration: END,
      },
    },
  }),
  // "Draw a card. Until end of turn, target creature gets +1/+0 for each card you've drawn this turn."
  singleFace({
    name: 'SYNTHETIC Feather Fist',
    manaCost: ['1', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      "Draw a card. Until end of turn, target creature gets +1/+0 for each card you've drawn this turn.",
    spell: {
      targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', player: { kind: 'you' }, count: 1 },
          {
            kind: 'modifyPt',
            objects: { kind: 'target', id: 't1' },
            power: { kind: 'cardsDrawnThisTurn' },
            toughness: 0,
            duration: END,
          },
        ],
      },
    },
  }),
];
