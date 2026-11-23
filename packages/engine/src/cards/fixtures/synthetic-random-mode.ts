/**
 * SYNTHETIC CARDS FOR A MODE CHOSEN AT RANDOM. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of "choose one at random" (CR 700.2, `ModeChoice.random`): a creature whose beginning-of-combat trigger runs one of three modes
 * chosen by the seeded generator as the ability goes on the stack: gain 3 life, draw a card, or deal 2 damage to target creature (a mode with no legal
 * target cannot be chosen). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text.
 */
import type { Effect } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const NONE: Effect = { kind: 'sequence', effects: [] };

export const SYNTHETIC_RANDOM_MODE_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Random Yeti',
    manaCost: ['2', 'R'],
    types: ['creature'],
    subtypes: ['Yeti'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText:
      'At the beginning of combat on your turn, choose one at random — • You gain 3 life. • Draw a card. • This creature deals 2 damage to target creature.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
        effect: NONE,
        chooseModes: { min: 1, max: 1, random: true },
        modes: [
          {
            text: 'You gain 3 life.',
            effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 },
          },
          { text: 'Draw a card.', effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
          {
            text: 'This creature deals 2 damage to target creature an opponent controls.',
            targets: [
              {
                id: 'c',
                what: { kind: 'object', filter: { types: ['creature'], controller: 'opponent' } },
              },
            ],
            effect: { kind: 'dealDamage', amount: 2, to: { kind: 'target', id: 'c' } },
          },
        ],
      },
    ],
  }),
];
