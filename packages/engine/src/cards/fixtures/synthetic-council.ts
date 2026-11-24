/**
 * SYNTHETIC CARDS FOR COUNCIL VOTES (CR 701.38). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the vote results (the conditions `voteMost` and `voteTied`), the effects `repeat` and `forEachPlayer` with `runsAs: 'each'`, the object `ringBearer` and the
 * condition `enteredThisTurn` with `other` (the Elven Council deck, issue 17). Each card has the wording of a real card of the deck, written out by hand (the cards package checks that
 * the grammar lowers the real Oracle text to these same nodes): a sorcery that gives an extra turn or three cards, an instant that returns cards from every graveyard or has every player
 * wheel their hand, a sorcery that searches for a basic land and returns a card for each vote, and a creature that votes at the beginning of combat. The 3/4 body is INVENTED. Names start
 * with "SYNTHETIC "; oracleId is null; none of these is the definition of a real card.
 */
import type { Effect } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;

/** "If <option> gets more votes or the vote is tied". */
const mostOrTied = (option: string) =>
  ({
    kind: 'or',
    terms: [{ kind: 'voteMost', option }, { kind: 'voteTied' }],
  }) as const;

const SELF_EXILE: Effect = { kind: 'exile', objects: { kind: 'thisSpell' } };

