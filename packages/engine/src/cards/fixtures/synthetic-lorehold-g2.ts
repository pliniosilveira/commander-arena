/**
 * SYNTHETIC CARDS FOR GROUP 2 OF THE LOREHOLD SPIRIT DECK (issue 86, D-616 and later). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what the real cards of the group need from the engine, written out by hand (the cards package checks that the grammar lowers the real Oracle text to these
 * same nodes): a sorcery in which each player votes for past or present, the controller mills a card for each past vote and each opponent is dealt damage equal to the total mana value of
 * the cards milled, and the controller exiles the top card of their library for each present vote and may play the exiled cards until the end of their next turn; a creature with vigilance that
 * exiles a noncreature, nonland card of its controller's graveyard at the beginning of their end step and creates a 3/2 Spirit token, and whose activated ability (sacrificing a Spirit) lets
 * its controller cast a card exiled with it this turn without paying its mana cost, the spell going to the bottom of its owner's library instead of a graveyard. One more is a plain Spirit
 * creature to sacrifice. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const T1 = { kind: 'target', id: 't1' } as const;

const LORE_ABILITIES: readonly Ability[] = [
  { kind: 'keyword', keyword: { kind: 'vigilance' } },
  {
    kind: 'triggered',
    trigger: { kind: 'endStep', whose: 'you' },
    targets: [
      {
        id: 't1',
        what: {
          kind: 'object',
          filter: { zone: 'graveyard', notTypes: ['creature', 'land'], controller: 'you' },
        },
      },
    ],
    effect: {
      kind: 'sequence',
      effects: [
        { kind: 'exile', objects: T1, linked: true },
        {
          kind: 'createToken',
          token: {
            kind: 'custom',
            definition: {
              name: 'Spirit',
              manaCost: null,
              supertypes: [],
              types: ['creature'],
              subtypes: ['Spirit'],
              colors: ['R', 'W'],
              power: 3,
              toughness: 2,
              loyalty: null,
              defense: null,
              oracleText: '',
              abilities: [],
            },
          },
          count: 1,
        },
      ],
    },
  },
  {
    kind: 'activated',
    cost: [
      { kind: 'mana', symbols: ['1', 'R', 'W'] },
      { kind: 'tap' },
      { kind: 'sacrifice', what: { subtypes: ['Spirit'] } },
    ],
    targets: [
      { id: 't1', what: { kind: 'object', filter: { zone: 'exile', exiledWithSource: true } } },
    ],
    effect: {
      kind: 'mayCast',
      objects: T1,
      duration: 'untilEndOfTurn',
      from: 'exile',
      free: true,
      bottomInstead: true,
    },
  },
];

export const SYNTHETIC_LOREHOLD_G2_LIST: readonly CardDefinition[] = [
  // "Starting with you, each player votes for past or present. You mill a card for each past vote, then this spell deals damage to each opponent equal to the total mana value of cards
  //  milled this way. Exile the top card of your library for each present vote. Until the end of your next turn, you may play the exiled cards."
  singleFace({
    name: 'SYNTHETIC Verdict Tempest',
    manaCost: ['2', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Starting with you, each player votes for past or present. You mill a card for each past vote, then this spell deals damage to each opponent equal to the total mana value of cards milled this way. Exile the top card of your library for each present vote. Until the end of your next turn, you may play the exiled cards.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'vote', options: ['past', 'present'], startingWith: 'you' },
          { kind: 'mill', player: YOU, count: { kind: 'votesFor', option: 'past' } },
          {
            kind: 'dealDamage',
            amount: { kind: 'thisWay', what: 'milledValue' },
            to: { kind: 'eachOpponent' },
          },
          { kind: 'exileTop', count: { kind: 'votesFor', option: 'present' } },
          { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfYourNextTurn' },
        ],
      },
    },
  }),
  // "Vigilance
  //  At the beginning of your end step, exile target noncreature, nonland card from your graveyard. Create a 3/2 red and white Spirit creature token.
  //  {1}{R}{W}, {T}, Sacrifice a Spirit: Choose target card exiled with this creature. You may cast that card this turn without paying its mana cost. If that spell would be put into a
  //  graveyard, put it on the bottom of its owner's library instead."
  singleFace({
    name: 'SYNTHETIC Lore Elephant',
    manaCost: ['3', 'R', 'W'],
    types: ['creature'],
    subtypes: ['Elephant', 'Cleric'],
    colors: ['W', 'R'],
    colorIdentity: ['W', 'R'],
    power: 3,
    toughness: 5,
    oracleText:
      "Vigilance\nAt the beginning of your end step, exile target noncreature, nonland card from your graveyard. Create a 3/2 red and white Spirit creature token.\n{1}{R}{W}, {T}, Sacrifice a Spirit: Choose target card exiled with this creature. You may cast that card this turn without paying its mana cost. If that spell would be put into a graveyard, put it on the bottom of its owner's library instead.",
    abilities: LORE_ABILITIES,
  }),
  // A Spirit with no abilities: the permanent a Lore Elephant's cost may sacrifice.
  singleFace({
    name: 'SYNTHETIC Bound Spirit',
    manaCost: ['W'],
    types: ['creature'],
    subtypes: ['Spirit'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 1,
    toughness: 1,
    oracleText: '',
    abilities: [],
  }),
];
