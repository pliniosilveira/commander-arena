/**
 * SYNTHETIC CARDS FOR STUN COUNTERS AND A CONDITION OF THE TRIGGER EVENT. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-145 (the Dinosaurs slice): a spell that taps a creature and puts a stun counter on it, a spell that
 * untaps one, a creature that puts a stun counter on itself when it attacks while its controller controls no other Dinosaur (a
 * `triggerCondition`, CR 603.2) and the same with an intervening "if" (CR 603.4) for comparison, Dinosaurs to be "another Dinosaur", and a
 * Dinosaur with flash. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text,
 * and none of these is the definition of a real card.
 */
import type { Condition } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const NO_OTHER_DINOSAUR: Condition = {
  kind: 'not',
  term: {
    kind: 'controlsAtLeast',
    filter: { types: ['creature'], subtypes: ['Dinosaur'], other: true },
    count: 1,
  },
};

const slowRaptor = (name: string, intervening: boolean): CardDefinition =>
  singleFace({
    name,
    manaCost: ['2', 'R'],
    types: ['creature'],
    subtypes: ['Dinosaur'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 3,
    toughness: 3,
    oracleText: `Whenever this creature attacks while you don't control another Dinosaur, put a stun counter on it.${intervening ? ' (Checked again as it resolves.)' : ''}`,
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        ...(intervening
          ? { interveningIf: NO_OTHER_DINOSAUR }
          : { triggerCondition: NO_OTHER_DINOSAUR }),
        effect: { kind: 'addCounters', objects: { kind: 'this' }, counter: 'stun', count: 1 },
      },
    ],
  });

export const SYNTHETIC_STUN_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Freeze Bolt',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Tap target creature. Put a stun counter on it.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'tap', objects: { kind: 'target', id: 't1' } },
          { kind: 'addCounters', objects: { kind: 'target', id: 't1' }, counter: 'stun', count: 1 },
        ],
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Rouse',
    manaCost: ['W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Untap target creature.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
      effect: { kind: 'untap', objects: { kind: 'target', id: 't1' } },
    },
  }),
  slowRaptor('SYNTHETIC Slow Raptor', false),
  slowRaptor('SYNTHETIC Careful Raptor', true),
  singleFace({
    name: 'SYNTHETIC Little Dinosaur',
    manaCost: ['R'],
    types: ['creature'],
    subtypes: ['Dinosaur'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 1,
    toughness: 1,
    oracleText: '',
  }),
  singleFace({
    name: 'SYNTHETIC Flash Dinosaur',
    manaCost: ['R'],
    types: ['creature'],
    subtypes: ['Dinosaur'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 1,
    oracleText: 'Flash',
    abilities: [{ kind: 'keyword', keyword: { kind: 'flash' } }],
  }),
];
