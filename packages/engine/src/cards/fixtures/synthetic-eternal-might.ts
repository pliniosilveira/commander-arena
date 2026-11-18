/**
 * SYNTHETIC CARDS FOR THE MECHANICS OF THE ETERNAL MIGHT DECK. NOT REAL MAGIC CARDS.
 *
 * Invented for the scenario tests of issue 104: a permanent that gives the cards in its controller's hand a cycling ability (`grantKeywordToHandCards`, CR 702.29a, 613.1f).
 * Names start with "SYNTHETIC "; oracleId is null; the text describes what the AST does, it is not Oracle text, and none of these is the definition of a real card (the real
 * ones are read from their Oracle text by `packages/cards`).
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_ETERNAL_MIGHT_LIST: readonly CardDefinition[] = [
  // "Each creature card in your hand has cycling {1}{U}."
  singleFace({
    name: 'SYNTHETIC Cycling Muse',
    manaCost: ['1', 'U'],
    types: ['creature'],
    subtypes: ['Wizard'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 2,
    toughness: 1,
    oracleText: 'Each creature card in your hand has cycling {1}{U}.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'grantKeywordToHandCards',
          what: { types: ['creature'] },
          keyword: { kind: 'cycling', cost: [{ kind: 'mana', symbols: ['1', 'U'] }] },
        },
      },
    ],
  }),
];
