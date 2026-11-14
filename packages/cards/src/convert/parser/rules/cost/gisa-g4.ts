/**
 * Costs of group 4 of the Gisa deck (issue 41, D-462): "Reveal this card from your hand" (CR 701.20a, 118.1, 113.6b), the cost of an ability that works from the hand
 * (Tetzimoc, Primal Death). The card is shown to every player and stays in the hand.
 */
import { pattern } from '../../combinators';
import type { IrCost } from '../../ir/types';
import { defineRule, spanned } from '../registry';

/**
 * `cost.reveal-this`: "Reveal this card from your hand" (CR 701.20a: to reveal a card is to show it to all players; CR 113.6b: an ability that says where it works functions
 * there; CR 602.2: the cost is paid as the ability is activated). The engine's `revealThis`, paid only from the hand. Not read: "Reveal ~", another card ("Reveal a card from
 * your hand", "Reveal a creature card"), another zone, no zone ("Reveal this card"), "Reveal this card from your hand and" (another cost after it is not a rule of this one).
 */
export const COST_REVEAL_THIS = defineRule<IrCost>({
  id: 'cost.reveal-this',
  family: 'cost',
  leading: ['reveal'],
  cites: [
    'CR 701.20a (Reveal)',
    'CR 113.6b (Abilities)',
    'CR 118.1 (Costs)',
    'CR 602.2 (Activating Activated Abilities)',
  ],
  examples: ['Reveal this card from your hand', 'reveal this card from your hand'],
  rejects: [
    'Reveal',
    'Reveal this card',
    'Reveal ~',
    'Reveal a card from your hand',
    'Reveal a creature card from your hand',
    'Reveal this card from your graveyard',
    'Reveal this card from your library',
    'Reveal this card from your hand and',
    'Reveal this permanent from your hand',
    'Reveal two cards from your hand',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(/reveal this card from your hand(?![\p{L}\p{N}])(?!\s+and)/iu))(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: { kind: 'revealThis', span: r.value.span, rule: 'cost.reveal-this' },
      pos: r.pos,
    };
  },
});

export const GISA_G4_COST_RULES = [COST_REVEAL_THIS];
