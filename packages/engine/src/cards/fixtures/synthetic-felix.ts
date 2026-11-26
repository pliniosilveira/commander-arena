/**
 * SYNTHETIC CARDS FOR "IF A CREATURE YOU CONTROL DEALING COMBAT DAMAGE TO A PLAYER CAUSES A TRIGGERED ABILITY OF A PERMANENT YOU CONTROL TO TRIGGER, THAT ABILITY TRIGGERS AN ADDITIONAL TIME".
 * NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the static `doubleTriggers` with the cause `creatureDealsCombatDamageToPlayer` (CR 603.2d, 510.2). Names start with "SYNTHETIC "; oracleId is null.
 * The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const gain1 = { kind: 'gainLife', player: { kind: 'you' }, amount: 1 } as const;

export const SYNTHETIC_FELIX_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Hit Doubler',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'If a creature you control dealing combat damage to a player causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'doubleTriggers',
          subject: { kind: 'filter', filter: { controller: 'you' } },
          cause: { kind: 'creatureDealsCombatDamageToPlayer' },
        },
      },
    ],
  }),
  // "Whenever a creature deals combat damage to a player, you gain 1 life." (any creature, whoever controls it)
  singleFace({
    name: 'SYNTHETIC Any Hit Watcher',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Whenever a creature deals combat damage to a player, you gain 1 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'dealsCombatDamage', what: { types: ['creature'] }, to: 'player' },
        effect: gain1,
      },
    ],
  }),
  // "Whenever a creature you control deals combat damage to anything, you gain 1 life."
  singleFace({
    name: 'SYNTHETIC Anything Hit Watcher',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Whenever a creature you control deals combat damage to anything, you gain 1 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          kind: 'dealsCombatDamage',
          what: { types: ['creature'], controller: 'you' },
          to: 'any',
        },
        effect: gain1,
      },
    ],
  }),
  // "Whenever one or more creatures you control deal combat damage to a player, you gain 1 life."
  singleFace({
    name: 'SYNTHETIC Batch Hit Watcher',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'Whenever one or more creatures you control deal combat damage to a player, you gain 1 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          kind: 'combatDamageBatch',
          what: { types: ['creature'], controller: 'you' },
          to: 'player',
        },
        effect: gain1,
      },
    ],
  }),
];
