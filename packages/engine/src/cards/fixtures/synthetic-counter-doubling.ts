/**
 * SYNTHETIC CARDS FOR "DOUBLE THE NUMBER OF +1/+1 COUNTERS" AND "PROLIFERATE X TIMES". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the `doubleCounters` effect (CR 701.10 Double, 122.6) and of the `times` of `proliferate` (CR 701.34a): an instant that
 * doubles the +1/+1 counters of one target creature, a sorcery that doubles them on every creature its controller controls, and a sorcery
 * that proliferates X times. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const T1 = { kind: 'target', id: 't1' } as const;

export const SYNTHETIC_COUNTER_DOUBLING_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Doubling Draught',
    manaCost: ['G'],
    types: ['instant'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Double the number of +1/+1 counters on target creature.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
      effect: { kind: 'doubleCounters', objects: T1, counter: '+1/+1' },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Doubling Tide',
    manaCost: ['2', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Double the number of +1/+1 counters on each creature you control.',
    spell: {
      effect: {
        kind: 'doubleCounters',
        objects: { kind: 'each', filter: { types: ['creature'], controller: 'you' } },
        counter: '+1/+1',
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Spreading Growth X',
    manaCost: ['X', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Proliferate X times.',
    spell: { x: true, effect: { kind: 'proliferate', times: { kind: 'x' } } },
  }),
];
