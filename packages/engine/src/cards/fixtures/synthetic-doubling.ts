/**
 * SYNTHETIC CARDS FOR "DOUBLE THE POWER AND TOUGHNESS OF EACH CREATURE YOU CONTROL". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-145 (the Dinosaurs slice): an enchantment that doubles the power and toughness of each creature its controller
 * controls at the beginning of each combat (an `affected` power and toughness in a `modifyPt` effect over an `each` selector), an instant that
 * doubles only the power of a target creature, and one that doubles only the toughness of a creature its controller controls. Names start
 * with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of
 * a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_DOUBLING_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Surge Field',
    manaCost: ['3', 'G'],
    types: ['enchantment'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'At the beginning of each combat, double the power and toughness of each creature you control until end of turn.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'beginCombat', whose: 'each' },
        effect: {
          kind: 'modifyPt',
          objects: { kind: 'each', filter: { types: ['creature'], controller: 'you' } },
          power: { kind: 'affected', stat: 'power' },
          toughness: { kind: 'affected', stat: 'toughness' },
          duration: 'untilEndOfTurn',
        },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Might Doubler',
    manaCost: ['G'],
    types: ['instant'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Double the power of target creature until end of turn.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
      effect: {
        kind: 'modifyPt',
        objects: { kind: 'target', id: 't1' },
        power: { kind: 'affected', stat: 'power' },
        toughness: 0,
        duration: 'untilEndOfTurn',
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Hide Doubler',
    manaCost: ['G'],
    types: ['instant'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Double the toughness of target creature until end of turn.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
      effect: {
        kind: 'modifyPt',
        objects: { kind: 'target', id: 't1' },
        power: 0,
        toughness: { kind: 'affected', stat: 'toughness' },
        duration: 'untilEndOfTurn',
      },
    },
  }),
];
