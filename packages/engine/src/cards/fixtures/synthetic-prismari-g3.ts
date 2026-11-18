/**
 * SYNTHETIC CARDS FOR GROUP 3 OF THE PRISMARI DECK (ISSUE 87, D-646 AND LATER). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what the group added to the engine: spells cast without paying their mana costs from among cards exiled by the effect (`castFree` with `max`, D-646:
 * "up to two", "any number"), the cards each player exiles until a nonland card and the opponent's choice among them (`exileUntilFound`, `opponentChoosesCard`, D-647), exiling the top
 * card as many times as the player chooses and the total mana value of what was exiled (`exileTopAnyNumber`, `movedTotalManaValue`, D-648), a delayed ability for the turn about a card
 * exiled earlier (`delayedCombatDamageTurn`, D-649), two piles of exiled cards, one face down, and an opponent's choice between them (`exilePiles`, D-650), `revealUntil` into exile
 * (D-651), Demonstrate (D-652) and Retrace (D-654). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the
 * definition of a real card (the real ones are read from the golden corpus by the grammar, and have the same abilities).
 */
import type { Ability, Effect, TargetSpec } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const MOVED = { kind: 'moved' } as const;
const NONLAND = { notTypes: ['land' as const] };
const SHUFFLE_YOU: Effect = { kind: 'shuffle', player: { kind: 'you' } };
const DEMONSTRATE: Ability = { kind: 'keyword', keyword: { kind: 'demonstrate' } };

/** "Target permanent you control". */
const PERMANENT_YOU_CONTROL: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', controller: 'you' } },
};

