/**
 * SYNTHETIC CARDS FOR "REVEAL CARDS UNTIL YOU REVEAL A <FILTER> CARD" AND "LOOK AT THE TOP N CARDS ... PUT IT ONTO THE BATTLEFIELD". NOT REAL MAGIC
 * CARDS.
 *
 * Invented for the tests of D-145 (the Dinosaurs slice): a creature that, as it enters, reveals cards until a land card and puts it onto
 * the battlefield tapped (the rest on the bottom in a random order), a sorcery that does the same untapped and puts a counter on "it", a
 * sorcery that reveals until a creature card with power 4 or greater and puts it into the hand, and two creatures whose {T} ability looks at
 * the top four cards and puts a creature card with mana value at most the number of lands its controller controls onto the battlefield
 * (untapped, or tapped). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and
 * none of these is the definition of a real card.
 */
import type { Effect, ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const LAND: ObjectFilter = { types: ['land'] };

const scout = (name: string, tapped: boolean): CardDefinition =>
  singleFace({
    name,
    manaCost: ['3', 'G'],
    types: ['creature'],
    subtypes: ['Elf', 'Scout'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 4,
    oracleText: `{T}: Look at the top four cards of your library. You may reveal a creature card with mana value less than or equal to the number of lands you control from among them and put it onto the battlefield${tapped ? ' tapped' : ''}. Put the rest on the bottom of your library in a random order.`,
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        effect: {
          kind: 'lookAtTop',
          count: 4,
          take: {
            filter: { types: ['creature'] },
            max: 1,
            to: 'battlefield',
            ...(tapped ? { tapped: true as const } : {}),
            manaValueAtMost: { kind: 'countOf', filter: { types: ['land'], controller: 'you' } },
          },
          rest: 'bottomRandom',
        },
      },
    ],
  });

const sorcery = (name: string, words: string, effect: Effect): CardDefinition =>
  singleFace({
    name,
    manaCost: ['2', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: words,
    spell: { effect },
  });

export const SYNTHETIC_REVEAL_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Land Digger',
    manaCost: ['3', 'G'],
    types: ['creature'],
    subtypes: ['Elf', 'Scout'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 4,
    oracleText:
      'When this creature enters, reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield tapped and the rest on the bottom of your library in a random order.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: { kind: 'revealUntil', filter: LAND, put: 'battlefield', tapped: true },
      },
    ],
  }),
  sorcery(
    'SYNTHETIC Lucky Dig',
    'Reveal cards from the top of your library until you reveal a land card. Put it onto the battlefield, then put a +1/+1 counter on it. Put the rest on the bottom of your library in a random order.',
    {
      kind: 'sequence',
      effects: [
        { kind: 'revealUntil', filter: LAND, put: 'battlefield' },
        { kind: 'addCounters', objects: { kind: 'moved' }, counter: '+1/+1', count: 1 },
      ],
    },
  ),
  sorcery(
    'SYNTHETIC Big Seeker',
    'Reveal cards from the top of your library until you reveal a creature card with power 4 or greater. Put it into your hand and the rest on the bottom of your library in a random order.',
    {
      kind: 'revealUntil',
      filter: { types: ['creature'], power: { cmp: 'atLeast', value: 4 } },
      put: 'hand',
    },
  ),
  scout('SYNTHETIC Land Scout', false),
  scout('SYNTHETIC Tapped Scout', true),
];
