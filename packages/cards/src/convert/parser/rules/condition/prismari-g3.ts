/**
 * Conditions of group 3 of the Prismari deck (issue 87, D-653): "the total mana value of the cards exiled this way is 13 or less" (CR 202.3, 608.2c), the test that begins the sentence
 * "If the total mana value of the cards exiled this way is 13 or less, you may cast any number of spells from among those cards without paying their mana costs." It reads the cards the
 * instructions before it exiled (the engine's `moved`); the lowering reads it only after an instruction that exiled cards.
 */
import { fail, pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule, quietly } from '../registry';

/**
 * `condition.total-mana-value-exiled-this-way`: "the total mana value of the cards exiled this way is 13 or less" (CR 202.3: the mana value of each card, a land 0; CR 608.2c: read as the
 * instruction comes up, after the cards were exiled). The engine's `movedTotalManaValue` with `atMost`. Not read: "or more", "or greater", "is 13", "less than 13", "the total power", another
 * set of cards ("those cards", "cards in your graveyard"), zero, a variable number.
 */
export const CONDITION_TOTAL_MANA_VALUE_EXILED = defineRule<IrCondition>({
  id: 'condition.total-mana-value-exiled-this-way',
  family: 'condition',
  leading: ['the'],
  cites: [
    'CR 202.3 (Mana Value)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 701.13 (Exile)',
  ],
  examples: [
    'the total mana value of the cards exiled this way is 13 or less',
    'the total mana value of the cards exiled this way is 8 or less',
    'the total mana value of the cards exiled this way is thirteen or less',
  ],
  rejects: [
    'the total mana value of the cards exiled this way is 13 or more',
    'the total mana value of the cards exiled this way is 13 or greater',
    'the total mana value of the cards exiled this way is 13',
    'the total mana value of the cards exiled this way is less than 13',
    'the total mana value of the cards exiled this way is 13 or less.',
    'the total mana value of the cards exiled this way is 13 or less and',
    'the total mana value of those cards is 13 or less',
    'the total mana value of the cards in your graveyard is 13 or less',
    'the total power of the cards exiled this way is 13 or less',
    'the total mana value of the cards exiled this way is 0 or less',
    'the total mana value of the cards exiled this way is X or less',
    'the mana value of the card exiled this way is 13 or less',
  ],
  parse: (ctx, pos) => {
    const head = pattern(/the total mana value of the cards exiled this way is /iu)(ctx, pos);
    if (!head.ok) return head;
    const n = quantity(ctx, head.pos);
    if (!n.ok) return n;
    if (n.value < 1) return fail(ctx, pos);
    const tail = pattern(/ or less(?![\p{L}\p{N}])/iu)(ctx, n.pos);
    if (!tail.ok) return tail;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'movedTotalManaValue', atMost: n.value },
        span: { start: pos, end: tail.pos },
        rule: 'condition.total-mana-value-exiled-this-way',
      },
      pos: tail.pos,
    };
  },
});

export const PRISMARI_G3_CONDITION_RULES = [quietly(CONDITION_TOTAL_MANA_VALUE_EXILED)];
