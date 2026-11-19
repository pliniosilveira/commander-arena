/**
 * Condition rules of group D of the Death Toll deck: "if a creature is destroyed this way" (Noxious Gearhulk: "you may destroy another target creature. If a creature is destroyed this
 * way, you gain life equal to its toughness.").
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `condition.destroyed-this-way`: "a creature is destroyed this way" (CR 608.2c: what the instruction before it did, CR 701.8: the permanent was destroyed; one that was not (it is
 * indestructible, or a regeneration shield replaced the destruction) does not count). The engine's `thisWayAtLeast` of `destroyed`. Only after a destroy of the same text, which the
 * lowering checks.
 */
export const CONDITION_DESTROYED_THIS_WAY = defineRule<IrCondition>({
  id: 'condition.destroyed-this-way',
  family: 'condition',
  leading: ['a'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)', 'CR 701.8 (Destroy)'],
  examples: ['a creature is destroyed this way', 'A creature is destroyed this way'],
  rejects: [
    'a creature was destroyed this way',
    'a creature is destroyed',
    'a creature is destroyed this turn',
    'a land is destroyed this way',
    'a creature is exiled this way',
    'two creatures are destroyed this way',
    'a creature is destroyed this way and',
    'creatures are destroyed this way',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/a creature is destroyed this way(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'destroyedThisWay' },
        span: { start: pos, end: r.pos },
        rule: 'condition.destroyed-this-way',
      },
      pos: r.pos,
    };
  },
});

export const DEATH_TOLL_D_CONDITION_RULES = [CONDITION_DESTROYED_THIS_WAY];
