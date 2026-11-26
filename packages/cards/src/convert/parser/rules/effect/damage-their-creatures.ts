/**
 * Effect rules of the Exit from Exile deck (Delayed Blast Fireball): "deals 2 damage to each opponent and each creature they control" (CR 120.2, 109.4). "They" are the opponents
 * just named, so the creatures are those every opponent controls, the same ones "each creature your opponents control" names.
 */
import { literal, sequence } from '../../combinators';
import type { IrAmount, IrNoun, IrNounList } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { DAMAGE_AMOUNT } from './bite';
import { type Clauses, single } from './operands';

/** "each opponent and each creature they control": the list `each opponent and each creature your opponents control` reads as. */
const OPPONENTS_AND_THEIR_CREATURES = (rule: string) => {
  const opponent = family<IrNoun>('noun', { only: ['noun.player'] });
  const creature = family<IrNoun>('noun', { only: ['noun.each-permanent'] });
  return (ctx: Parameters<typeof opponent>[0], pos: number) => {
    const r = sequence(
      spanned(opponent),
      literal(' and '),
      spanned(creature),
      literal(' they control'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [first, , second] = r.value;
    const creatures = second.value;
    const types = creatures.filter.types ?? [];
    if (first.value.det !== 'eachOpponent' || creatures.det !== 'each' || types.length === 0) {
      return { ok: false as const, pos, expected: 'each opponent and each creature they control' };
    }
    const item: IrNoun = { ...creatures, filter: { ...creatures.filter, controller: 'opponent' } };
    const list: IrNounList = {
      kind: 'nounList',
      items: [first.value, item],
      span: { start: pos, end: r.pos },
      rule,
    };
    return { ok: true as const, value: list, pos: r.pos };
  };
};

const ID = 'effect.damage-opponents-and-their-creatures';

/**
 * `effect.damage-opponents-and-their-creatures`: "~ deals 2 damage to each opponent and each creature they control" (CR 120.2 (Damage), 109.4: "they" are the opponents). Not read:
 * "each player and each creature they control", another recipient first, "each creature they control" alone, a creature type or non-creature kind after "each".
 */
export const EFFECT_DAMAGE_OPPONENTS_AND_THEIR_CREATURES = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['~'],
  cites: ['CR 120.2 (Damage)', 'CR 109.4 (Objects and Players)'],
  examples: [
    '~ deals 2 damage to each opponent and each creature they control',
    '~ deals X damage to each opponent and each creature they control',
  ],
  rejects: [
    '~ deals 2 damage to each player and each creature they control',
    '~ deals 2 damage to each creature they control',
    '~ deals 2 damage to each opponent and each creature',
    '~ deals 2 damage to any target and each creature they control',
    '~ deals 2 damage to each opponent and each creature they control or',
  ],
  parse: single(
    ID,
    sequence(
      literal('~ deals '),
      DAMAGE_AMOUNT,
      literal(' to '),
      OPPONENTS_AND_THEIR_CREATURES(ID),
    ),
    ([, amount, , to]: [string, IrAmount, string, IrNounList]) => ({
      verb: 'dealDamage',
      args: { amount, to },
    }),
  ),
});

const IT_ID = 'effect.damage-it-opponents-and-their-creatures';

/**
 * `effect.damage-it-opponents-and-their-creatures`: "it deals 5 damage to each opponent and each creature they control", the "it" of "If ~ was cast from exile, it deals 5 damage to ... instead"
 * (CR 120.2, 614.1a). Same recipients as `effect.damage-opponents-and-their-creatures`. Not read: another recipient, an "it" with no amount.
 */
export const EFFECT_DAMAGE_IT_OPPONENTS_AND_THEIR_CREATURES = defineRule<Clauses>({
  id: IT_ID,
  family: 'effect',
  leading: ['it'],
  cites: ['CR 120.2 (Damage)', 'CR 614.1a (Replacement Effects)'],
  examples: ['it deals 5 damage to each opponent and each creature they control'],
  rejects: [
    'it deals 5 damage to each opponent',
    'it deals 5 damage to each creature they control',
    'it deals damage to each opponent and each creature they control',
    '~ deals 5 damage to each opponent and each creature they control',
  ],
  parse: single(
    IT_ID,
    sequence(
      literal('it deals '),
      DAMAGE_AMOUNT,
      literal(' to '),
      OPPONENTS_AND_THEIR_CREATURES(IT_ID),
    ),
    ([, amount, , to]: [string, IrAmount, string, IrNounList]) => ({
      verb: 'dealDamage',
      args: { amount, to },
    }),
  ),
});

export const DAMAGE_THEIR_CREATURES_EFFECT_RULES = [
  EFFECT_DAMAGE_OPPONENTS_AND_THEIR_CREATURES,
  EFFECT_DAMAGE_IT_OPPONENTS_AND_THEIR_CREATURES,
];
