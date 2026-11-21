/**
 * Noun rule of group 10 of the Ahoy Mateys deck: "target spell or ability that targets you or a creature you control" (Siren Stormtamer).
 */
import { literal, map } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';

type Bare = Omit<IrNoun, 'span' | 'rule'>;

const ID = 'noun.target-spell-or-ability-targeting-you';

/**
 * `noun.target-spell-or-ability-targeting-you`: "target spell or ability that targets you or a creature you control" (CR 405.1, 113.3b, 113.3c: a spell and an activated or triggered ability
 * are objects on the stack and may be countered; CR 115.1, 601.2c: the targets a spell or ability has were chosen as it was put on the stack). One target, any spell or ability on the stack
 * with a chosen target that is the player the ability belongs to ("you") or a creature that player controls: the engine's stack filter with `targetsPlayer` of `'you'` and `targetsObject` of
 * a creature you control, as two members of a choice. Not read: a plural, "target spell", another target kind ("a permanent you control", "an opponent"), the other order, "or", a missing
 * "or a creature you control", "that targets only you".
 */
export const NOUN_TARGET_SPELL_OR_ABILITY_TARGETING_YOU = defineRule<IrNoun>({
  id: ID,
  family: 'noun',
  leading: ['target'],
  cites: [
    'CR 405.1 (Stack)',
    'CR 113.3b (Abilities)',
    'CR 113.3c (Abilities)',
    'CR 115.1 (Targets)',
    'CR 601.2c (Casting Spells)',
    'CR 701.6a (Counter)',
  ],
  examples: ['target spell or ability that targets you or a creature you control'],
  rejects: [
    'target spells or abilities that target you or a creature you control',
    'target spell or ability that targets you',
    'target spell or ability that targets a creature you control',
    'target spell that targets you or a creature you control',
    'target spell or ability that targets you or a permanent you control',
    'target spell or ability that targets you or a creature an opponent controls',
    'target spell or ability that targets a creature you control or you',
    'target spell or ability that targets only you or a creature you control',
    'target spell or ability',
    'spell or ability that targets you or a creature you control',
  ],
  parse: node<Bare, IrNoun>(
    ID,
    map(
      literal('target spell or ability that targets you or a creature you control'),
      (raw): Bare => {
        const member = (extra: Partial<IrFilter>): IrFilter => ({ raw, ...extra });
        return {
          kind: 'noun',
          det: 'target',
          filter: {
            zone: 'stack',
            raw,
            anyOf: [
              member({ targetsYou: true }),
              member({ targets: { types: ['creature'], controller: 'you', raw } }),
            ],
          },
          upTo: false,
          plural: false,
          other: false,
        };
      },
    ),
    (b) => b,
  ),
});

export const AHOY_G10_NOUN_RULES = [NOUN_TARGET_SPELL_OR_ABILITY_TARGETING_YOU];
