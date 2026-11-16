/**
 * SYNTHETIC CARDS FOR GROUP 2 OF THE HYLDA DECK (issue 42, D-517 to D-525). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what the real cards of the group need from the engine, written out by hand (the cards package checks that the grammar lowers the real Oracle text to
 * these same nodes): a sorcery that taps every creature a chosen player controls and keeps them tapped through their next untap step, a creature that does it as it enters
 * (without the rider), an instant that taps up to two creatures and keeps them tapped if there are two instants and/or sorceries in the graveyard, an X instant that does it
 * when its controller has a big creature, a creature that taps a creature of an opponent when its controller casts an instant or sorcery spell, an Aura that taps its
 * creature at every upkeep, a sorcery with a d20 results table, a creature with a "choose up to one" trigger, a siege that names Khans or Dragons as it enters, a creature
 * that taps a creature at the start of an opponent's upkeep with four card types in its controller's graveyard, and an artifact that taps a creature for less during its controller's turn.
 * Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, ObjectFilter, ObjectSelector } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const THIS = { kind: 'this' } as const;
const T1 = { kind: 'target', id: 't1' } as const;

const CREATURE: ObjectFilter = { zone: 'battlefield', types: ['creature'] };

/** "Target creature" as the one slot of an ability. */
const CREATURE_TARGET = { id: 't1', what: { kind: 'object', filter: CREATURE } } as const;

/** "All creatures target player controls": the group of the player chosen as the target `t1`. */
const THEIR_CREATURES: ObjectSelector = {
  kind: 'each',
  filter: { zone: 'battlefield', types: ['creature'], controlledBy: T1 },
};

/** "All creatures your opponents control". */
const OPPONENTS_CREATURES: ObjectSelector = {
  kind: 'each',
  filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
};

const KEEP_TAPPED = (objects: ObjectSelector) =>
  ({
    kind: 'restrict',
    objects,
    restriction: 'doesntUntap',
    duration: 'untilNextUntapStep',
  }) as const;

/** "If there are two or more instant and/or sorcery cards in your graveyard" (spell mastery). */
const TWO_SPELLS_IN_GRAVEYARD = {
  kind: 'amountIs',
  amount: {
    kind: 'countOf',
    filter: {
      zone: 'graveyard',
      controller: 'you',
      anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
    },
  },
  compare: { cmp: 'atLeast', value: 2 },
} as const;

const TAP_THEM_ALL = { kind: 'tap', objects: OPPONENTS_CREATURES } as const;
const KEEP_THEM_TAPPED = KEEP_TAPPED(OPPONENTS_CREATURES);

const DIE_AT_MOST_9 = { kind: 'dieResult', compare: { cmp: 'atMost', value: 9 } } as const;
const DIE_10_TO_19 = {
  kind: 'and',
  terms: [
    { kind: 'dieResult', compare: { cmp: 'atLeast', value: 10 } },
    { kind: 'dieResult', compare: { cmp: 'atMost', value: 19 } },
  ],
} as const;
const DIE_20 = { kind: 'dieResult', compare: { cmp: 'equal', value: 20 } } as const;

/** The delirium count: four or more card types among the cards in the controller's graveyard. */
const FOUR_CARD_TYPES = {
  kind: 'amountIs',
  amount: { kind: 'cardTypesAmong', filter: { zone: 'graveyard', controller: 'you' } },
  compare: { cmp: 'atLeast', value: 4 },
} as const;

const TAP_TARGET: Extract<Ability, { kind: 'triggered' }>['effect'] = {
  kind: 'tap',
  objects: T1,
};

