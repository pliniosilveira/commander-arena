/**
 * Effect rules of issue 144 (Boggart Shenanigans, Gempalm Incinerator): "have ~ deal 1 damage to target player or planeswalker", "have it deal X damage to target creature", the
 * words after "you may" of "you may have ~ deal ...".
 */
import { literal, optional, satisfy, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { FOR_EACH_TAIL, scaled } from '../amount/scaled';
import { defineRule, family } from '../registry';
import { DAMAGE_AMOUNT } from './bite';
import { type Clauses, DAMAGE_RECIPIENTS, operands, single } from './operands';

/**
 * `effect.have-damage`: "have ~ deal 1 damage to target player or planeswalker", "have it deal X damage to target creature" (CR 120.3, 608.2d): the causative of
 * `effect.damage` and `effect.damage-by-it`, the permanent with the ability (or the card, for "it" of a cycling trigger) is the source of the damage as it is for the plain verb.
 * The "you may" before it is the sentence's (the controller of the ability chooses, CR 603.5). Only `~` and "it" deal the damage ("have target creature deal damage" is a bite
 * of another player's making, not read), with the bare verb after it and a stated amount.
 */
export const EFFECT_HAVE_DAMAGE = defineRule<Clauses>({
  id: 'effect.have-damage',
  family: 'effect',
  leading: ['have'],
  cites: [
    'CR 120.3 (Damage)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 603.5 (Handling Triggered Abilities)',
    'CR 115.1 (Targets)',
  ],
  examples: [
    'have ~ deal 1 damage to target player or planeswalker',
    'have it deal X damage to target creature',
    'have ~ deal 2 damage to any target',
    'have it deal 1 damage to each opponent',
    'have ~ deal damage equal to the number of creatures you control to target creature',
  ],
  rejects: [
    'have ~ deals 1 damage to any target',
    'have it deals X damage to target creature',
    'have ~ deal 1 damage',
    'have ~ deal damage to any target',
    'have target creature deal 1 damage to any target',
    'have you deal 1 damage to any target',
    'have ~ deal 1 damage to',
    '~ deal 1 damage to any target',
  ],
  parse: single(
    'effect.have-damage',
    satisfy(
      sequence(
        literal('have '),
        family<IrNoun>('noun', { only: ['noun.self', 'noun.it'] }),
        literal(' deal '),
        DAMAGE_AMOUNT,
        literal(' to '),
        operands(DAMAGE_RECIPIENTS, 'effect.have-damage'),
        optional(FOR_EACH_TAIL, null),
      ),
      ([, , , amount, , , each]) => each === null || scaled(amount, each) !== null,
    ),
    ([, source, , amount, , to, each]) => ({
      verb: 'dealDamage',
      args: { source, amount: each === null ? amount : (scaled(amount, each) ?? amount), to },
    }),
  ),
});

export const HAVE_DAMAGE_EFFECT_RULES = [EFFECT_HAVE_DAMAGE];
