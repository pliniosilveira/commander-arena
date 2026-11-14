import { literal, map, pattern, sequence } from '../../combinators';
import type { IrNoun, IrToken } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

export const PREPARE_EFFECT_RULES = [
  defineRule<Clauses>({
    id: 'effect.become-prepared',
    family: 'effect',
    leading: ['~'],
    cites: ['CR 722.3a (Preparation Cards)'],
    examples: ['~ becomes prepared'],
    rejects: ['~ becomes unprepared', 'target creature becomes prepared'],
    parse: (ctx, pos) =>
      map(spanned(literal('~ becomes prepared')), ({ span }) => [
        makeClause('effect.become-prepared', 'prepare', {}, span),
      ])(ctx, pos),
  }),
  defineRule<Clauses>({
    id: 'effect.delayed-combat-prepare',
    family: 'effect',
    leading: ['whenever'],
    cites: ['CR 603.7 (Handling Triggered Abilities)', 'CR 722.3a (Preparation Cards)'],
    examples: [
      'Whenever that creature deals combat damage to a player this combat, ~ becomes prepared',
    ],
    rejects: ['Whenever that creature deals damage to a player this combat, ~ becomes prepared'],
    parse: (ctx, pos) =>
      map(
        spanned(
          sequence(
            literal('whenever '),
            family<IrNoun>('noun', { only: ['noun.that-object'] }),
            pattern(
              / deals combat damage to a player this combat, ~ becomes prepared(?![\p{L}\p{N}])/iu,
            ),
          ),
        ),
        ({ value, span }) => [
          makeClause(
            'effect.delayed-combat-prepare',
            'delayedCombatPrepare',
            { objects: value[1] },
            span,
          ),
        ],
      )(ctx, pos),
  }),
  defineRule<Clauses>({
    id: 'effect.create-per-opponent',
    family: 'effect',
    leading: ['for'],
    cites: ['CR 111.2 (Tokens)', 'CR 608.2c (Resolving Spells and Abilities)'],
    examples: [
      'For each opponent, you create a 1/1 black and green Pest creature token with "When ~ dies, you gain 1 life."',
    ],
    rejects: ['For each opponent, that player creates a Treasure token'],
    parse: (ctx, pos) =>
      map(
        spanned(sequence(literal('for each opponent, you create '), family<IrToken>('token'))),
        ({ value, span }) => [
          makeClause('effect.create-per-opponent', 'createPerOpponent', { token: value[1] }, span),
        ],
      )(ctx, pos),
  }),
];
