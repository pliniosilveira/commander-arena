/**
 * SYNTHETIC CARDS FOR THE VRASKA EDHREC DECK PROGRAM (D-216 to D-220). NOT REAL MAGIC CARDS.
 *
 * Invented for the AI soak style 'edhrec' (`packages/ai/test/edhrec-games.test.ts`): whole games between agents on decks of the mechanics of the program, which
 * ask questions of players in the middle of a resolution (the lands to untap, the piles of the top cards, how many cards to draw) and change what happens when
 * tokens are created or abilities trigger. The real wording of every piece is played in `packages/cards/test/convert-grammar-engine-p63.test.ts` and after. Names
 * start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const gain1 = {
  kind: 'triggered',
  trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
  effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
} as const;

export const SYNTHETIC_EDHREC_LIST: readonly CardDefinition[] = [
  // Frantic Search's untap: draw a card, then untap up to two lands (any player's).
  singleFace({
    name: 'SYNTHETIC Untap Cantrip',
    manaCost: ['1', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Draw a card. Untap up to two lands.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', player: { kind: 'you' }, count: 1 },
          {
            kind: 'untap',
            objects: { kind: 'choose', filter: { types: ['land'] }, count: 2, upTo: true },
          },
        ],
      },
    },
  }),
  // Expressive Iteration's split: look at the top three, one to the hand, one to the bottom, one exiled and playable this turn.
  singleFace({
    name: 'SYNTHETIC Top Sorter',
    manaCost: ['U', 'R'],
    types: ['sorcery'],
    colors: ['U', 'R'],
    colorIdentity: ['U', 'R'],
    oracleText:
      'Look at the top three cards of your library. Put one into your hand, one on the bottom, and exile one. You may play the exiled card this turn.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'lookAndSplit', count: 3, hand: 1, bottom: 1, exile: 1 },
          { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn' },
        ],
      },
    },
  }),
  // Arcane Denial's delayed draw of the countered spell's controller, up to two cards, and the controller's own card.
  singleFace({
    name: 'SYNTHETIC Delayed Denial',
    manaCost: ['1', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      "Counter target spell. Its controller may draw up to two cards at the beginning of the next turn's upkeep. You draw a card at the beginning of the next turn's upkeep.",
    spell: {
      targets: [
        { id: 't1', what: { kind: 'object', filter: { zone: 'stack', stackKind: 'spell' } } },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'counter', objects: { kind: 'target', id: 't1' } },
          {
            kind: 'delayedTrigger',
            at: { step: 'upkeep', whose: 'each' },
            effect: {
              kind: 'draw',
              player: { kind: 'controllerOf', of: { kind: 'target', id: 't1' } },
              count: 2,
              upTo: true,
            },
          },
          {
            kind: 'delayedTrigger',
            at: { step: 'upkeep', whose: 'each' },
            effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
          },
        ],
      },
    },
  }),
  // Mana Sculpt's delayed mana: as much {C} as was spent on the countered spell, at the beginning of the controller's next main phase.
  singleFace({
    name: 'SYNTHETIC Mana Echo',
    manaCost: ['1', 'U', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'Counter target spell. Add as much {C} as was spent to cast it at the beginning of your next main phase.',
    spell: {
      targets: [
        { id: 't1', what: { kind: 'object', filter: { zone: 'stack', stackKind: 'spell' } } },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'counter', objects: { kind: 'target', id: 't1' } },
          {
            kind: 'delayedTrigger',
            at: { step: 'nextMain', whose: 'you' },
            effect: {
              kind: 'addMana',
              mana: {
                kind: 'fixed',
                mana: ['C'],
                times: { kind: 'manaSpent', of: { kind: 'target', id: 't1' } },
              },
            },
          },
        ],
      },
    },
  }),
  // Mister Fantastic: whenever one or more tokens you control enter, you may draw a card.
  singleFace({
    name: 'SYNTHETIC Token Watcher',
    manaCost: ['3', 'U'],
    types: ['creature'],
    subtypes: ['Scientist'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 2,
    toughness: 4,
    oracleText: 'Whenever one or more tokens you control enter, you may draw a card.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBatch', what: { token: true, controller: 'you' } },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        optional: true,
      },
    ],
  }),
  // Storm-Kiln Artist: whenever you cast or copy an instant or sorcery spell, create a Treasure token.
  singleFace({
    name: 'SYNTHETIC Spell Echoer',
    manaCost: ['3', 'R'],
    types: ['creature'],
    subtypes: ['Shaman'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText: 'Whenever you cast or copy an instant or sorcery spell, create a Treasure token.',
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: { anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }] },
          by: 'you',
          orCopy: true,
        },
        effect: {
          kind: 'createToken',
          token: { kind: 'preset', preset: 'Treasure' },
          count: 1,
        },
      },
    ],
  }),
  // Kykar: a mana ability that sacrifices a creature of the controller's.
  singleFace({
    name: 'SYNTHETIC Blood Altar',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: ['R'],
    oracleText: 'Sacrifice a creature: Add {R}.',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'sacrifice', what: { types: ['creature'] } }],
        production: { kind: 'fixed', mana: ['R'] },
      },
    ],
  }),
  // Draconic Visitor: artifact tokens are replaced by as many 5/5 Dragons with flying.
  singleFace({
    name: 'SYNTHETIC Dragon Maker',
    manaCost: ['3', 'R', 'R'],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 5,
    toughness: 5,
    oracleText:
      'Flying. If one or more artifact tokens would be created under your control, that many 5/5 red Dragon creature tokens with flying are created instead.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'flying' } },
      {
        kind: 'replacement',
        replacement: {
          kind: 'tokensInstead',
          what: { types: ['artifact'], token: true },
          mode: 'thatMany',
          token: {
            kind: 'custom',
            definition: {
              name: 'Dragon',
              manaCost: null,
              supertypes: [],
              types: ['creature'],
              subtypes: ['Dragon'],
              colors: ['R'],
              power: 5,
              toughness: 5,
              loyalty: null,
              defense: null,
              oracleText: '',
              abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }],
            },
          },
        },
      },
    ],
  }),
  // Stridehangar Automaton: the artifact tokens are made and one 1/1 Thopter with them.
  singleFace({
    name: 'SYNTHETIC Thopter Automaton',
    manaCost: ['3'],
    types: ['artifact', 'creature'],
    subtypes: ['Construct'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 4,
    oracleText:
      'If one or more artifact tokens would be created under your control, those tokens plus an additional 1/1 colorless Thopter artifact creature token with flying are created instead.',
    abilities: [
      {
        kind: 'replacement',
        replacement: {
          kind: 'tokensInstead',
          what: { types: ['artifact'], token: true },
          mode: 'plus',
          token: {
            kind: 'custom',
            definition: {
              name: 'Thopter',
              manaCost: null,
              supertypes: [],
              types: ['artifact', 'creature'],
              subtypes: ['Thopter'],
              colors: [],
              power: 1,
              toughness: 1,
              loyalty: null,
              defense: null,
              oracleText: '',
              abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }],
            },
          },
        },
      },
    ],
  }),
  // Harmonic Prodigy: a triggered ability of another Wizard you control triggers an additional time.
  singleFace({
    name: 'SYNTHETIC Twice Wizard',
    manaCost: ['1', 'R'],
    types: ['creature'],
    subtypes: ['Human', 'Wizard'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 1,
    toughness: 3,
    oracleText:
      'If a triggered ability of another Wizard you control triggers, that ability triggers an additional time.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'doubleTriggers',
          subject: {
            kind: 'filter',
            filter: { subtypes: ['Wizard'], controller: 'you' },
            other: true,
          },
        },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Echo Wizard',
    manaCost: ['1', 'U'],
    types: ['creature'],
    subtypes: ['Human', 'Wizard'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 1,
    toughness: 1,
    oracleText: 'When this creature enters, you gain 1 life.',
    abilities: [gain1],
  }),
  // Wizard's Staff: Equip Wizard {1}, Equip {3}, and a triggered ability of the equipped creature triggers an additional time.
  singleFace({
    name: 'SYNTHETIC Wizard Staff',
    manaCost: ['1', 'U'],
    types: ['artifact'],
    subtypes: ['Equipment'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'If a triggered ability of equipped creature triggers, that ability triggers an additional time. Equip Wizard {1} Equip {3}',
    abilities: [
      {
        kind: 'static',
        static: { kind: 'doubleTriggers', subject: { kind: 'attached', types: ['creature'] } },
      },
      {
        kind: 'keyword',
        keyword: {
          kind: 'equip',
          cost: [{ kind: 'mana', symbols: ['1'] }],
          restriction: { subtypes: ['Wizard'] },
        },
      },
      { kind: 'keyword', keyword: { kind: 'equip', cost: [{ kind: 'mana', symbols: ['3'] }] } },
    ],
  }),
  // Roar of Resistance: whenever one or more creatures attack, you may pay {1}: creatures attacking your opponents get +1/+0.
  singleFace({
    name: 'SYNTHETIC Attack Roar',
    manaCost: ['1', 'R'],
    types: ['enchantment'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Whenever one or more creatures attack, you may pay {1}. If you do, creatures attacking your opponents and/or planeswalkers they control get +1/+0 until end of turn.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'attackBatch', who: 'any', atLeast: 1 },
        effect: {
          kind: 'mayPay',
          cost: [{ kind: 'mana', symbols: ['1'] }],
          effect: {
            kind: 'modifyPt',
            objects: {
              kind: 'each',
              filter: { zone: 'battlefield', types: ['creature'], attackingOpponents: true },
            },
            power: 1,
            toughness: 0,
            duration: 'untilEndOfTurn',
          },
        },
      },
    ],
  }),
  // A maker of two Treasure tokens, for the replacements and the watchers.
  singleFace({
    name: 'SYNTHETIC Treasure Pair',
    manaCost: ['1', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Create two Treasure tokens.',
    spell: {
      effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 2 },
    },
  }),
];
