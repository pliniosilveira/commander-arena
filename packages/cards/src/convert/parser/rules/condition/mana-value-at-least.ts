/**
 * `condition.exiled-mana-value-at-least` (Summoner's Sending, CR 202.3, 608.2c): "the exiled card's mana value is 4 or greater", the test of a trailing "if" that reads the mana value of the
 * card an earlier instruction of the text exiled, as it was (CR 608.2h). The engine's `manaValueAtLeastAmount`, in a `conditional` effect.
 */
import { fail, pattern, sequence } from '../../combinators';
import type { IrAmount, IrCondition, IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';

const AMOUNT = family<IrAmount>('amount');

export const CONDITION_EXILED_MANA_VALUE_AT_LEAST = defineRule<IrCondition>({
  id: 'condition.exiled-mana-value-at-least',
  family: 'condition',
  leading: ['the'],
  cites: ['CR 202.3 (Mana Value)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    "the exiled card's mana value is 4 or greater",
    'the exiled card’s mana value is 4 or greater',
    "the exiled card's mana value is 6 or more",
  ],
  rejects: [
    "the exiled card's mana value is 4 or less",
    "the exiled card's mana value is 4",
    "the exiled card's mana value is greater than 4",
    "the exiled card's mana value was 4 or greater",
    "the discarded card's mana value is 4 or greater",
    "that card's mana value is 4 or greater",
    'its mana value is 4 or greater',
    "the exiled card's power is 4 or greater",
    "the exiled card's mana value is or greater",
  ],
  parse: (ctx, pos) => {
    const head = pattern(/the exiled card['’]s mana value is /iu)(ctx, pos);
    if (!head.ok) return head;
    const amount = sequence(AMOUNT, pattern(/ or (?:greater|more)(?![\p{L}\p{N}])/iu))(
      ctx,
      head.pos,
    );
    if (!amount.ok) return fail(ctx, pos);
    const that: IrNoun = {
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: 'that card' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos + 15 },
      rule: 'condition.exiled-mana-value-at-least',
    };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'manaValueAtLeastAmount', who: that, amount: amount.value[0] },
        span: { start: pos, end: amount.pos },
        rule: 'condition.exiled-mana-value-at-least',
      },
      pos: amount.pos,
    };
  },
});

export const MANA_VALUE_AT_LEAST_CONDITION_RULES = [CONDITION_EXILED_MANA_VALUE_AT_LEAST];