export const SYNTHETIC_HYLDA_G2_LIST: readonly CardDefinition[] = [
  // "Tap all creatures target player controls. Those creatures don't untap during that player's next untap step."
  singleFace({
    name: 'SYNTHETIC Lullaby Wave',
    manaCost: ['2', 'U', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      "Tap all creatures target player controls. Those creatures don't untap during that player's next untap step.",
    spell: {
      targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
      effect: {
        kind: 'sequence',
        effects: [{ kind: 'tap', objects: THEIR_CREATURES }, KEEP_TAPPED(THEIR_CREATURES)],
      },
    },
  }),
  // "When this creature enters, tap all creatures target opponent controls."
  singleFace({
    name: 'SYNTHETIC Gale Binder',
    manaCost: ['2', 'U', 'U'],
    types: ['creature'],
    subtypes: ['Merfolk', 'Wizard'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 2,
    toughness: 3,
    oracleText: 'When this creature enters, tap all creatures target opponent controls.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        targets: [{ id: 't1', what: { kind: 'player', filter: 'opponent' } }],
        effect: { kind: 'tap', objects: THEIR_CREATURES },
      },
    ],
  }),
  // "Tap up to two target creatures. If there are two or more instant and/or sorcery cards in your graveyard, those creatures don't untap during their controllers' next untap steps."
  singleFace({
    name: 'SYNTHETIC Drowse Pair',
    manaCost: ['1', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      "Tap up to two target creatures. If there are two or more instant and/or sorcery cards in your graveyard, those creatures don't untap during their controllers' next untap steps.",
    spell: {
      targets: [{ id: 't1', what: { kind: 'object', filter: CREATURE }, min: 0, max: 2 }],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'tap', objects: T1 },
          { kind: 'conditional', condition: TWO_SPELLS_IN_GRAVEYARD, effect: KEEP_TAPPED(T1) },
        ],
      },
    },
  }),
  // "Tap X target creatures. If you control a creature with power 4 or greater, those creatures don't untap during their controllers' next untap steps."
  singleFace({
    name: 'SYNTHETIC Frost Gust',
    manaCost: ['X', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      "Tap X target creatures. If you control a creature with power 4 or greater, those creatures don't untap during their controllers' next untap steps.",
    spell: {
      x: true,
      targets: [{ id: 't1', what: { kind: 'object', filter: CREATURE }, countX: true }],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'tap', objects: T1 },
          {
            kind: 'conditional',
            condition: {
              kind: 'controlsAtLeast',
              filter: { types: ['creature'], power: { cmp: 'atLeast', value: 4 } },
              count: 1,
            },
            effect: KEEP_TAPPED(T1),
          },
        ],
      },
    },
  }),
  // "Flying. Prowess. Whenever you cast an instant or sorcery spell, tap target creature an opponent controls. That creature doesn't untap during its controller's next untap step."
  singleFace({
    name: 'SYNTHETIC Chill Spirit',
    manaCost: ['2', 'U', 'U'],
    types: ['creature'],
    subtypes: ['Spirit'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 3,
    toughness: 3,
    oracleText:
      "Flying. Prowess. Whenever you cast an instant or sorcery spell, tap target creature an opponent controls. That creature doesn't untap during its controller's next untap step.",
    abilities: [
      { kind: 'keyword', keyword: { kind: 'flying' } },
      { kind: 'keyword', keyword: { kind: 'prowess' } },
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: { stackKind: 'spell', anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }] },
          by: 'you',
        },
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { ...CREATURE, controller: 'opponent' } },
          },
        ],
        effect: { kind: 'sequence', effects: [{ kind: 'tap', objects: T1 }, KEEP_TAPPED(T1)] },
      },
    ],
  }),
  // "Enchant creature. At the beginning of each upkeep, if enchanted creature is untapped, tap it."
  singleFace({
    name: 'SYNTHETIC Drowsy Aura',
    manaCost: ['1', 'U'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'Enchant creature. At the beginning of each upkeep, if enchanted creature is untapped, tap it.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'each' },
        interveningIf: {
          kind: 'objectMatches',
          of: { kind: 'attached' },
          filter: { types: ['creature'], tapped: false },
        },
        effect: { kind: 'tap', objects: { kind: 'attached' } },
      },
    ],
  }),
  // "Roll a d20. 1-9: Tap all creatures your opponents control. 10-19: The same, and they don't untap during their controllers' next untap steps. 20: The same, and until your next
  //  turn creatures your opponents control enter tapped."
  singleFace({
    name: 'SYNTHETIC Cold Table',
    manaCost: ['3', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      "Roll a d20. 1-9: Tap all creatures your opponents control. 10-19: The same, and they don't untap during their controllers' next untap steps. 20: The same, and until your next turn creatures your opponents control enter tapped.",
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'rollDie', sides: 20 },
          { kind: 'conditional', condition: DIE_AT_MOST_9, effect: TAP_THEM_ALL },
          {
            kind: 'conditional',
            condition: DIE_10_TO_19,
            effect: { kind: 'sequence', effects: [TAP_THEM_ALL, KEEP_THEM_TAPPED] },
          },
          {
            kind: 'conditional',
            condition: DIE_20,
            effect: {
              kind: 'sequence',
              effects: [
                TAP_THEM_ALL,
                KEEP_THEM_TAPPED,
                {
                  kind: 'permanentsEnterTapped',
                  permanents: { types: ['creature'], controller: 'opponent' },
                  duration: 'untilYourNextTurn',
                },
              ],
            },
          },
        ],
      },
    },
  }),
  // "Flying. At the beginning of combat on your turn, choose up to one: Tap target creature. Target creature doesn't untap during its controller's next untap step."
  singleFace({
    name: 'SYNTHETIC Slumber Geist',
    manaCost: ['1', 'U', 'U'],
    types: ['creature'],
    subtypes: ['Spirit'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 3,
    toughness: 1,
    oracleText:
      "Flying. At the beginning of combat on your turn, choose up to one: Tap target creature. Target creature doesn't untap during its controller's next untap step.",
    abilities: [
      { kind: 'keyword', keyword: { kind: 'flying' } },
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
        effect: { kind: 'sequence', effects: [] },
        modes: [
          {
            text: 'Tap target creature.',
            targets: [CREATURE_TARGET],
            effect: TAP_TARGET,
          },
          {
            text: "Target creature doesn't untap during its controller's next untap step.",
            targets: [{ id: 't2', what: { kind: 'object', filter: CREATURE } }],
            effect: KEEP_TAPPED({ kind: 'target', id: 't2' }),
          },
        ],
        chooseModes: { min: 0, max: 1 },
      },
    ],
  }),
  // "As this enchantment enters, choose Khans or Dragons. Khans: at the beginning of combat on your turn, put two +1/+1 counters on target creature you control. Dragons: at the
  //  beginning of combat on each opponent's turn, tap target creature that player controls."
  singleFace({
    name: 'SYNTHETIC Dawn Siege',
    manaCost: ['2', 'W', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      "As this enchantment enters, choose Khans or Dragons. Khans: at the beginning of combat on your turn, put two +1/+1 counters on target creature you control. Dragons: at the beginning of combat on each opponent's turn, tap target creature that player controls.",
    abilities: [
      {
        kind: 'replacement',
        replacement: { kind: 'asEntersChoose', what: 'option', options: ['Khans', 'Dragons'] },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { ...CREATURE, controller: 'you' } },
          },
        ],
        effect: { kind: 'addCounters', objects: T1, counter: '+1/+1', count: 2 },
        triggerCondition: { kind: 'chosenOption', option: 'Khans' },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'beginCombat', whose: 'opponent' },
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { ...CREATURE, controller: 'triggerPlayer' } },
          },
        ],
        effect: TAP_TARGET,
        triggerCondition: { kind: 'chosenOption', option: 'Dragons' },
      },
    ],
  }),
  // "Flying. When this creature enters, tap target creature an opponent controls. At the beginning of each opponent's upkeep, if there are four or more card types among cards in
  //  your graveyard, tap target creature that player controls."
  singleFace({
    name: 'SYNTHETIC Ghost Sentinel',
    manaCost: ['W'],
    types: ['creature'],
    subtypes: ['Spirit'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 1,
    toughness: 1,
    oracleText:
      "Flying. When this creature enters, tap target creature an opponent controls. At the beginning of each opponent's upkeep, if there are four or more card types among cards in your graveyard, tap target creature that player controls.",
    abilities: [
      { kind: 'keyword', keyword: { kind: 'flying' } },
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { ...CREATURE, controller: 'opponent' } },
          },
        ],
        effect: TAP_TARGET,
      },
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'upkeep', whose: 'opponent' },
        interveningIf: FOUR_CARD_TYPES,
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { ...CREATURE, controller: 'triggerPlayer' } },
          },
        ],
        effect: TAP_TARGET,
      },
    ],
  }),
  // "{1}, {T}: Tap target creature. This ability costs {1} less to activate during your turn."
  singleFace({
    name: 'SYNTHETIC Winter Crown',
    manaCost: ['3'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      '{1}, {T}: Tap target creature. This ability costs {1} less to activate during your turn.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['1'] }, { kind: 'tap' }],
        targets: [CREATURE_TARGET],
        effect: TAP_TARGET,
        costReducedIf: { generic: 1, condition: { kind: 'yourTurn' } },
      },
    ],
  }),
];
