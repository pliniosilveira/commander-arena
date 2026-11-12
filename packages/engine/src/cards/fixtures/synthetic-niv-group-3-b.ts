/**
 * SYNTHETIC CARDS FOR "IF YOU CASTING OR COPYING AN INSTANT OR SORCERY SPELL CAUSES A TRIGGERED ABILITY OF A PERMANENT YOU CONTROL TO TRIGGER, THAT ABILITY
 * TRIGGERS AN ADDITIONAL TIME". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-980 to D-984 (group 3-b of the Niv-Mizzet deck): the static `doubleTriggers` with a `cause`, a triggered ability that triggers
 * additional times only when the event that triggers it is the controller casting or copying a spell the cause's filter names (CR 603.2d). Names start with
 * "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

/** "an instant or sorcery spell". */
const INSTANT_OR_SORCERY: ObjectFilter = {
  stackKind: 'spell',
  anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
};

const gain1 = { kind: 'gainLife', player: { kind: 'you' }, amount: 1 } as const;

/** "If you casting or copying an instant or sorcery spell causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time." */
const causeDoubler: Ability = {
  kind: 'static',
  static: {
    kind: 'doubleTriggers',
    subject: { kind: 'filter', filter: { controller: 'you' } },
    cause: { kind: 'castOrCopySpell', spell: INSTANT_OR_SORCERY },
  },
};

export const SYNTHETIC_NIV_GROUP_3_B_LIST: readonly CardDefinition[] = [
  // Magecraft: "Whenever you cast or copy an instant or sorcery spell, this creature gets +1/+1 until end of turn." and the cause doubler.
  singleFace({
    name: 'SYNTHETIC Twin Mage',
    manaCost: ['1', 'U', 'R'],
    types: ['creature'],
    subtypes: ['Efreet', 'Wizard'],
    colors: ['U', 'R'],
    colorIdentity: ['U', 'R'],
    power: 2,
    toughness: 2,
    oracleText:
      'Whenever you cast or copy an instant or sorcery spell, this creature gets +1/+1 until end of turn. If you casting or copying an instant or sorcery spell causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'castSpell', filter: INSTANT_OR_SORCERY, by: 'you', orCopy: true },
        effect: {
          kind: 'modifyPt',
          objects: { kind: 'this' },
          power: 1,
          toughness: 1,
          duration: 'untilEndOfTurn',
        },
      },
      causeDoubler,
    ],
  }),
  // The same doubler alone, on a body that does nothing else (a second one makes the ability trigger three times).
  singleFace({
    name: 'SYNTHETIC Twin Echo',
    manaCost: ['1', 'U'],
    types: ['creature'],
    subtypes: ['Human', 'Wizard'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 1,
    toughness: 1,
    oracleText:
      'If you casting or copying an instant or sorcery spell causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.',
    abilities: [causeDoubler],
  }),
  // "Whenever you cast a spell, you gain 1 life." (any spell: only an instant or sorcery causes the extra trigger)
  singleFace({
    name: 'SYNTHETIC Cast Watcher',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Whenever you cast a spell, you gain 1 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'you' },
        effect: gain1,
      },
    ],
  }),
  // "Whenever an opponent casts a spell, you gain 1 life." (the cause is "you casting", so it is not doubled)
  singleFace({
    name: 'SYNTHETIC Rival Watcher',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Whenever an opponent casts a spell, you gain 1 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'opponent' },
        effect: gain1,
      },
    ],
  }),
  // "Whenever this creature becomes the target of a spell, you gain 1 life." (a trigger the cast causes only through its target: not doubled)
  singleFace({
    name: 'SYNTHETIC Target Watcher',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Human'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 1,
    toughness: 4,
    oracleText: 'Whenever this creature becomes the target of a spell, you gain 1 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'becomesTarget', what: { kind: 'this' }, by: 'any', spellOnly: true },
        effect: gain1,
      },
    ],
  }),
  // "When this creature enters, you gain 1 life." (not caused by a cast: never doubled by the cause doubler)
  singleFace({
    name: 'SYNTHETIC Plain Enterer',
    manaCost: ['1'],
    types: ['creature'],
    subtypes: ['Human'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: 'When this creature enters, you gain 1 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: gain1,
      },
    ],
  }),
  // A creature spell with a cost of {1}: casting it is a cast event of a spell that is not an instant or a sorcery.
  singleFace({
    name: 'SYNTHETIC Quiet Bear',
    manaCost: ['1'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: '',
  }),
];
