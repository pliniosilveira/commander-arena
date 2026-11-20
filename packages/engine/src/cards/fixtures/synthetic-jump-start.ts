/**
 * SYNTHETIC cards for Jump-start (CR 702.133a) and Plot (CR 702.170), the keywords of Radical Idea, Lock and Load and Pyretic Charge (the Quick Draw deck, issue 121). Names start with "SYNTHETIC "; oracleId is null. The text describes what
 * the AST does; it is not Oracle text, and none of these is the definition of a real card (the real one is read from the golden corpus by the grammar and has the same ability).
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_JUMP_START_LIST: readonly CardDefinition[] = [
  // "{1}{U} instant. Draw a card. Jump-start."
  singleFace({
    name: 'SYNTHETIC Jump Draw',
    manaCost: ['1', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Draw a card. Jump-start.',
    abilities: [{ kind: 'keyword', keyword: { kind: 'jumpStart' } }],
    spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
  }),
  // "{X}{U} sorcery. You gain X life. Jump-start."
  singleFace({
    name: 'SYNTHETIC Jump X Drain',
    manaCost: ['X', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'You gain X life. Jump-start.',
    abilities: [{ kind: 'keyword', keyword: { kind: 'jumpStart' } }],
    spell: {
      x: true,
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: { kind: 'x' } },
    },
  }),
  // "Draw a card. Plot {1}{U}" ({2}{U} sorcery).
  singleFace({
    name: 'SYNTHETIC Plot Draw',
    manaCost: ['2', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Draw a card. Plot {1}{U}',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'plot', cost: [{ kind: 'mana', symbols: ['1', 'U'] }] } },
    ],
    spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
  }),
  // "You gain 2 life. Plot {U}" ({1}{U} instant: a plotted instant is still cast only in its owner's main phase).
  singleFace({
    name: 'SYNTHETIC Plot Gain',
    manaCost: ['1', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'You gain 2 life. Plot {U}',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'plot', cost: [{ kind: 'mana', symbols: ['U'] }] } },
    ],
    spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 2 } },
  }),
  // "Draw a card, then draw a card for each other instant and sorcery spell you've cast this turn." (Lock and Load without its plot ability.)
  singleFace({
    name: 'SYNTHETIC Lock Load',
    manaCost: ['2', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      "Draw a card, then draw a card for each other instant and sorcery spell you've cast this turn.",
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', player: { kind: 'you' }, count: 1 },
          {
            kind: 'draw',
            player: { kind: 'you' },
            count: {
              kind: 'spellsCastThisTurn',
              ofTypes: ['instant', 'sorcery'],
              otherThanThis: true,
            },
          },
        ],
      },
    },
  }),
];
