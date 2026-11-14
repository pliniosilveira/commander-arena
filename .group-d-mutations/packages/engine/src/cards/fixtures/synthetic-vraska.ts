/**
 * SYNTHETIC CARDS FOR THE VRASKA DECK PROGRAM (D-206 and after). NOT REAL MAGIC CARDS.
 *
 * Invented for the engine tests of the whole-deck program: the pieces whose real wording is played in `packages/cards/test/convert-grammar-engine-p49.test.ts`
 * and after need no fixture, these are only for the tests that need the AST without a parser (the executable keyword list, the validator). Names
 * start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

/** A preparation card (CR 722, D-214): a creature that enters prepared, and its prepare spell (gain 2 life, as a sorcery). */
const scoutFront = singleFace({
  name: 'Prepared Scout',
  manaCost: ['1', 'R'],
  types: ['creature'],
  subtypes: ['Scout'],
  colors: ['R'],
  colorIdentity: ['R'],
  power: 2,
  toughness: 1,
  oracleText: 'This creature enters prepared.',
  abilities: [{ kind: 'replacement', replacement: { kind: 'entersPrepared' } }],
});
const scoutSpell = singleFace({
  name: 'Scout Tidings',
  manaCost: ['R'],
  types: ['sorcery'],
  colors: ['R'],
  colorIdentity: ['R'],
  oracleText: 'You gain 2 life.',
  spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 2 } },
});
const SYNTHETIC_PREPARED_SCOUT: CardDefinition = {
  ...scoutFront,
  name: 'SYNTHETIC Prepared Scout // Scout Tidings',
  layout: 'prepare',
  faces: [...scoutFront.faces, ...scoutSpell.faces],
};

export const SYNTHETIC_VRASKA_LIST: readonly CardDefinition[] = [
  SYNTHETIC_PREPARED_SCOUT,
  // Job select (CR 702.182a), an Equipment with a bonus and Equip, for the executable keyword list.
  singleFace({
    name: 'SYNTHETIC Job Blade',
    manaCost: ['2'],
    types: ['artifact'],
    subtypes: ['Equipment'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Job select. Equipped creature gets +1/+1. Equip {2}',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'jobSelect' } },
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: { kind: 'attached', types: ['creature'] },
          power: 1,
          toughness: 1,
        },
      },
      { kind: 'keyword', keyword: { kind: 'equip', cost: [{ kind: 'mana', symbols: ['2'] }] } },
    ],
  }),
  // The players an effect asks (D-210): each player may discard their hand and draw three cards when it dies.
  singleFace({
    name: 'SYNTHETIC Ruin Walker',
    manaCost: ['3', 'R'],
    types: ['creature'],
    subtypes: ['Construct'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 3,
    toughness: 3,
    oracleText: 'When this creature dies, each player may discard their hand and draw three cards.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { kind: 'this' } },
        effect: {
          kind: 'playersMay',
          players: { kind: 'eachPlayer' },
          runsAs: 'chooser',
          effect: {
            kind: 'sequence',
            effects: [
              {
                kind: 'discard',
                player: { kind: 'you' },
                count: { kind: 'countOf', filter: { zone: 'hand', controller: 'you' } },
              },
              { kind: 'draw', player: { kind: 'you' }, count: 3 },
            ],
          },
        },
      },
    ],
  }),
  // Energy (D-209): get two, draw a card, then discard a card at random unless you pay two.
  singleFace({
    name: 'SYNTHETIC Energy Cantrip',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'You get {E}{E}. Draw a card. Then discard a card at random unless you pay {E}{E}.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'gainEnergy', player: { kind: 'you' }, amount: 2 },
          { kind: 'draw', player: { kind: 'you' }, count: 1 },
          {
            kind: 'unlessPays',
            player: { kind: 'you' },
            cost: [{ kind: 'energy', count: 2 }],
            effect: { kind: 'discard', player: { kind: 'you' }, count: 1, random: true },
          },
        ],
      },
    },
  }),
  // Connive (D-209).
  singleFace({
    name: 'SYNTHETIC Conniver',
    manaCost: ['1', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Target creature you control connives.',
    spell: {
      targets: [
        { id: 't1', what: { kind: 'object', filter: { types: ['creature'], controller: 'you' } } },
      ],
      effect: { kind: 'connive', objects: { kind: 'target', id: 't1' } },
    },
  }),
  // A land that asks for a card to reveal (D-208).
  singleFace({
    name: 'SYNTHETIC Reveal Land',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: ['G'],
    oracleText:
      "As this land enters, you may reveal a land card from your hand. If you don't, it enters tapped. {T}: Add {G}.",
    abilities: [
      {
        kind: 'replacement',
        replacement: {
          kind: 'entersTappedUnlessReveals',
          filter: { types: ['land'] },
          words: 'a land card',
        },
      },
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['G'] } },
    ],
  }),
  // Mill as the cost of a mana ability (D-208).
  singleFace({
    name: 'SYNTHETIC Mill Stone',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '{T}, Mill a card: Add {C}.',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }, { kind: 'mill', count: 1 }],
        production: { kind: 'fixed', mana: ['C'] },
      },
    ],
  }),
  // A token copy of each creature a player controls, with haste and a sacrifice at the end step (D-213).
  singleFace({
    name: 'SYNTHETIC Copy Mirror',
    manaCost: ['4', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'For each creature target player controls, create a token that\'s a copy of that creature, except it has haste and "At the beginning of the end step, sacrifice this creature."',
    spell: {
      targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
      effect: {
        kind: 'createCopies',
        objects: {
          kind: 'each',
          filter: { types: ['creature'], controlledBy: { kind: 'target', id: 't1' } },
        },
        abilities: [
          { kind: 'keyword', keyword: { kind: 'haste' } },
          {
            kind: 'triggered',
            trigger: { kind: 'endStep', whose: 'each' },
            effect: { kind: 'sacrifice', objects: { kind: 'this' } },
          },
        ],
      },
    },
  }),
];
