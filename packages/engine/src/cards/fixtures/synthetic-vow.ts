/**
 * SYNTHETIC CARDS FOR "EACH PLAYER PUTS A VOW COUNTER ON A CREATURE THEY CONTROL AND SACRIFICES THE REST. EACH OF THOSE CREATURES CAN'T ATTACK YOU OR PLANESWALKERS YOU CONTROL FOR AS
 * LONG AS IT HAS A VOW COUNTER ON IT". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what a real card of that shape needs from the engine: each player keeps one creature (the choice is theirs, among their own) and gets a counter on it, the
 * other creatures are sacrificed and the lands stay; the creatures kept can't attack the player who cast the spell, nor the planeswalkers they control, while they have the counter
 * (the engine's `sparePermanents` with `own`, `onlyTypes`, `counter` and `keptAs`, and `cantAttackController`). Two helpers take a vow counter off a creature and put one on
 * another. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const T1 = { kind: 'target', id: 't1' } as const;
const CREATURE_TARGET = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
} as const;

export const SYNTHETIC_VOW_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Vow Rite',
    manaCost: ['4', 'W'],
    types: ['sorcery'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      "Each player puts a vow counter on a creature they control and sacrifices the rest. Each of those creatures can't attack you or planeswalkers you control for as long as it has a vow counter on it.",
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'sparePermanents',
            types: ['creature'],
            own: {
              players: { kind: 'eachPlayer' },
              onlyTypes: true,
              counter: 'vow',
              keptAs: 'vowed',
            },
          },
          {
            kind: 'cantAttackController',
            objects: { kind: 'chosen', id: 'vowed' },
            planeswalkers: true,
            whileCounter: 'vow',
          },
        ],
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Vow Breaker',
    manaCost: ['W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Remove a vow counter from target creature.',
    spell: {
      targets: [CREATURE_TARGET],
      effect: { kind: 'removeCounters', objects: T1, counter: 'vow', count: 1 },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Vow Giver',
    manaCost: ['W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Put a vow counter on target creature.',
    spell: {
      targets: [CREATURE_TARGET],
      effect: { kind: 'addCounters', objects: T1, counter: 'vow', count: 1 },
    },
  }),
];
