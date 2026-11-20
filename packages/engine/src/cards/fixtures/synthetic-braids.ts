/**
 * SYNTHETIC CARDS FOR "SACRIFICE A PERMANENT, THEN EACH OPPONENT MAY SACRIFICE ONE THAT SHARES A CARD TYPE WITH IT" (CR 205.2a, 701.21a, 608.2d). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the Braids group of the Meren deck: the end step ability of Braids, Arisen Nightmare as the engine runs it (the grammar's reading of the real text
 * is compared with it), and a vanilla artifact creature, whose two card types let an opponent answer with either. Names start with "SYNTHETIC "; oracleId is null. The text
 * describes what the AST does; it is not the Oracle text of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_BRAIDS_LIST: readonly CardDefinition[] = [
  // "At the beginning of your end step, you may sacrifice an artifact, creature, enchantment, land, or planeswalker. If you do, each opponent may sacrifice a permanent of their
  // choice that shares a card type with it. For each opponent who doesn't, that player loses 2 life and you draw a card." (CR 205.2a, 701.21a, 608.2d, 101.4)
  singleFace({
    name: 'SYNTHETIC Braids Nightmare',
    manaCost: ['1', 'B', 'B'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Nightmare'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 3,
    toughness: 3,
    oracleText:
      "At the beginning of your end step, you may sacrifice an artifact, creature, enchantment, land, or planeswalker. If you do, each opponent may sacrifice a permanent of their choice that shares a card type with it. For each opponent who doesn't, that player loses 2 life and you draw a card.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'may',
              effect: {
                kind: 'sacrifice',
                objects: {
                  kind: 'choose',
                  filter: {
                    anyOf: [
                      { types: ['artifact'] },
                      { types: ['creature'] },
                      { types: ['enchantment'] },
                      { types: ['land'] },
                      { types: ['planeswalker'] },
                    ],
                  },
                },
              },
            },
            {
              kind: 'conditional',
              condition: { kind: 'didPrevious' },
              effect: {
                kind: 'playersMay',
                players: { kind: 'eachOpponent' },
                runsAs: 'chooser',
                effect: {
                  kind: 'sacrifice',
                  objects: { kind: 'choose', filter: { sharesCardTypeWith: 'sacrificed' } },
                },
                otherwise: {
                  kind: 'sequence',
                  effects: [
                    { kind: 'loseLife', player: { kind: 'declinedPlayer' }, amount: 2 },
                    { kind: 'draw', player: { kind: 'you' }, count: 1 },
                  ],
                },
              },
            },
          ],
        },
      },
    ],
  }),
  // A vanilla artifact creature: a permanent with two card types.
  singleFace({
    name: 'SYNTHETIC Braids Golem',
    manaCost: ['3'],
    types: ['artifact', 'creature'],
    subtypes: ['Golem'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText: '',
  }),
];