export const SYNTHETIC_COUNCIL_LIST: readonly CardDefinition[] = [
  // "Starting with you, each player votes for time or knowledge. If time gets more votes, take an extra turn after this one. If knowledge gets more votes or the vote is tied, draw three cards."
  singleFace({
    name: 'SYNTHETIC Council of Time',
    manaCost: ['3', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'Starting with you, each player votes for time or knowledge. If time gets more votes, take an extra turn after this one. If knowledge gets more votes or the vote is tied, draw three cards.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'vote', options: ['time', 'knowledge'], startingWith: 'you' },
          {
            kind: 'conditional',
            condition: { kind: 'voteMost', option: 'time' },
            effect: { kind: 'extraTurn', player: YOU },
          },
          {
            kind: 'conditional',
            condition: mostOrTied('knowledge'),
            effect: { kind: 'draw', player: YOU, count: 3 },
          },
        ],
      },
    },
  }),
  // "Starting with you, each player votes for return or embark. If return gets more votes, each player returns up to two cards from their graveyard to their hand, then you exile this spell.
  // If embark gets more votes or the vote is tied, each player may discard their hand and draw seven cards."
  singleFace({
    name: 'SYNTHETIC Council of Tides',
    manaCost: ['2', 'G', 'U'],
    types: ['instant'],
    colors: ['G', 'U'],
    colorIdentity: ['G', 'U'],
    oracleText:
      'Starting with you, each player votes for return or embark. If return gets more votes, each player returns up to two cards from their graveyard to their hand, then you exile this spell. If embark gets more votes or the vote is tied, each player may discard their hand and draw seven cards.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'vote', options: ['return', 'embark'], startingWith: 'you' },
          {
            kind: 'conditional',
            condition: { kind: 'voteMost', option: 'return' },
            effect: {
              kind: 'sequence',
              effects: [
                {
                  kind: 'forEachPlayer',
                  players: { kind: 'eachPlayer' },
                  runsAs: 'each',
                  effect: {
                    kind: 'moveToZone',
                    objects: {
                      kind: 'choose',
                      filter: { zone: 'graveyard', controller: 'you' },
                      count: 2,
                      optional: true,
                    },
                    to: 'hand',
                  },
                },
                SELF_EXILE,
              ],
            },
          },
          {
            kind: 'conditional',
            condition: mostOrTied('embark'),
            effect: {
              kind: 'playersMay',
              players: { kind: 'eachPlayer' },
              runsAs: 'chooser',
              effect: {
                kind: 'sequence',
                effects: [
                  {
                    kind: 'discard',
                    player: YOU,
                    count: { kind: 'countOf', filter: { zone: 'hand', controller: 'you' } },
                  },
                  { kind: 'draw', player: YOU, count: 7 },
                ],
              },
            },
          },
        ],
      },
    },
  }),
  // "Starting with you, each player votes for Redhorn Pass or Mines of Moria. For each Redhorn Pass vote, search your library for a basic land card and put it onto the battlefield tapped.
  // If you search your library this way, shuffle. For each Mines of Moria vote, return a card from your graveyard to your hand. Exile this spell."
  singleFace({
    name: 'SYNTHETIC Council of Roads',
    manaCost: ['5', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Starting with you, each player votes for Redhorn Pass or Mines of Moria. For each Redhorn Pass vote, search your library for a basic land card and put it onto the battlefield tapped. If you search your library this way, shuffle. For each Mines of Moria vote, return a card from your graveyard to your hand.\nExile this spell.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'vote', options: ['Redhorn Pass', 'Mines of Moria'], startingWith: 'you' },
          {
            kind: 'repeat',
            times: { kind: 'votesFor', option: 'Redhorn Pass' },
            effect: {
              kind: 'search',
              player: YOU,
              filter: { types: ['land'], supertypes: ['basic'] },
              max: 1,
              destinations: [{ zone: 'battlefield', tapped: true, count: 1 }],
              reveal: false,
              shuffle: false,
            },
          },
          {
            kind: 'conditional',
            condition: { kind: 'thisWayAtLeast', what: 'searched', count: 1 },
            effect: { kind: 'shuffle', player: YOU },
          },
          {
            kind: 'repeat',
            times: { kind: 'votesFor', option: 'Mines of Moria' },
            effect: {
              kind: 'moveToZone',
              objects: { kind: 'choose', filter: { zone: 'graveyard', controller: 'you' } },
              to: 'hand',
            },
          },
          SELF_EXILE,
        ],
      },
    },
  }),
  // "At the beginning of combat on your turn, if another Elf entered the battlefield under your control this turn, starting with you, each player votes for dominion or guidance. If dominion
  // gets more votes, the Ring tempts you, then you put a +1/+1 counter on your Ring-bearer. If guidance gets more votes or the vote is tied, draw a card."
  singleFace({
    name: 'SYNTHETIC Council Queen',
    manaCost: ['2', 'G', 'U'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Elf', 'Noble'],
    colors: ['G', 'U'],
    colorIdentity: ['G', 'U'],
    // INVENTED body.
    power: 3,
    toughness: 4,
    oracleText:
      'At the beginning of combat on your turn, if another Elf entered the battlefield under your control this turn, starting with you, each player votes for dominion or guidance. If dominion gets more votes, the Ring tempts you, then you put a +1/+1 counter on your Ring-bearer. If guidance gets more votes or the vote is tied, draw a card.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
        interveningIf: { kind: 'enteredThisTurn', count: 1, subtypes: ['Elf'], other: true },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'vote', options: ['dominion', 'guidance'], startingWith: 'you' },
            {
              kind: 'conditional',
              condition: { kind: 'voteMost', option: 'dominion' },
              effect: {
                kind: 'sequence',
                effects: [
                  { kind: 'ringTempts' },
                  {
                    kind: 'addCounters',
                    objects: { kind: 'ringBearer' },
                    counter: '+1/+1',
                    count: 1,
                  },
                ],
              },
            },
            {
              kind: 'conditional',
              condition: mostOrTied('guidance'),
              effect: { kind: 'draw', player: YOU, count: 1 },
            },
          ],
        },
      },
    ],
  }),
  // A plain Elf, the other Elf of the queen's condition.
  singleFace({
    name: 'SYNTHETIC Council Elf',
    manaCost: ['G'],
    types: ['creature'],
    subtypes: ['Elf'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 1,
    toughness: 1,
    oracleText: '',
  }),
];
