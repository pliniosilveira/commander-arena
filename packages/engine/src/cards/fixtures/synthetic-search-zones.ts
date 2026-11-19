/**
 * SYNTHETIC CARD FOR "SEARCH YOUR GRAVEYARD, HAND, AND/OR LIBRARY FOR A CARD NAMED X" (issue 104, CR 701.23a, 701.23b). NOT A REAL MAGIC CARD.
 *
 * Written out by hand for the engine tests (the cards package checks that the grammar lowers the real Oracle text of Gate to the Afterlife to this same ability, with the name of
 * the card it finds). Name starts with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_SEARCH_ZONES_LIST: readonly CardDefinition[] = [
  // "{2}, {T}, Sacrifice this artifact: Search your graveyard, hand, and/or library for a card named Grizzly Bears and put it onto the battlefield. If you search your library
  //  this way, shuffle. Activate only if there are six or more creature cards in your graveyard."
  singleFace({
    name: 'SYNTHETIC Zone Seeker',
    manaCost: ['3'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      '{2}, {T}, Sacrifice this artifact: Search your graveyard, hand, and/or library for a card named Grizzly Bears and put it onto the battlefield. If you search your library this way, shuffle. Activate only if there are six or more creature cards in your graveyard.',
    abilities: [
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['2'] },
          { kind: 'tap' },
          { kind: 'sacrifice', what: { kind: 'this' } },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'search',
              player: { kind: 'you' },
              filter: { named: 'Grizzly Bears' },
              max: 1,
              zones: ['graveyard', 'hand', 'library'],
              destinations: [{ zone: 'battlefield', count: 1 }],
              reveal: false,
              shuffle: false,
            },
            {
              kind: 'conditional',
              condition: { kind: 'thisWayAtLeast', what: 'searched', count: 1 },
              effect: { kind: 'shuffle', player: { kind: 'you' } },
            },
          ],
        },
        activateOnlyIf: {
          kind: 'amountIs',
          amount: {
            kind: 'countOf',
            filter: { zone: 'graveyard', types: ['creature'], controller: 'you' },
          },
          compare: { cmp: 'atLeast', value: 6 },
        },
      },
    ],
  }),
];
