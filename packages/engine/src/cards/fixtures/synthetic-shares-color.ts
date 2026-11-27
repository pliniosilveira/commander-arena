/**
 * SYNTHETIC CARD FOR A SEARCH FOR A CARD THAT SHARES A COLOR. NOT A REAL MAGIC CARD.
 *
 * Invented for the tests of `ObjectFilter.sharesColorWith` (CR 105.1, 105.2c, 109.4, 701.23b), the shape of Ringsight ("The Ring tempts you. Search your library for a card that shares a color with a
 * legendary creature you control, reveal it, put it into your hand, then shuffle."). The name starts with "SYNTHETIC "; oracleId is null; the text describes what the AST does.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_SHARES_COLOR_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Ring Seek',
    manaCost: ['1', 'U', 'B'],
    types: ['sorcery'],
    colors: ['U', 'B'],
    colorIdentity: ['U', 'B'],
    oracleText:
      'The Ring tempts you. Search your library for a card that shares a color with a legendary creature you control, reveal it, put it into your hand, then shuffle.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'ringTempts' },
          {
            kind: 'search',
            player: { kind: 'you' },
            filter: {
              sharesColorWith: {
                zone: 'battlefield',
                types: ['creature'],
                supertypes: ['legendary'],
                controller: 'you',
              },
            },
            max: 1,
            destinations: [{ zone: 'hand', count: 1 }],
            reveal: true,
            shuffle: true,
          },
        ],
      },
    },
  }),
];
