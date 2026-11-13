/**
 * SYNTHETIC CARDS FOR GROUP 1A OF THE DANITHA DECK (issue 26, D-1200 and D-1201). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of "Reveal the top five cards of your library. You may put a creature or enchantment card from among them into your hand. Put the rest into your
 * graveyard." (`lookAtTop` with `revealAll`, CR 701.20a): every one of the cards is shown to all players, one card of a kind may be taken into the hand, the rest go into the
 * graveyard. The shapes of a sorcery, an enters trigger, an activated ability with a sacrifice cost, and a spell that also creates a token, with the kinds "a creature or
 * enchantment card", "a land card", "an artifact, creature, enchantment, land, or planeswalker card" and "a permanent card". Names start with "SYNTHETIC "; oracleId is null.
 * The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Effect, ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const reveal = (count: number, filter: ObjectFilter): Effect => ({
  kind: 'lookAtTop',
  count,
  revealAll: true,
  take: { filter, max: 1 },
  rest: 'graveyard',
});

const PERMANENT_CARD: ObjectFilter = {
  anyOf: ['artifact', 'creature', 'enchantment', 'land', 'planeswalker', 'battle'].map((t) => ({
    types: [t as 'artifact'],
  })),
};

/** "Create a 0/1 colorless Eldrazi Spawn creature token with "Sacrifice this token: Add {C}."" */
const SPAWN: Effect = {
  kind: 'createToken',
  token: {
    kind: 'custom',
    definition: {
      name: 'Eldrazi Spawn',
      manaCost: null,
      supertypes: [],
      types: ['creature'],
      subtypes: ['Eldrazi', 'Spawn'],
      colors: [],
      power: 0,
      toughness: 1,
      loyalty: null,
      defense: null,
      oracleText: 'Sacrifice this creature: Add {C}.',
      abilities: [
        {
          kind: 'mana',
          cost: [{ kind: 'sacrifice', what: { kind: 'this' } }],
          production: { kind: 'fixed', mana: ['C'] },
        },
      ],
    },
  },
  count: 1,
};

export const SYNTHETIC_DANITHA_G1A_LIST: readonly CardDefinition[] = [
  // The shape of a sorcery that reveals five and takes a creature or enchantment card.
  singleFace({
    name: 'SYNTHETIC Reveal Five Sorcery',
    manaCost: ['1', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Reveal the top five cards of your library. You may put a creature or enchantment card from among them into your hand. Put the rest into your graveyard.',
    spell: { effect: reveal(5, { anyOf: [{ types: ['creature'] }, { types: ['enchantment'] }] }) },
  }),
  // The shape of an enters trigger that reveals four and takes a land card.
  singleFace({
    name: 'SYNTHETIC Reveal Four Scout',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Satyr'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 1,
    toughness: 1,
    oracleText:
      'When this creature enters, reveal the top four cards of your library. You may put a land card from among them into your hand. Put the rest into your graveyard.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: reveal(4, { types: ['land'] }),
      },
    ],
  }),
  // The shape of an enchantment sacrificed to reveal four and take a card of five types.
  singleFace({
    name: 'SYNTHETIC Reveal Four Vessel',
    manaCost: ['G'],
    types: ['enchantment'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      '{1}{G}, Sacrifice this enchantment: Reveal the top four cards of your library. You may put an artifact, creature, enchantment, land, or planeswalker card from among them into your hand. Put the rest into your graveyard.',
    abilities: [
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['1', 'G'] },
          { kind: 'sacrifice', what: { kind: 'this' } },
        ],
        effect: reveal(4, {
          anyOf: ['artifact', 'creature', 'enchantment', 'land', 'planeswalker'].map((t) => ({
            types: [t as 'artifact'],
          })),
        }),
      },
    ],
  }),
  // The shape of a sorcery that reveals four, takes a permanent card and then creates a token.
  singleFace({
    name: 'SYNTHETIC Reveal Four Permanent Spawn',
    manaCost: ['1', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Reveal the top four cards of your library. You may put a permanent card from among them into your hand. Put the rest into your graveyard. Create a 0/1 colorless Eldrazi Spawn creature token with "Sacrifice this token: Add {C}."',
    spell: { effect: { kind: 'sequence', effects: [reveal(4, PERMANENT_CARD), SPAWN] } },
  }),
  // The contrast: the same kind taken from the top five, but only looked at (`effect.look-take`): nobody else is shown any card but the one revealed and taken.
  singleFace({
    name: 'SYNTHETIC Look Five Sorcery',
    manaCost: ['1', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Look at the top five cards of your library. You may reveal a creature or enchantment card from among them and put it into your hand. Put the rest into your graveyard.',
    spell: {
      effect: {
        kind: 'lookAtTop',
        count: 5,
        take: { filter: { anyOf: [{ types: ['creature'] }, { types: ['enchantment'] }] }, max: 1 },
        rest: 'graveyard',
      },
    },
  }),
  // Reveals three and takes any of a plain kind (an instant or sorcery): one card of the instant-or-sorcery kind only.
  singleFace({
    name: 'SYNTHETIC Reveal Three Spells',
    manaCost: ['G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Reveal the top three cards of your library. You may put an instant or sorcery card from among them into your hand. Put the rest into your graveyard.',
    spell: { effect: reveal(3, { anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }] }) },
  }),
];
