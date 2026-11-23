/**
 * Static statements of group 4 of the Limit Break deck (issue 96): "The first activated ability you activate during your turn that targets a creature you control costs {2} less to
 * activate." (Professor Hojo; CR 601.2f, 602.2b, 118.7a).
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `static.first-targeting-ability-cost-reduction`: "The first activated ability you activate during your turn that targets a creature you control costs {2} less to activate." (CR 602.2b: the
 * total cost of an activation is determined after its targets are chosen; CR 601.2f, 118.7a: a reduction takes generic mana off the cost; CR 602.2: any activated ability, a loyalty ability
 * included). A static ability of a permanent: the engine's `abilityCostReduction` of the first such ability of the turn. Whole numbers of generic mana only. Not read: "cost {X} less", colored
 * mana, "{0}", another ordinal ("second"), another turn ("each turn", an opponent's), "a creature" or "target creature" (it must be one you control), "abilities" in the plural, "cost more", "to
 * cast", a count after it.
 */
export const STATIC_FIRST_TARGETING_ABILITY_COST_REDUCTION = defineRule<IrStatic>({
  id: 'static.first-targeting-ability-cost-reduction',
  family: 'static',
  leading: ['the'],
  cites: [
    'CR 601.2f (Casting Spells)',
    'CR 602.2 (Activating Activated Abilities)',
    'CR 602.2b (Activating Activated Abilities)',
    'CR 118.7a (Costs)',
  ],
  examples: [
    'The first activated ability you activate during your turn that targets a creature you control costs {2} less to activate.',
    'The first activated ability you activate during your turn that targets a creature you control costs {1} less to activate.',
  ],
  rejects: [
    'The first activated ability you activate during your turn that targets a creature you control costs {2} less to activate',
    'The first activated ability you activate during your turn that targets a creature you control costs {X} less to activate.',
    'The first activated ability you activate during your turn that targets a creature you control costs {R} less to activate.',
    'The first activated ability you activate during your turn that targets a creature you control costs {0} less to activate.',
    'The first activated ability you activate during your turn that targets a creature you control costs {1}{R} less to activate.',
    'The second activated ability you activate during your turn that targets a creature you control costs {2} less to activate.',
    'The first activated ability you activate each turn that targets a creature you control costs {2} less to activate.',
    'The first activated ability you activate during your turn that targets a creature costs {2} less to activate.',
    'The first activated ability you activate during your turn that targets a creature an opponent controls costs {2} less to activate.',
    'The first activated ability an opponent activates during your turn that targets a creature you control costs {2} less to activate.',
    'The first activated ability you activate during your turn that targets a creature you control costs {2} more to activate.',
    'The first activated ability you activate during your turn that targets a creature you control costs {2} less to cast.',
    'The first activated ability you activate during your turn that targets a creature you control costs {2} less to activate for each Aura you control.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal(
        'the first activated ability you activate during your turn that targets a creature you control costs ',
      ),
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
      rule: 'static.first-targeting-ability-cost-reduction',
    };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects: [{ kind: 'firstTargetingAbilityCostReduction', amount: Number(r.value[1][1]) }],
        span: { start: pos, end: r.pos },
        rule: 'static.first-targeting-ability-cost-reduction',
      },
      pos: r.pos,
    };
  },
});

export const LIMIT_BREAK_G4_STATIC_RULES = [STATIC_FIRST_TARGETING_ABILITY_COST_REDUCTION];
