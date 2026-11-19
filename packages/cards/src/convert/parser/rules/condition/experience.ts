/**
 * Conditions of the experience counters (Meren of Clan Nel Toth, CR 202.3, 608.2c): "that card's mana value is less than or equal to the number of experience counters you have", the
 * test of an "If ..., return it to the battlefield. Otherwise, put it into your hand." that follows "choose target creature card in your graveyard". It reads the mana value of the
 * card an earlier instruction of the text named, as it is now, against an amount read as the instruction runs. The engine's `manaValueAtMostAmount`, in a `conditional` effect.
 */
import { fail, pattern, sequence } from '../../combinators';
import type { IrAmount, IrCondition, IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';

const AMOUNT = family<IrAmount>('amount');

/**
 * `condition.that-mana-value-at-most`: "that card's mana value is less than or equal to <amount>", "that creature's mana value is less than or equal to <amount>" (CR 202.3: the
 * total of the mana cost, an {X} counting 0 anywhere but on the stack, CR 202.3e). Not read: "greater than", "less than" (no "or equal to"), "or less", another object ("it", "this
 * card", "target card"), a missing amount, the past tense.
 */
export const CONDITION_THAT_MANA_VALUE_AT_MOST = defineRule<IrCondition>({
  id: 'condition.that-mana-value-at-most',
  family: 'condition',
  leading: ['that'],
  cites: [
    'CR 202.3 (Mana Value)',
    'CR 202.3e (Mana Value)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    "that card's mana value is less than or equal to the number of experience counters you have",
    'that card’s mana value is less than or equal to the number of experience counters you have',
    "that creature's mana value is less than or equal to the number of experience counters you have",
  ],
  rejects: [
    "that card's mana value is greater than or equal to the number of experience counters you have",
    "that card's mana value is less than the number of experience counters you have",
    "that card's mana value is less than or equal to",
    "that card's mana value is at most the number of experience counters you have",
    "that card's mana value is the number of experience counters you have",
    "that card's mana value was less than or equal to the number of experience counters you have",
    "this card's mana value is less than or equal to the number of experience counters you have",
    'its mana value is less than or equal to the number of experience counters you have',
    "that spell's mana value is less than or equal to the number of experience counters you have",
    "that card's power is less than or equal to the number of experience counters you have",
    "that card's mana value is less than or equal to the number of experience counters you have.",
  ],
  parse: (ctx, pos) => {
    const head = pattern(
      /that (card|creature|permanent)['’]s mana value is less than or equal to /iu,
    )(ctx, pos);
    if (!head.ok) return head;
    const amount = sequence(AMOUNT)(ctx, head.pos);
    if (!amount.ok) return fail(ctx, pos);
    const that: IrNoun = {
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: `that ${(head.value[1] ?? '').toLowerCase()}` },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos + 5 + (head.value[1] ?? '').length },
      rule: 'condition.that-mana-value-at-most',
    };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'manaValueAtMostAmount', who: that, amount: amount.value[0] },
        span: { start: pos, end: amount.pos },
        rule: 'condition.that-mana-value-at-most',
      },
      pos: amount.pos,
    };
  },
});

export const EXPERIENCE_CONDITION_RULES = [CONDITION_THAT_MANA_VALUE_AT_MOST];
