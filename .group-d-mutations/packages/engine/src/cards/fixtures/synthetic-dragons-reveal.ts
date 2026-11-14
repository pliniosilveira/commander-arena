/**
 * SYNTHETIC CARDS FOR REVEALING AND EXILING FROM THE TOP OF THE LIBRARY. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-151 (the Dragons slice): "shuffles it into their library, then reveals the top card of their library. If it's a permanent
 * card, they put it onto the battlefield" (`revealTop`), "exile cards until you exile a nonland card. You may cast it if its mana value is 8 or less.
 * If you don't, put it into your hand" and Discover with the tapped Treasures for the difference (`exileUntilCast`, `shortfall`), and "look at the top
 * card of your library. If it's a creature card of the chosen type, you may reveal it and put it into your hand" (`lookAtTop` with `rest: 'top'`).
 * Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of
 * a real card.
 */
import type { ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const T1 = { kind: 'target', id: 't1' } as const;
const PERMANENT_CARD: ObjectFilter = {
  anyOf: [
    { types: ['artifact'] },
    { types: ['creature'] },
    { types: ['enchantment'] },
    { types: ['land'] },
    { types: ['planeswalker'] },
    { types: ['battle'] },
  ],
};

export const SYNTHETIC_DRAGONS_REVEAL_LIST: readonly CardDefinition[] = [
  // "The owner of target permanent shuffles it into their library, then reveals the top card of their library. If it's a permanent card, they put it onto
  //  the battlefield."
  singleFace({
    name: 'SYNTHETIC Warp Bolt',
    manaCost: ['2', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      "The owner of target permanent shuffles it into their library, then reveals the top card of their library. If it's a permanent card, they put it onto the battlefield.",
    spell: {
      targets: [{ id: 't1', what: { kind: 'object', filter: {} } }],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'moveToZone', objects: T1, to: 'library' },
          { kind: 'shuffle', player: { kind: 'ownerOf', of: T1 } },
          {
            kind: 'revealTop',
            player: { kind: 'ownerOf', of: T1 },
            ifMatches: PERMANENT_CARD,
            to: 'battlefield',
          },
        ],
      },
    },
  }),
  // "Target player reveals the top card of their library. If it's a permanent card, they put it onto the battlefield."
  singleFace({
    name: 'SYNTHETIC Reveal Probe',
    manaCost: ['1', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      "Target player reveals the top card of their library. If it's a permanent card, they put it onto the battlefield.",
    spell: {
      targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
      effect: {
        kind: 'revealTop',
        player: { kind: 'target', id: 't1' },
        ifMatches: PERMANENT_CARD,
        to: 'battlefield',
      },
    },
  }),
  // "When this enchantment enters, exile cards from the top of your library until you exile a nonland card. You may cast it without paying its mana cost if
  //  that spell's mana value is 4 or less. If you don't, put that card into your hand. When a Dragon you control enters, return this enchantment to its
  //  owner's hand."
  singleFace({
    name: 'SYNTHETIC Breaching Hoard',
    manaCost: ['4', 'R'],
    types: ['enchantment'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      "When this enchantment enters, exile cards from the top of your library until you exile a nonland card. You may cast it without paying its mana cost if that spell's mana value is 4 or less. If you don't, put that card into your hand.\nWhen a Dragon you control enters, return this enchantment to its owner's hand.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: { kind: 'exileUntilCast', castAtMost: 4, rest: 'stayExiled' },
      },
      {
        kind: 'triggered',
        trigger: {
          kind: 'entersBattlefield',
          what: { subtypes: ['Dragon'], types: ['creature'], controller: 'you' },
        },
        effect: { kind: 'moveToZone', objects: { kind: 'this' }, to: 'hand' },
      },
    ],
  }),
  // "Discover 4. If the discovered card's mana value is less than 4, create a number of tapped Treasure tokens equal to the difference."
  singleFace({
    name: 'SYNTHETIC Discovery Rite',
    manaCost: ['4', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      "Discover 4. If the discovered card's mana value is less than 4, create a number of tapped Treasure tokens equal to the difference.",
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exileUntilCast', foundAtMost: 4, rest: 'bottomRandom' },
          {
            kind: 'createToken',
            token: { kind: 'preset', preset: 'Treasure' },
            count: { kind: 'shortfall', limit: 4, of: { kind: 'moved' } },
            tapped: true,
          },
        ],
      },
    },
  }),
  // "As this artifact enters, choose a creature type. Creature spells you cast of the chosen type cost {1} less to cast. At the beginning of your upkeep,
  //  look at the top card of your library. If it's a creature card of the chosen type, you may reveal it and put it into your hand."
  singleFace({
    name: 'SYNTHETIC Herald Trumpet',
    manaCost: ['3'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      "As this artifact enters, choose a creature type. Creature spells you cast of the chosen type cost {1} less to cast. At the beginning of your upkeep, look at the top card of your library. If it's a creature card of the chosen type, you may reveal it and put it into your hand.",
    abilities: [
      { kind: 'replacement', replacement: { kind: 'asEntersChoose', what: 'creatureType' } },
      {
        kind: 'static',
        static: {
          kind: 'costReduction',
          spells: { types: ['creature'], controller: 'you', chosenType: true },
          amount: 1,
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'you' },
        effect: {
          kind: 'lookAtTop',
          count: 1,
          take: { filter: { types: ['creature'], chosenType: true }, max: 1 },
          rest: 'top',
        },
      },
    ],
  }),
  // "When this creature enters, you may behold a Dragon. If you do, create a Treasure token. Whenever a Dragon you control enters, put a +1/+1 counter on
  //  this creature. Until end of turn, it becomes a Dragon in addition to its other types and gains flying."
  singleFace({
    name: 'SYNTHETIC Dragon Scout',
    manaCost: ['1', 'R'],
    types: ['creature'],
    subtypes: ['Human', 'Druid'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText:
      'When this creature enters, you may behold a Dragon. If you do, create a Treasure token.\nWhenever a Dragon you control enters, put a +1/+1 counter on this creature. Until end of turn, it becomes a Dragon in addition to its other types and gains flying.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'may', effect: { kind: 'behold', filter: { subtypes: ['Dragon'] } } },
            {
              kind: 'conditional',
              condition: { kind: 'didPrevious' },
              effect: {
                kind: 'createToken',
                token: { kind: 'preset', preset: 'Treasure' },
                count: 1,
              },
            },
          ],
        },
      },
      {
        kind: 'triggered',
        trigger: {
          kind: 'entersBattlefield',
          what: { subtypes: ['Dragon'], types: ['creature'], controller: 'you' },
        },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'addCounters', objects: { kind: 'this' }, counter: '+1/+1', count: 1 },
            {
              kind: 'setTypes',
              objects: { kind: 'this' },
              subtypes: ['Dragon'],
              additive: true,
              duration: 'untilEndOfTurn',
            },
            {
              kind: 'grantKeyword',
              objects: { kind: 'this' },
              keyword: { kind: 'flying' },
              duration: 'untilEndOfTurn',
            },
          ],
        },
      },
    ],
  }),
];
