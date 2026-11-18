/**
 * SYNTHETIC CARDS FOR GROUP 2 OF THE PRISMARI DECK (ISSUE 87, D-632 AND LATER). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what the group added to the engine: effects that read the spell that was cast (its mana value and the mana spent on it, `objectMatches` and `manaValueOf` of
 * the `triggerSubject` of a `castSpell` trigger, `manaSpent` with `of`), the greatest mana value among the spells cast this turn (`greatestManaValueCast`), divided damage among any
 * targets, tokens that must attack each opponent, the mana that stays through steps and phases, a spell exiled with time counters, a flashback cost with life, a creature that can block
 * only creatures with flying, a creature that becomes a land creature with a granted ability that works on its controller's turn, and a copy of an exiled card that its controller may
 * cast. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card (the real ones
 * are read from the golden corpus by the grammar, and have the same abilities).
 */
import type { Ability, Effect, TokenDefinition } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const MOVED = { kind: 'moved' } as const;
const FLYING: Ability = { kind: 'keyword', keyword: { kind: 'flying' } };
const HASTE: Ability = { kind: 'keyword', keyword: { kind: 'haste' } };
const INSTANT_OR_SORCERY = [{ types: ['instant' as const] }, { types: ['sorcery' as const] }];

/** "A N/N blue and red Elemental creature token" (with the keywords given). */
const elemental = (
  power: number,
  toughness: number,
  abilities: readonly Ability[] = [],
): TokenDefinition => ({
  name: 'Elemental',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Elemental'],
  colors: ['U', 'R'],
  power,
  toughness,
  loyalty: null,
  defense: null,
  oracleText: '',
  abilities,
});

/** "At the beginning of the next end step, exile those tokens": the delayed ability of the tokens the effects before it made. */
const exileAtNextEndStep: Effect = {
  kind: 'delayedTrigger',
  at: { step: 'endStep', whose: 'each' },
  effect: { kind: 'exile', objects: MOVED },
};

