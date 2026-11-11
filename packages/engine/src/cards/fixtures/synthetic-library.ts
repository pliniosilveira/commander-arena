/**
 * SYNTHETIC LIBRARY-ARRANGING CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of scry (CR 701.22), surveil (CR 701.25), "look at the top N cards, then
 * put them back in any order" and "put N cards from your hand on top of your library in any
 * order" (D-091). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST
 * does; it is not Oracle text and none of these is a copy of a real card's definition.
 */
import type { Effect } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const THIS = { kind: 'this' } as const;

const spell = (
  name: string,
  oracleText: string,
  cost: readonly string[],
  color: 'U' | 'B',
  effect: Effect,
  types: readonly ('instant' | 'sorcery')[] = ['instant'],
): CardDefinition =>
  singleFace({
    name,
    manaCost: cost,
    types,
    colors: [color],
    colorIdentity: [color],
    oracleText,
    spell: { effect },
  });

export const SYNTHETIC_LIBRARY_LIST: readonly CardDefinition[] = [
  spell('SYNTHETIC Scry Two', 'Scry 2.', ['U'], 'U', { kind: 'scry', count: 2 }),
  spell('SYNTHETIC Scry Three', 'Scry 3.', ['1', 'U'], 'U', { kind: 'scry', count: 3 }),
  spell('SYNTHETIC Scry Five', 'Scry 5.', ['2', 'U'], 'U', { kind: 'scry', count: 5 }),
  spell('SYNTHETIC Scry Zero', 'Scry 0.', ['U'], 'U', { kind: 'scry', count: 0 }),
  // The player is written out: the same as leaving it out.
  spell('SYNTHETIC Scry One You', 'You scry 1.', ['U'], 'U', {
    kind: 'scry',
    player: YOU,
    count: 1,
  }),
  spell('SYNTHETIC Surveil Two', 'Surveil 2.', ['B'], 'B', { kind: 'surveil', count: 2 }),
  spell('SYNTHETIC Surveil Three', 'Surveil 3.', ['1', 'B'], 'B', { kind: 'surveil', count: 3 }),
  spell('SYNTHETIC Surveil Zero', 'Surveil 0.', ['B'], 'B', { kind: 'surveil', count: 0 }),
  spell(
    'SYNTHETIC Reorder Three',
    'Look at the top three cards of your library, then put them back in any order.',
    ['U'],
    'U',
    { kind: 'lookAndReorder', count: 3 },
  ),
  spell(
    'SYNTHETIC Reorder One',
    'Look at the top card of your library, then put it back.',
    ['U'],
    'U',
    { kind: 'lookAndReorder', count: 1 },
  ),
  // The shape of Brainstorm: draw three, then put two cards from your hand on top in any order.
  spell(
    'SYNTHETIC Brainstorm Like',
    'Draw three cards, then put two cards from your hand on top of your library in any order.',
    ['U'],
    'U',
    {
      kind: 'sequence',
      effects: [
        { kind: 'draw', player: YOU, count: 3 },
        { kind: 'putFromHandOnTop', count: 2 },
      ],
    },
  ),
  spell('SYNTHETIC Put Back One', 'Put a card from your hand on top of your library.', ['U'], 'U', {
    kind: 'putFromHandOnTop',
    count: 1,
  }),
  spell(
    'SYNTHETIC Put Back Two',
    'Put two cards from your hand on top of your library in any order.',
    ['U'],
    'U',
    { kind: 'putFromHandOnTop', count: 2 },
  ),
  // Scry as a triggered ability, and as a sequence with a draw.
  singleFace({
    name: 'SYNTHETIC Seer Of The Door',
    manaCost: ['1', 'U'],
    types: ['creature'],
    subtypes: ['Construct'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 1,
    toughness: 2,
    oracleText: 'When this creature enters, scry 2.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        effect: { kind: 'scry', count: 2 },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Grave Watcher',
    manaCost: ['1', 'B'],
    types: ['creature'],
    subtypes: ['Construct'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 1,
    oracleText: 'When this creature enters, surveil 2.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        effect: { kind: 'surveil', count: 2 },
      },
    ],
  }),
];
