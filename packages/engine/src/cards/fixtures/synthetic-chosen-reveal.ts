/**
 * SYNTHETIC CARDS OF THE "CHOOSE A CREATURE TYPE" GROUP. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of "Choose a creature type. Reveal cards from the top of your library until you reveal X creature cards of the chosen type, where X is the
 * number of creatures you control of that type. Put those cards onto the battlefield, then shuffle the rest of the revealed cards into your library." (`chooseCreatureType`,
 * then `revealUntil` whose filter and `count` are `chosenType`, then `shuffle`). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is
 * not Oracle text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_CHOSEN_REVEAL_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Kin Summons',
    manaCost: ['1', 'G'],
    types: ['instant'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Choose a creature type. Reveal cards from the top of your library until you reveal X creature cards of the chosen type, where X is the number of creatures you control of that type. Put those cards onto the battlefield, then shuffle the rest of the revealed cards into your library.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'chooseCreatureType' },
          {
            kind: 'revealUntil',
            filter: { types: ['creature'], chosenType: true },
            count: {
              kind: 'countOf',
              filter: { types: ['creature'], controller: 'you', chosenType: true },
            },
            put: 'battlefield',
            rest: 'stay',
          },
          { kind: 'shuffle', player: { kind: 'you' } },
        ],
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Kin Revival',
    manaCost: ['4', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'Choose a creature type. Return up to two creature cards of that type from your graveyard to the battlefield. If this spell was foretold, return all creature cards of that type from your graveyard to the battlefield instead.\nForetell {2}{B}',
    alternativeCosts: [{ kind: 'foretell', cost: [{ kind: 'mana', symbols: ['2', 'B'] }] }],
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'chooseCreatureType' },
          {
            kind: 'conditional',
            condition: { kind: 'foretold' },
            effect: {
              kind: 'moveToZone',
              objects: {
                kind: 'each',
                filter: {
                  zone: 'graveyard',
                  types: ['creature'],
                  controller: 'you',
                  chosenType: true,
                },
              },
              to: 'battlefield',
              controller: 'you',
            },
            else: {
              kind: 'moveToZone',
              objects: {
                kind: 'choose',
                filter: {
                  zone: 'graveyard',
                  types: ['creature'],
                  controller: 'you',
                  chosenType: true,
                },
                count: 2,
                optional: true,
              },
              to: 'battlefield',
              controller: 'you',
            },
          },
        ],
      },
    },
  }),
];
