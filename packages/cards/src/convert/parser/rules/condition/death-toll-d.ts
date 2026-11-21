/**
 * Condition rules of group D of the Death Toll deck: "if a creature is destroyed this way" (Noxious Gearhulk: "you may destroy another target creature. If a creature is destroyed this
 * way, you gain life equal to its toughness.").
 */
import { pattern } from '../../combinators';
import type { IrCondition, IrNoun } from '../../ir/types';
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

/**
 * `condition.dies-this-way`: "that creature dies this way" (Saw in Half; CR 700.4: a creature dies when it is put into a graveyard from the battlefield; CR 608.2c: what the instruction
 * before it did). "That creature" is the creature an earlier instruction of the text named (the binding pass finds it). The engine's `diedThisWay` of the target: false when the destroy
 * did nothing, or the creature was exiled instead. Not read: another subject, another tense, "this turn", "dies" alone.
 */
export const CONDITION_DIES_THIS_WAY = defineRule<IrCondition>({
  id: 'condition.dies-this-way',
  family: 'condition',
  leading: ['that'],
  cites: ['CR 700.4 (General)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: ['that creature dies this way', 'That creature dies this way'],
  rejects: [
    'that creature died this way',
    'that creature dies',
    'that creature dies this turn',
    'that creatures dies this way',
    'a creature dies this way',
    'that land dies this way',
    'that creature is destroyed this way',
    'that creature dies this way and',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/that creature dies this way(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    const who: IrNoun = {
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: 'that creature' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos + 'that creature'.length },
      rule: 'condition.dies-this-way',
    };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'diesThisWay', who },
        span: { start: pos, end: r.pos },
        rule: 'condition.dies-this-way',
      },
      pos: r.pos,
    };
  },
});

export const DEATH_TOLL_D_CONDITION_RULES = [CONDITION_DESTROYED_THIS_WAY, CONDITION_DIES_THIS_WAY];