export const SYNTHETIC_PRISMARI_G3_LIST: readonly CardDefinition[] = [
  // "Shuffle your library. As many times as you choose, you may exile the top card of your library. If the total mana value of the cards exiled this way is 13 or less, you may cast any
  //  number of spells from among those cards without paying their mana costs."
  singleFace({
    name: 'SYNTHETIC Calamity Dance',
    manaCost: ['7', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Shuffle your library. As many times as you choose, you may exile the top card of your library. If the total mana value of the cards exiled this way is 13 or less, you may cast any number of spells from among those cards without paying their mana costs.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          SHUFFLE_YOU,
          { kind: 'exileTopAnyNumber' },
          {
            kind: 'conditional',
            condition: { kind: 'movedTotalManaValue', compare: { cmp: 'atMost', value: 13 } },
            effect: { kind: 'castFree', objects: MOVED, max: 'any' },
          },
        ],
      },
    },
  }),
  // "At the beginning of your upkeep, each player exiles cards from the top of their library until they exile a nonland card. An opponent chooses a nonland card exiled this way.
  //  You may cast up to two spells from among the other cards exiled this way without paying their mana costs."
  singleFace({
    name: 'SYNTHETIC Chaos Orc',
    manaCost: ['3', 'R', 'R'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Orc', 'Efreet'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 4,
    toughness: 4,
    oracleText:
      'At the beginning of your upkeep, each player exiles cards from the top of their library until they exile a nonland card. An opponent chooses a nonland card exiled this way. You may cast up to two spells from among the other cards exiled this way without paying their mana costs.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'you' },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'exileUntilFound', players: { kind: 'eachPlayer' }, filter: NONLAND },
            { kind: 'opponentChoosesCard', objects: MOVED, filter: NONLAND },
            { kind: 'castFree', objects: MOVED, max: 2 },
          ],
        },
      },
    ],
  }),
  // "Exile the top four cards of your library in a face-down pile, then exile the top four cards of your library in a face-up pile. An opponent chooses one of those piles. Put that pile
  //  into your graveyard. Look at the cards in the other pile. You may cast a spell from among them without paying its mana cost. Put the rest into your hand."
  singleFace({
    name: 'SYNTHETIC Pile Performance',
    manaCost: ['5', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'Exile the top four cards of your library in a face-down pile, then exile the top four cards of your library in a face-up pile. An opponent chooses one of those piles. Put that pile into your graveyard. Look at the cards in the other pile. You may cast a spell from among them without paying its mana cost. Put the rest into your hand.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exilePiles', count: 4, chosenTo: 'graveyard' },
          { kind: 'castFree', objects: MOVED },
          { kind: 'moveToZone', objects: MOVED, to: 'hand' },
        ],
      },
    },
  }),
  // "Demonstrate. Shuffle your library, then reveal cards from the top of it until you reveal a nonland card. Exile that card and put the rest on the bottom of your library in a random
  //  order. You may cast the exiled card without paying its mana cost."
  singleFace({
    name: 'SYNTHETIC Reveal Technique',
    manaCost: ['4', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Demonstrate. Shuffle your library, then reveal cards from the top of it until you reveal a nonland card. Exile that card and put the rest on the bottom of your library in a random order. You may cast the exiled card without paying its mana cost.',
    abilities: [DEMONSTRATE],
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          SHUFFLE_YOU,
          { kind: 'revealUntil', filter: NONLAND, put: 'exile' },
          { kind: 'castFree', objects: MOVED },
        ],
      },
    },
  }),
  // "Demonstrate. ~ deals 2 damage to any target." (copies with targets, to test the new targets of each copy)
  singleFace({
    name: 'SYNTHETIC Demo Bolt',
    manaCost: ['1', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Demonstrate. SYNTHETIC Demo Bolt deals 2 damage to any target.',
    abilities: [DEMONSTRATE],
    spell: {
      targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
      effect: { kind: 'dealDamage', amount: 2, to: { kind: 'target', id: 't1' } },
    },
  }),
  // "Demonstrate. Create a token that's a copy of target permanent you control."
  singleFace({
    name: 'SYNTHETIC Copy Technique',
    manaCost: ['4', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: "Demonstrate. Create a token that's a copy of target permanent you control.",
    abilities: [DEMONSTRATE],
    spell: {
      targets: [PERMANENT_YOU_CONTROL],
      effect: {
        kind: 'createToken',
        token: { kind: 'copyOf', object: { kind: 'target', id: 't1' } },
        count: 1,
      },
    },
  }),
  // "Exile target instant or sorcery card from your graveyard. Creatures you control get +X/+0 until end of turn, where X is that card's mana value. Whenever a creature you control
  //  deals combat damage to a player this turn, copy the exiled card. You may cast the copy without paying its mana cost."
  singleFace({
    name: 'SYNTHETIC Surge Victory',
    manaCost: ['4', 'R', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      "Exile target instant or sorcery card from your graveyard. Creatures you control get +X/+0 until end of turn, where X is that card's mana value. Whenever a creature you control deals combat damage to a player this turn, copy the exiled card. You may cast the copy without paying its mana cost.",
    spell: {
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: {
              zone: 'graveyard',
              controller: 'you',
              anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
            },
          },
        },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exile', objects: { kind: 'target', id: 't1' } },
          {
            kind: 'modifyPt',
            objects: {
              kind: 'each',
              filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
            },
            power: { kind: 'manaValueOf', of: { kind: 'target', id: 't1' } },
            toughness: 0,
            duration: 'untilEndOfTurn',
          },
          {
            kind: 'delayedCombatDamageTurn',
            filter: { types: ['creature'], controller: 'you' },
            effect: { kind: 'copyCardAndCast', objects: MOVED },
          },
        ],
      },
    },
  }),
  // "Cascade. Retrace."
  singleFace({
    name: 'SYNTHETIC Chaos Retrace',
    manaCost: ['3', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Cascade. Retrace.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'cascade' } },
      { kind: 'keyword', keyword: { kind: 'retrace' } },
    ],
  }),
  // The same without the shuffle, so a test knows which cards are on top: "As many times as you choose, you may exile the top card of your library. If the total mana value of the
  // cards exiled this way is 13 or less, you may cast any number of spells from among those cards without paying their mana costs."
  singleFace({
    name: 'SYNTHETIC Calamity Unshuffled',
    manaCost: ['7', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'As many times as you choose, you may exile the top card of your library. If the total mana value of the cards exiled this way is 13 or less, you may cast any number of spells from among those cards without paying their mana costs.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exileTopAnyNumber' },
          {
            kind: 'conditional',
            condition: { kind: 'movedTotalManaValue', compare: { cmp: 'atMost', value: 13 } },
            effect: { kind: 'castFree', objects: MOVED, max: 'any' },
          },
        ],
      },
    },
  }),
  // "Exile the top three cards of your library. You may cast up to two spells from among them without paying their mana costs."
  singleFace({
    name: 'SYNTHETIC Twin Cast',
    manaCost: ['3', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Exile the top three cards of your library. You may cast up to two spells from among them without paying their mana costs.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exileTop', count: 3 },
          { kind: 'castFree', objects: MOVED, max: 2 },
        ],
      },
    },
  }),
  // "Retrace. ~ deals 2 damage to any target." and "Retrace. You gain X life."
  singleFace({
    name: 'SYNTHETIC Retrace Bolt',
    manaCost: ['1', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Retrace. SYNTHETIC Retrace Bolt deals 2 damage to any target.',
    abilities: [{ kind: 'keyword', keyword: { kind: 'retrace' } }],
    spell: {
      targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
      effect: { kind: 'dealDamage', amount: 2, to: { kind: 'target', id: 't1' } },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Retrace X Drain',
    manaCost: ['X', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Retrace. You gain X life.',
    abilities: [{ kind: 'keyword', keyword: { kind: 'retrace' } }],
    spell: {
      x: true,
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: { kind: 'x' } },
    },
  }),
  // Spells of known mana values to be exiled and cast: a cheap one that gains life, one with a target, one with an additional cost, and a permanent.
  singleFace({
    name: 'SYNTHETIC Calamity Gain Two',
    manaCost: ['1', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'You gain 2 life.',
    spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 2 } },
  }),
  singleFace({
    name: 'SYNTHETIC Calamity Gain Seven',
    manaCost: ['6', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'You gain 7 life.',
    spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 7 } },
  }),
  singleFace({
    name: 'SYNTHETIC Calamity Discard Draw',
    manaCost: ['R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'As an additional cost to cast this spell, discard a card. Draw two cards.',
    additionalCosts: [{ kind: 'discard', count: 1 }],
    spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 2 } },
  }),
];
