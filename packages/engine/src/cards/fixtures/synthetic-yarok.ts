/**
 * SYNTHETIC CARDS FOR "IF A PERMANENT ENTERING CAUSES A TRIGGERED ABILITY OF A PERMANENT YOU CONTROL TO TRIGGER, THAT ABILITY TRIGGERS AN ADDITIONAL TIME".
 * NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the static `doubleTriggers` with the cause `permanentEnters` (CR 603.2d, 603.6a). Names start with "SYNTHETIC "; oracleId is null.
 * The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const gain1 = { kind: 'gainLife', player: { kind: 'you' }, amount: 1 } as const;

/** "If a permanent entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time." */
const enterDoubler: Ability = {
  kind: 'static',
  static: {
    kind: 'doubleTriggers',
    subject: { kind: 'filter', filter: { controller: 'you' } },
    cause: { kind: 'permanentEnters' },
  },
};

export const SYNTHETIC_YAROK_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Entry Doubler',
    manaCost: ['1'],
    types: ['creature'],
    subtypes: ['Horror'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText:
      'If a permanent entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.',
    abilities: [enterDoubler],
  }),
  // "Whenever a creature enters, you gain 1 life." (any creature, whoever controls it)
  singleFace({
    name: 'SYNTHETIC Entry Watcher',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Whenever a creature enters, you gain 1 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { types: ['creature'] } },
        effect: gain1,
      },
    ],
  }),
  // "Landfall: you gain 1 life."
  singleFace({
    name: 'SYNTHETIC Land Watcher',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Landfall: you gain 1 life.',
    abilities: [{ kind: 'triggered', trigger: { kind: 'landfall' }, effect: gain1 }],
  }),
  // "When this creature enters, if you have 20 or less life, you gain 15 life." (an intervening "if": read when it triggers and again as it resolves)
  singleFace({
    name: 'SYNTHETIC Needy Enterer',
    manaCost: ['1'],
    types: ['creature'],
    subtypes: ['Human'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: 'When this creature enters, if you have 20 or less life, you gain 15 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        interveningIf: { kind: 'lifeTotal', compare: { cmp: 'atMost', value: 20 } },
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 15 },
      },
    ],
  }),
];
