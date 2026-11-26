/**
 * Lowerings of the Aura that returns the card it enchants (issue 89, Animate Dead; CR 702.5a, 613.1f, 400.7, 303.4, 701.21a): the engine's `replaceEnchant`, the `moveToZone` of the
 * enchanted card with `putWithSource` followed by `attach`, and the `sacrifice` of what the Aura put onto the battlefield by its controller. They are read in the abilities of an Aura, where
 * "enchanted creature" and "this Aura" are what the engine names `attached` and `this`; the engine's `validateCard` checks that the leaves ability has the enters ability it is linked to.
 */
import type { Effect, Keyword } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { lowerEnchantFilter } from './attachments';
import { arg, type Effects, failure } from './clauses';
import type { FeatureRef } from './features';
import type { LowerContext, Lowering } from './types';

/** An ability of an Aura, read in the body of a triggered ability about the Aura itself. */
const inAnAura = (ctx: LowerContext): boolean =>
  ctx.owner === 'ability' && ctx.faceSubtypes.includes('Aura') && !ctx.selfGone;

export const AURA_SWAPS_ENCHANT: Lowering<IrClause, Effects> = {
  head: 'replaceEnchant',
  id: 'lower.aura-swaps-enchant',
  needs: ['effect:replaceEnchant', 'ability:keyword', 'keyword:enchant'],
  lower(clause, ctx) {
    const loses = arg(clause, 'loses');
    const gains = arg(clause, 'gains');
    if (loses?.kind !== 'noun' || gains?.kind !== 'noun' || !inAnAura(ctx) || !ctx.itIsSelf) {
      return failure(clause);
    }
    const lost = lowerEnchantFilter(loses);
    if (!lost.ok) return lost;
    const gained = lowerEnchantFilter(gains);
    if (!gained.ok) return gained;
    const effect: Effect = {
      kind: 'replaceEnchant',
      objects: { kind: 'this' },
      loses: { kind: 'enchant', filter: lost.value } satisfies Keyword,
      gains: { kind: 'enchant', filter: gained.value } satisfies Keyword,
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

export const RETURN_ENCHANTED_CARD_ATTACH: Lowering<IrClause, Effects> = {
  head: 'returnEnchantedCardAttach',
  id: 'lower.return-enchanted-card-attach',
  needs: ['effect:moveToZone', 'effect:attach', 'ability:putWithSource'],
  lower(clause, ctx) {
    if (!inAnAura(ctx)) return failure(clause);
    const effects: Effect[] = [
      {
        kind: 'moveToZone',
        objects: { kind: 'attached' },
        to: 'battlefield',
        controller: 'you',
        putWithSource: true,
      },
      { kind: 'attach', object: { kind: 'this' }, to: { kind: 'moved' } },
    ];
    return { ok: true, value: effects, rule: clause.rule };
  },
};

export const SACRIFICE_LINKED_CREATURE: Lowering<IrClause, Effects> = {
  head: 'sacrificeLinkedCreature',
  id: 'lower.sacrifice-linked-creature',
  needs: ['effect:sacrifice', 'selector:putWithThis'],
  lower(clause, ctx) {
    // The ability of an Aura that has left: its source is gone (`selfGone` is not asked), the creature is not.
    if (ctx.owner !== 'ability' || !ctx.faceSubtypes.includes('Aura')) return failure(clause);
    const effect: Effect = {
      kind: 'sacrifice',
      objects: { kind: 'putWithThis' },
      byController: true,
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/**
 * "Exile the creature put onto the battlefield with ~" (Diabolic Servitude, CR 607.2, 400.7, 603.10a): the engine's `exile` of `putWithThis`, in an ability of a permanent (even one that
 * has left: its source is gone, the creature is not). The face's link (`moveToZone.putWithSource` in the ability that put the creature there) is made by the face's pass (`link-put-with.ts`).
 */
export const EXILE_PUT_WITH_SELF: Lowering<IrClause, Effects> = {
  head: 'exilePutWithSelf',
  id: 'lower.exile-put-with-self',
  needs: ['effect:exile', 'selector:putWithThis'],
  lower(clause, ctx) {
    if (ctx.owner !== 'ability') return failure(clause);
    const effect: Effect = { kind: 'exile', objects: { kind: 'putWithThis' } };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

export const AURA_GRAVEYARD_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  AURA_SWAPS_ENCHANT,
  RETURN_ENCHANTED_CARD_ATTACH,
  SACRIFICE_LINKED_CREATURE,
  EXILE_PUT_WITH_SELF,
];

/** Features the lowerings of this file can name, for the dimension test. */
export const AURA_GRAVEYARD_NEEDS: readonly FeatureRef[] = [
  'effect:replaceEnchant',
  'effect:moveToZone',
  'effect:attach',
  'effect:sacrifice',
  'effect:exile',
  'selector:putWithThis',
  'selector:putWithSource',
  'ability:putWithSource',
  'ability:keyword',
  'keyword:enchant',
  'condition:thisOnBattlefield',
];
