/**
 * SYNTHETIC CARDS FOR GROUP 2 OF THE FEATHER DECK (ISSUE 27, D-1310 TO D-1316 NUMBERS). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what the group added to the engine: a static ability whose subject is "commander creatures you control" (`ObjectFilter.commander` in a static subject,
 * CR 903.3), a damage spell with two targets that must differ ("another target creature", `TargetSpec.differentFrom`, CR 115.3), two damage amounts to two targets, a creature
 * that triggers on attacking, blocking and becoming the target of a spell and has "Monstrosity 5" (CR 701.37), a modal spell and "Activate only as a sorcery and only if you've
 * cast an instant or sorcery spell this turn" (`spellsCastThisTurn` with `ofTypes`, CR 602.5b, 601.2i). Names start with "SYNTHETIC "; oracleId is null. The text describes what
 * the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Effect, ObjectFilter, SpellMode } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const COMMANDER_CREATURES: ObjectFilter = {
  types: ['creature'],
  controller: 'you',
  commander: true,
};

/** "It deals damage equal to its power to each opponent." */
const POWER_TO_EACH_OPPONENT: Effect = {
  kind: 'dealDamage',
  amount: { kind: 'powerOf', of: { kind: 'this' } },
  to: { kind: 'eachOpponent' },
};

const COUNTER_AND_UNTAP: SpellMode = {
  text: 'Put a +1/+1 counter on target creature or Vehicle. Untap it.',
  targets: [
    {
      id: 't1',
      what: {
        kind: 'object',
        filter: { zone: 'battlefield', anyOf: [{ types: ['creature'] }, { subtypes: ['Vehicle'] }] },
      },
    },
  ],
  effect: {
    kind: 'sequence',
    effects: [
      {
        kind: 'addCounters',
        objects: { kind: 'target', id: 't1' },
        counter: '+1/+1',
        count: 1,
      },
      { kind: 'untap', objects: { kind: 'target', id: 't1' } },
    ],
  },
};

const RETURN_YOURS: SpellMode = {
  text: "Return target permanent you control to its owner's hand.",
  targets: [
    { id: 't2', what: { kind: 'object', filter: { zone: 'battlefield', controller: 'you' } } },
  ],
  effect: { kind: 'moveToZone', objects: { kind: 'target', id: 't2' }, to: 'hand' },
};

export const SYNTHETIC_FEATHER_G2_LIST: readonly CardDefinition[] = [
  // "Commander creatures you control get +2/+2 and have indestructible."
  singleFace({
    name: 'SYNTHETIC Commander Guard',
    manaCost: ['2', 'W'],
    types: ['creature'],
    subtypes: ['Human', 'Soldier'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 3,
    toughness: 3,
    oracleText: 'Commander creatures you control get +2/+2 and have indestructible.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: { kind: 'filter', filter: COMMANDER_CREATURES },
          power: 2,
          toughness: 2,
        },
      },
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter: COMMANDER_CREATURES },
          keyword: { kind: 'indestructible' },
        },
      },
    ],
  }),
  // "Target creature you control deals damage equal to its power to another target creature."
  singleFace({
    name: 'SYNTHETIC Hammer Blow',
    manaCost: ['1', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Target creature you control deals damage equal to its power to another target creature.',
    spell: {
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
          },
        },
        {
          id: 't2',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
          differentFrom: 't1',
        },
      ],
      effect: {
        kind: 'dealDamage',
        amount: { kind: 'powerOf', of: { kind: 'target', id: 't1' } },
        to: { kind: 'target', id: 't2' },
        from: { kind: 'target', id: 't1' },
      },
    },
  }),
  // "~ deals 4 damage to target creature you don't control and 2 damage to target creature you control."
  singleFace({
    name: 'SYNTHETIC Twin Strike',
    manaCost: ['R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      "SYNTHETIC Twin Strike deals 4 damage to target creature you don't control and 2 damage to target creature you control.",
    spell: {
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
          },
        },
        {
          id: 't2',
          what: {
            kind: 'object',
            filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
          },
        },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'dealDamage', amount: 4, to: { kind: 'target', id: 't1' } },
          { kind: 'dealDamage', amount: 2, to: { kind: 'target', id: 't2' } },
        ],
      },
    },
  }),
  // "Indestructible. Whenever this creature attacks, blocks, or becomes the target of a spell, it deals damage equal to its power to each opponent. {5}: Monstrosity 5."
  singleFace({
    name: 'SYNTHETIC Spike Toy',
    manaCost: ['4'],
    types: ['artifact', 'creature'],
    subtypes: ['Toy'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText:
      'Indestructible\nWhenever this creature attacks, blocks, or becomes the target of a spell, it deals damage equal to its power to each opponent.\n{5}: Monstrosity 5.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'indestructible' } },
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        effect: POWER_TO_EACH_OPPONENT,
      },
      {
        kind: 'triggered',
        trigger: { kind: 'blocks', what: { kind: 'this' } },
        effect: POWER_TO_EACH_OPPONENT,
      },
      {
        kind: 'triggered',
        trigger: { kind: 'becomesTarget', what: { kind: 'this' }, by: 'any', spellOnly: true },
        effect: POWER_TO_EACH_OPPONENT,
      },
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['5'] }],
        effect: { kind: 'monstrosity', count: 5 },
      },
    ],
  }),
  // "Choose one — Put a +1/+1 counter on target creature or Vehicle. Untap it. / Return target permanent you control to its owner's hand."
  singleFace({
    name: 'SYNTHETIC Way Light',
    manaCost: ['W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      "Choose one —\n• Put a +1/+1 counter on target creature or Vehicle. Untap it.\n• Return target permanent you control to its owner's hand.",
    spell: { modes: [COUNTER_AND_UNTAP, RETURN_YOURS], chooseModes: { min: 1, max: 1 } },
  }),
  // "{T}: Add {C}. {1}, {T}: Add one mana of any color. {T}: Put a +1/+1 counter on target creature. Activate only as a sorcery and only if you've cast an instant or sorcery spell this turn."
  singleFace({
    name: 'SYNTHETIC Oracle Hall',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: [],
    oracleText:
      "{T}: Add {C}.\n{1}, {T}: Add one mana of any color.\n{T}: Put a +1/+1 counter on target creature. Activate only as a sorcery and only if you've cast an instant or sorcery spell this turn.",
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'fixed', mana: ['C'] },
      },
      {
        kind: 'mana',
        cost: [{ kind: 'mana', symbols: ['1'] }, { kind: 'tap' }],
        production: { kind: 'anyColor' },
      },
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
          },
        ],
        effect: {
          kind: 'addCounters',
          objects: { kind: 'target', id: 't1' },
          counter: '+1/+1',
          count: 1,
        },
        timing: 'sorcery',
        activateOnlyIf: { kind: 'spellsCastThisTurn', atLeast: 1, ofTypes: ['instant', 'sorcery'] },
      },
    ],
  }),
];
