/**
 * SYNTHETIC CARDS FOR CONTROL-CHANGING EFFECTS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-189 (the Korvold slice 8a, the control-change subsystem): a layer 2 effect that gives its controller control of a permanent
 * (CR 613.1b) until end of turn, until the end of the controller's next turn, for as long as the controller controls the permanent with the ability
 * (CR 611.2b), or with no duration (CR 611.2a), and the trigger "whenever an opponent taps an artifact for mana" (CR 106.12, 603.2). Names start with
 * "SYNTHETIC "; oracleId is null.
 *
 * SYNTHETIC Treasure Nabber has the text of the real card from the owner's request file of 2026-10-29 (the Korvold deck); that file gives no power or
 * toughness, so the 3/2 here is invented, and the card is not the definition of the real one (which the parser reads from its Oracle text). The other
 * cards are invented wording, never Oracle text.
 */
import type { Ability, Effect } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const TARGET = { kind: 'target', id: 't1' } as const;
const CREATURE_TARGET = [
  { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } } },
] as const;

const gain = (duration: Extract<Effect, { kind: 'gainControl' }>['duration']): Effect => ({
  kind: 'gainControl',
  objects: TARGET,
  duration,
});

export const SYNTHETIC_CONTROL_LIST: readonly CardDefinition[] = [
  // "Whenever an opponent taps an artifact for mana, gain control of that artifact until the end of your next turn."
  singleFace({
    name: 'SYNTHETIC Treasure Nabber',
    manaCost: ['2', 'R'],
    types: ['creature'],
    subtypes: ['Goblin', 'Rogue'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 3,
    toughness: 2,
    oracleText:
      'Whenever an opponent taps an artifact for mana, gain control of that artifact until the end of your next turn.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'tapsForMana', who: 'opponent', what: { types: ['artifact'] } },
        effect: {
          kind: 'gainControl',
          objects: { kind: 'triggerSubject' },
          duration: 'untilEndOfYourNextTurn',
        },
      },
    ],
  }),
  // "Gain control of target creature until end of turn. Untap it. It gains haste until end of turn."
  singleFace({
    name: 'SYNTHETIC Snatch Creature',
    manaCost: ['1', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Gain control of target creature until end of turn. Untap it. It gains haste until end of turn.',
    spell: {
      targets: CREATURE_TARGET,
      effect: {
        kind: 'sequence',
        effects: [
          gain('untilEndOfTurn'),
          { kind: 'untap', objects: TARGET },
          {
            kind: 'grantKeyword',
            objects: TARGET,
            keyword: { kind: 'haste' },
            duration: 'untilEndOfTurn',
          },
        ],
      },
    },
  }),
  // "Gain control of target creature until end of turn." (no untap, no haste)
  singleFace({
    name: 'SYNTHETIC Borrow Creature',
    manaCost: ['1', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Gain control of target creature until end of turn.',
    spell: { targets: CREATURE_TARGET, effect: gain('untilEndOfTurn') },
  }),
  // "Gain control of target creature." (no duration stated: CR 611.2a)
  singleFace({
    name: 'SYNTHETIC Lasting Theft',
    manaCost: ['3', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Gain control of target creature.',
    spell: { targets: CREATURE_TARGET, effect: gain('permanent') },
  }),
  // "Gain control of target artifact until the end of your next turn."
  singleFace({
    name: 'SYNTHETIC Artifact Loan',
    manaCost: ['1', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Gain control of target artifact until the end of your next turn.',
    spell: {
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['artifact'] } },
        },
      ],
      effect: gain('untilEndOfYourNextTurn'),
    },
  }),
  // "When this creature enters, gain control of target creature for as long as you control this creature."
  singleFace({
    name: 'SYNTHETIC Mind Leash',
    manaCost: ['3', 'U'],
    types: ['creature'],
    subtypes: ['Illusion'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 2,
    toughness: 2,
    oracleText:
      'When this creature enters, gain control of target creature for as long as you control this creature.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        targets: CREATURE_TARGET,
        effect: gain('forAsLongAsYouControlThis'),
      } satisfies Ability,
    ],
  }),
];
