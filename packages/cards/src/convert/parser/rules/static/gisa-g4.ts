/**
 * Static statements of group 4 of the Gisa deck (issue 41, D-461): "Activated abilities of creature cards in your graveyard cost {1} less to activate." (CR 601.2f, 118.7,
 * 113.6b). The cost of an ability is reduced like the cost of a spell: only the generic mana, never below zero.
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { defineRule } from '../registry';

const TYPES = ['creature', 'artifact', 'enchantment', 'land', 'planeswalker'] as const;

/**
 * `static.graveyard-ability-cost-reduction`: "Activated abilities of creature cards in your graveyard cost {1} less to activate." (CR 113.6b: an ability of a card in a graveyard
 * works only if it says so, as Unearth, Encore and Eternalize do; CR 601.2f, 118.7: the total cost of an activation is worked out with the reductions, which take generic mana off
 * the cost). A static ability of a permanent: the engine's `abilityCostReduction` of the abilities of the cards of that card type in the graveyard of its controller. Whole numbers
 * of generic mana only. Not read: "cost {X} less", colored mana, "in a graveyard" or "your opponents' graveyards", "abilities of creatures you control" (the battlefield), no card
 * type, more than one card type, "to activate" missing, "more", and a count after it.
 */
export const STATIC_GRAVEYARD_ABILITY_COST_REDUCTION = defineRule<IrStatic>({
  id: 'static.graveyard-ability-cost-reduction',
  family: 'static',
  leading: ['activated'],
  cites: [
    'CR 113.6b (Abilities)',
    'CR 601.2f (Casting Spells)',
    'CR 602.2b (Activating Activated Abilities)',
    'CR 118.7 (Costs)',
  ],
  examples: [
    'Activated abilities of creature cards in your graveyard cost {1} less to activate.',
    'Activated abilities of creature cards in your graveyard cost {2} less to activate.',
    'Activated abilities of artifact cards in your graveyard cost {1} less to activate.',
  ],
  rejects: [
    'Activated abilities of creature cards in your graveyard cost {1} less to activate',
    'Activated abilities of creature cards in your graveyard cost {X} less to activate.',
    'Activated abilities of creature cards in your graveyard cost {B} less to activate.',
    'Activated abilities of creature cards in your graveyard cost {0} less to activate.',
    'Activated abilities of creature cards in a graveyard cost {1} less to activate.',
    'Activated abilities of creature cards in your opponents’ graveyards cost {1} less to activate.',
    'Activated abilities of creatures you control cost {1} less to activate.',
    'Activated abilities of cards in your graveyard cost {1} less to activate.',
    'Activated abilities of creature cards in your graveyard cost {1} more to activate.',
    'Activated abilities of creature cards in your graveyard cost {1} less to cast.',
    'Activated abilities of creature cards in your graveyard cost {1}{B} less to activate.',
    'Activated abilities of creature cards in your graveyard cost {1} less to activate for each Zombie you control.',
    'Activated abilities of creature and artifact cards in your graveyard cost {1} less to activate.',
  ],
  parse: (ctx, pos) => {
    const id = 'static.graveyard-ability-cost-reduction';
    const r = sequence(
      pattern(
        new RegExp(
          `activated abilities of (${TYPES.join('|')}) cards in your graveyard cost `,
          'iu',
        ),
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
      rule: id,
    };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects: [
          {
            kind: 'graveyardAbilityCostReduction',
            amount: Number(r.value[1][1]),
            types: [(r.value[0][1] ?? '').toLowerCase()],
          },
        ],
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

export const GISA_G4_STATIC_RULES = [STATIC_GRAVEYARD_ABILITY_COST_REDUCTION];
