/**
 * Effect rules of group 2 of the Feather deck (issue 27, D-446, D-445): the second damage of "~ deals 4 damage to target creature you don't control and 2 damage to target
 * creature you control" (Reckless Rage) and "Monstrosity 5" (Giggling Skitterspike). The bite with "another target creature" (Fall of the Hammer) is `effect.bite`, whose
 * lowering learned to read it.
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrAmount, IrNoun, IrNounList } from '../../ir/types';
import { defineRule, family, quietly, spanned } from '../registry';
import { flag } from './dragons';
import { type Clauses, DAMAGE_RECIPIENTS, makeClause, operands } from './operands';

/**
 * `effect.damage-same-source`: "2 damage to target creature you control", the second instruction of "~ deals 4 damage to target creature you don't control and 2 damage to target
 * creature you control" (CR 120.3, 115.1: the same source deals the damage, each amount to its own recipient). It has no subject of its own: the lowering reads it only after a
 * damage instruction of the same sentence that names no other source ("~ deals ...") and joined by "and"; anywhere else it is refused. A number or X, never "equal to".
 */
export const EFFECT_DAMAGE_SAME_SOURCE = defineRule<Clauses>({
  id: 'effect.damage-same-source',
  family: 'effect',
  leading: [],
  cites: ['CR 120.3 (Damage)', 'CR 115.1 (Targets)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    '2 damage to target creature you control',
    '3 damage to any target',
    'X damage to each opponent',
    '1 damage to you',
  ],
  rejects: [
    '2 damage',
    '2 damage to',
    'damage to target creature',
    'deals 2 damage to target creature you control',
    '2 damage target creature you control',
    'a damage to target creature',
    '2 damage to target creature you control and draw a card',
    '2 damage to each of up to two other targets',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.damage-same-source';
    const r = sequence(
      family<IrAmount>('amount', { only: ['amount.number', 'amount.x'] }),
      literal(' damage to '),
      operands(DAMAGE_RECIPIENTS, id),
    )(ctx, pos);
    if (!r.ok) return r;
    const [amount, , to] = r.value;
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'dealDamage',
          { amount, to: to as IrNoun | IrNounList, sameSource: flag(id, true, span) },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.monstrosity`: "Monstrosity 5" (CR 701.37a: "If this permanent isn't monstrous, put N +1/+1 counters on it and it becomes monstrous."). A whole number of one or more;
 * "Monstrosity X" (CR 701.37c: X is the value announced, which other abilities of the permanent may read) is another reading and is not made. The engine's `monstrosity`.
 */
export const EFFECT_MONSTROSITY = defineRule<Clauses>({
  id: 'effect.monstrosity',
  family: 'effect',
  leading: ['monstrosity'],
  cites: ['CR 701.37 (Monstrosity)', 'CR 701.37a (Monstrosity)', 'CR 701.37b (Monstrosity)'],
  examples: ['Monstrosity 5', 'monstrosity 3', 'Monstrosity 1', 'monstrosity 10'],
  rejects: [
    'Monstrosity',
    'Monstrosity X',
    'Monstrosity 0',
    'Monstrosity five',
    'Monstrosity 5 and draw a card',
    'Monstrosity -1',
    'Monstrous 5',
    'Monstrosity 2.5',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(/monstrosity ([1-9]\d*)(?![\p{L}\p{N}]|\.\d)/iu))(ctx, pos);
    if (!r.ok) return r;
    const id = 'effect.monstrosity';
    const count: IrAmount = { kind: 'number', value: Number(r.value.value[1]), span: r.value.span };
    return {
      ok: true,
      value: [makeClause(id, 'monstrosity', { count }, r.value.span)],
      pos: r.pos,
    };
  },
});

/** Quiet: a line these rules do not read stops where it always did. */
export const FEATHER_G2_EFFECT_RULES = [
  quietly(EFFECT_DAMAGE_SAME_SOURCE),
  quietly(EFFECT_MONSTROSITY),
];
