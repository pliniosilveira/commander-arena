/**
 * SYNTHETIC cards for Jump-start (CR 702.133a), the keyword of Radical Idea (the Quick Draw deck, issue 121). Names start with "SYNTHETIC "; oracleId is null. The text describes what
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
];
