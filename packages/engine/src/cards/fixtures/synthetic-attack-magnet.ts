/**
 * SYNTHETIC ATTACK-MAGNET PLANESWALKER. NOT A REAL MAGIC CARD.
 *
 * Invented for the tests of "During target opponent's next turn, creatures that player controls attack this planeswalker if able" (CR 508.1d, `requireAttackSource`),
 * with the other two loyalty abilities a planeswalker of that shape has: a destroy of a tapped creature, and an animate that prevents the damage to the walker. Names start with
 * "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text. The parser test of the real card
 * (`packages/cards/test/convert-grammar-engine-first-flight-gideon.test.ts`) reads the real Oracle text and plays it.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';
import { loyaltyAbility } from './synthetic-planeswalkers';

const THIS = { kind: 'this' } as const;

export const SYNTHETIC_ATTACK_MAGNET_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Magnet Walker',
    manaCost: ['3', 'W', 'W'],
    supertypes: ['legendary'],
    types: ['planeswalker'],
    subtypes: ['Gideon'],
    colors: ['W'],
    colorIdentity: ['W'],
    loyalty: 6,
    oracleText:
      "+2: During target opponent's next turn, creatures that player controls attack this planeswalker if able.\n-2: Destroy target tapped creature.\n0: Until end of turn, this planeswalker becomes a 6/6 Human Soldier creature that's still a planeswalker. Prevent all damage that would be dealt to him this turn.",
    abilities: [
      loyaltyAbility(
        2,
        {
          kind: 'requireAttackSource',
          player: { kind: 'target', id: 't1' },
          duration: 'untilEndOfTheirNextTurn',
        },
        [{ id: 't1', what: { kind: 'player', filter: 'opponent' } }],
      ),
      loyaltyAbility(-2, { kind: 'destroy', objects: { kind: 'target', id: 't1' } }, [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'battlefield', types: ['creature'], tapped: true },
          },
        },
      ]),
      loyaltyAbility(0, {
        kind: 'sequence',
        effects: [
          {
            kind: 'setTypes',
            objects: THIS,
            types: ['creature'],
            subtypes: ['Human', 'Soldier'],
            additive: true,
            duration: 'untilEndOfTurn',
          },
          { kind: 'setPt', objects: THIS, power: 6, toughness: 6, duration: 'untilEndOfTurn' },
          {
            kind: 'preventDamage',
            scope: 'all',
            amount: 'all',
            to: THIS,
            duration: 'untilEndOfTurn',
          },
        ],
      }),
    ],
  }),
];
