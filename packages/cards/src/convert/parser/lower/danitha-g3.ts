/**
 * Lowerings of group 3 of the Danitha deck (issue 26, D-426 to D-428): the attachments of a permanent. "for each Aura attached to it" says "it" of the permanent a
 * static ability is about (the source or the permanent it is attached to), and "Equip abilities you activate that target enchanted creature cost {3} less to activate" is the
 * engine's `abilityCostReduction`.
 */
import type { Ability, StaticSubject } from '@commander-arena/engine';
import type { IrAbility, IrAmount, IrStaticEffect } from '../ir/types';
import { missingFeatures } from './features';
import type { LowerContext, LowerFailure, LowerResult } from './types';

type Static = Extract<IrAbility, { kind: 'static' }>;

/**
 * "for each Aura attached to it" in a static ability's "gets +2/+2": the count's "it" is the permanent the statement is about. Of `~` that is the source ("This creature gets
 * +2/+2 for each Aura attached to it": the Auras attached to it), of "enchanted creature" the permanent the source is attached to ("Enchanted creature gets +2/+2 for each Aura
 * and Equipment attached to it"). For any other subject the "it" stays unbound and the count is not lowered (a group has no one "it": CR 611.3a reads each member).
 */
export function bindAttachedIt(count: IrAmount, subject: StaticSubject): IrAmount {
  if (count.kind !== 'countOf' || count.of.filter.attachedTo?.kind !== 'it') return count;
  const it =
    subject.kind === 'this'
      ? ({ kind: 'source' } as const)
      : subject.kind === 'attached'
        ? ({ kind: 'host' } as const)
        : undefined;
  if (it === undefined) return count;
  return {
    ...count,
    of: { ...count.of, filter: { ...count.of.filter, attachedTo: it } },
  };
}

function failure(node: { span: { start: number; end: number }; rule: string }): LowerFailure {
  return { ok: false, needs: [], at: node.span, rule: node.rule };
}

/**
 * "Equip abilities you activate that target enchanted creature cost {3} less to activate." (D-428, CR 601.2f, 602.2b, 702.6a, 118.7a): the Aura's static ability, which the
 * engine reads as an Equip ability of its controller is activated and its targets are chosen: when one of them is the permanent the Aura is attached to, the generic mana of its
 * cost goes down. Only an Aura has "enchanted creature"; a statement with a condition, a second effect or a second subject is not this one.
 */
export function lowerAbilityCostReduction(
  ability: Static,
  effect: Extract<IrStaticEffect, { kind: 'abilityCostReduction' }>,
  more: number,
  ctx: LowerContext,
): LowerResult<readonly Ability[]> {
  const { statement } = ability;
  if (
    more > 0 ||
    statement.condition !== undefined ||
    statement.also !== undefined ||
    !ctx.faceSubtypes.includes('Aura')
  ) {
    return failure(ability);
  }
  const blocked = missingFeatures([
    'ability:static',
    'static:abilityCostReduction',
    'selector:hostOfSource',
  ]);
  if (blocked.length > 0) return { ...failure(ability), needs: blocked };
  return {
    ok: true,
    value: [
      {
        kind: 'static',
        static: {
          kind: 'abilityCostReduction',
          abilities: 'equip',
          targeting: { hostOfSource: true },
          amount: effect.amount,
        },
      },
    ],
    rule: ability.rule,
  };
}
