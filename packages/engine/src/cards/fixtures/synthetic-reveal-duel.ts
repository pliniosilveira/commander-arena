/**
 * SYNTHETIC CARD FOR THE REVEAL DUEL. NOT A REAL MAGIC CARD.
 *
 * Invented for the tests of `revealTopDuel`: "At the beginning of your upkeep, you and target opponent each reveal the top card of your library. You each lose life equal to the
 * mana value of the card revealed by the other player. You each put the card you revealed into your hand." Name starts with "SYNTHETIC "; oracleId is null. The text describes
 * what the AST does; it is not Oracle text, and this is not the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_REVEAL_DUEL_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Reveal Duelist',
    manaCost: ['1', 'R'],
    types: ['creature'],
    subtypes: ['Human'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText:
      'At the beginning of your upkeep, you and target opponent each reveal the top card of your library. You each lose life equal to the mana value of the card revealed by the other player. You each put the card you revealed into your hand.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'you' },
        targets: [{ id: 't1', what: { kind: 'player', filter: 'opponent' } }],
        effect: {
          kind: 'revealTopDuel',
          players: {
            kind: 'all',
            of: [{ kind: 'you' }, { kind: 'target', id: 't1' }],
          },
        },
      },
    ],
  }),
];