export const SYNTHETIC_PRISMARI_G2_LIST: readonly CardDefinition[] = [
  // "Whenever you cast an instant or sorcery spell, create a 1/1 blue and red Elemental creature token. If that spell's mana value is 5 or greater, create three of those tokens instead."
  singleFace({
    name: 'SYNTHETIC Piano Elemental',
    manaCost: ['1', 'R', 'R'],
    types: ['creature'],
    subtypes: ['Djinn', 'Bard'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 3,
    toughness: 3,
    oracleText:
      "Whenever you cast an instant or sorcery spell, create a 1/1 blue and red Elemental creature token. If that spell's mana value is 5 or greater, create three of those tokens instead.",
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: { stackKind: 'spell', anyOf: INSTANT_OR_SORCERY },
          by: 'you',
        },
        effect: {
          kind: 'conditional',
          condition: {
            kind: 'objectMatches',
            of: { kind: 'triggerSubject' },
            filter: { manaValue: { cmp: 'atLeast', value: 5 } },
          },
          effect: {
            kind: 'createToken',
            token: { kind: 'custom', definition: elemental(1, 1) },
            count: 3,
          },
          else: {
            kind: 'createToken',
            token: { kind: 'custom', definition: elemental(1, 1) },
            count: 1,
          },
        },
      },
    ],
  }),
  // "At the beginning of combat on your turn, if you've cast an instant or sorcery spell this turn, create an X/X blue and red Elemental creature token with flying and haste, where X
  //  is the greatest mana value among instant and sorcery spells you've cast this turn."
  singleFace({
    name: 'SYNTHETIC Moment Master',
    manaCost: ['2', 'U', 'R'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Orc', 'Sorcerer'],
    colors: ['U', 'R'],
    colorIdentity: ['U', 'R'],
    power: 3,
    toughness: 3,
    oracleText:
      "At the beginning of combat on your turn, if you've cast an instant or sorcery spell this turn, create an X/X blue and red Elemental creature token with flying and haste, where X is the greatest mana value among instant and sorcery spells you've cast this turn.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
        interveningIf: {
          kind: 'spellsCastThisTurn',
          atLeast: 1,
          ofTypes: ['instant', 'sorcery'],
        },
        effect: {
          kind: 'createToken',
          token: {
            kind: 'custom',
            definition: elemental(0, 0, [FLYING, HASTE]),
            ptAmount: { kind: 'greatestManaValueCast', ofTypes: ['instant', 'sorcery'] },
          },
          count: 1,
        },
      },
    ],
  }),
  // "Whenever you cast an instant or sorcery spell, this creature gets +X/+0 until end of turn, where X is that spell's mana value."
  singleFace({
    name: 'SYNTHETIC Charging Ox',
    manaCost: ['4', 'R'],
    types: ['creature'],
    subtypes: ['Ox'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 4,
    toughness: 4,
    oracleText:
      "Trample\nWhenever you cast an instant or sorcery spell, this creature gets +X/+0 until end of turn, where X is that spell's mana value.",
    abilities: [
      { kind: 'keyword', keyword: { kind: 'trample' } },
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: { stackKind: 'spell', anyOf: INSTANT_OR_SORCERY },
          by: 'you',
        },
        effect: {
          kind: 'modifyPt',
          objects: { kind: 'this' },
          power: { kind: 'manaValueOf', of: { kind: 'triggerSubject' } },
          toughness: 0,
          duration: 'untilEndOfTurn',
        },
      },
    ],
  }),
  // "Flying\nWhenever you cast a noncreature spell, create an X/X red Dragon Illusion creature token with flying and haste, where X is the amount of mana spent to cast that spell.
  //  Exile that token at the beginning of the next end step."
  singleFace({
    name: 'SYNTHETIC Manaform Drake',
    manaCost: ['2', 'R', 'R'],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 3,
    toughness: 4,
    oracleText:
      'Flying\nWhenever you cast a noncreature spell, create an X/X red Dragon Illusion creature token with flying and haste, where X is the amount of mana spent to cast that spell. Exile that token at the beginning of the next end step.',
    abilities: [
      FLYING,
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: { stackKind: 'spell', notTypes: ['creature'] },
          by: 'you',
        },
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'createToken',
              token: {
                kind: 'custom',
                definition: {
                  ...elemental(0, 0, [FLYING, HASTE]),
                  name: 'Dragon Illusion',
                  subtypes: ['Dragon', 'Illusion'],
                  colors: ['R'],
                },
                ptAmount: { kind: 'manaSpent', of: { kind: 'triggerSubject' } },
              },
              count: 1,
            },
            exileAtNextEndStep,
          ],
        },
      },
    ],
  }),
  // Spells of known mana values for the triggers that read "that spell's mana value" and "the greatest mana value".
  singleFace({
    name: 'SYNTHETIC Prismari Big Study',
    manaCost: ['4', 'U', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Draw a card.',
    spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
  }),
  singleFace({
    name: 'SYNTHETIC Prismari X Spell',
    manaCost: ['X', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'You gain X life.',
    spell: {
      x: true,
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: { kind: 'x' } },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Prismari Trinket',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '',
  }),
  // "Instant and sorcery spells you cast cost {1} less to cast."
  singleFace({
    name: 'SYNTHETIC Prismari Discounter',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Instant and sorcery spells you cast cost {1} less to cast.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'costReduction',
          spells: { controller: 'you', anyOf: INSTANT_OR_SORCERY },
          amount: 1,
        },
      },
    ],
  }),
  // A plain creature spell of mana value 2.
  singleFace({
    name: 'SYNTHETIC Prismari Apprentice',
    manaCost: ['1', 'R'],
    types: ['creature'],
    subtypes: ['Human', 'Wizard'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText: '',
  }),
  // "Target player draws two cards. Flashback—{1}{U}, Pay 3 life."
  singleFace({
    name: 'SYNTHETIC Deep Study',
    manaCost: ['3', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Target player draws two cards.\nFlashback\u2014{1}{U}, Pay 3 life.',
    abilities: [
      {
        kind: 'keyword',
        keyword: {
          kind: 'flashback',
          cost: [
            { kind: 'mana', symbols: ['1', 'U'] },
            { kind: 'payLife', amount: 3 },
          ],
        },
      },
    ],
    spell: {
      targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
      effect: { kind: 'draw', player: { kind: 'target', id: 't1' }, count: 2 },
    },
  }),
  // "Flash\nFlying\nThis creature can block only creatures with flying."
  singleFace({
    name: 'SYNTHETIC Skittish Borrower',
    manaCost: ['1', 'U', 'U'],
    types: ['creature'],
    subtypes: ['Faerie', 'Rogue'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 3,
    toughness: 1,
    oracleText: 'Flash\nFlying\nThis creature can block only creatures with flying.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'flash' } },
      FLYING,
      {
        kind: 'static',
        static: { kind: 'restriction', subject: { kind: 'this' }, restriction: 'canBlockOnlyFlying' },
      },
    ],
  }),
];
