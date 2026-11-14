/**
 * Static statements of group 3 of the Danitha deck (issue 26, D-428): "Equip abilities you activate that target enchanted creature cost {3} less to activate."
 * (CR 601.2f, 602.2b, 702.6a, 118.7a). The cost of an ability is reduced like the cost of a spell: only the generic mana, never below zero, and the targets are chosen before the
 * total cost is determined.
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `static.equip-cost-reduction`: "Equip abilities you activate that target enchanted creature cost {3} less to activate." (CR 702.6a: Equip is an activated ability of an
 * Equipment; CR 601.2f, 602.2b: the total cost of an activation is determined after its targets are chosen; CR 118.7a: a reduction takes generic mana off the cost). A static
 * ability of an Aura (the creature it enchants is the creature the Equip abilities must target): the engine's `abilityCostReduction` of the generic part of the mana cost.
 * Whole numbers of generic mana only. Not read: "cost {X} less", colored mana, "Equip abilities your opponents activate", an ability that is not Equip ("Crew abilities", "abilities
 * you activate"), "that target equipped creature", "to activate" missing, and a count after it.
 */
export const STATIC_EQUIP_COST_REDUCTION = defineRule<IrStatic>({
  id: 'static.equip-cost-reduction',
  family: 'static',
  leading: ['equip'],
  cites: [
    'CR 702.6a (Equip)',
    'CR 601.2f (Casting Spells)',
    'CR 602.2b (Activating Activated Abilities)',
    'CR 118.7a (Costs)',
  ],
  examples: [
    'Equip abilities you activate that target enchanted creature cost {3} less to activate.',
    'Equip abilities you activate that target enchanted creature cost {1} less to activate.',
  ],
  rejects: [
    'Equip abilities you activate that target enchanted creature cost {3} less to activate',
    'Equip abilities you activate that target enchanted creature cost {X} less to activate.',
    'Equip abilities you activate that target enchanted creature cost {W} less to activate.',
    'Equip abilities you activate that target enchanted creature cost {0} less to activate.',
    'Equip abilities you activate that target equipped creature cost {3} less to activate.',
    'Equip abilities your opponents activate that target enchanted creature cost {3} less to activate.',
    'Equip abilities you activate cost {3} less to activate.',
    'Crew abilities you activate that target enchanted creature cost {3} less to activate.',
    'Equip abilities you activate that target enchanted creature cost {3} more to activate.',
    'Equip abilities you activate that target enchanted creature cost {3} less to cast.',
    'Equip abilities you activate that target enchanted creature cost {3} less to activate for each Aura you control.',
    'Equip abilities you activate that target enchanted creature cost {1}{W} less to activate.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('equip abilities you activate that target enchanted creature cost '),
      pattern(/\{([1-9]\d*)\}/),
      literal(' less to activate'),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const subject: IrNoun = {
      kind: 'noun',
      det: 'self',
      filter: { raw: '~' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos },
      rule: 'static.equip-cost-reduction',
    };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects: [{ kind: 'abilityCostReduction', amount: Number(r.value[1][1]) }],
        span: { start: pos, end: r.pos },
        rule: 'static.equip-cost-reduction',
      },
      pos: r.pos,
    };
  },
});

export const DANITHA_G3_STATIC_RULES = [STATIC_EQUIP_COST_REDUCTION];
