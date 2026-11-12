/**
 * Conditions of the die roll and of a card in a graveyard (D-271): "the result is 1" (CR 706.2, 706.3a: the number on the die, read by the
 * instructions after the roll) and "~ is in your graveyard" (CR 113.6b, 603.4: the intervening "if" of an ability that works from the graveyard).
 */
import { fail, pattern } from '../../combinators';
import type { IrComparison, IrCondition } from '../../ir/types';
import { defineRule, spanned } from '../registry';

/**
 * `condition.die-result`: "the result is 1", "the result is 4 or more", "the result is 2 or less" (CR 706.2, 706.3a: "If the result was in this range,
 * [effect]"). The number is written in digits and is at least 1; "or higher" and "or greater" are "or more", "or lower" is "or less". A range of two
 * numbers ("1-3"), a list ("1 or 2"), a number word, a modifier and "the result of the roll is" are not read. Where it may stand (after the roll
 * of the same text, with a number the die can show) is checked by the lowering, which knows the roll.
 */
export const CONDITION_DIE_RESULT = defineRule<IrCondition>({
  id: 'condition.die-result',
  family: 'condition',
  leading: ['the'],
  cites: ['CR 706.2 (Rolling a Die)', 'CR 706.3a (Rolling a Die)', 'CR 706.3b (Rolling a Die)'],
  examples: [
    'the result is 1',
    'the result is 4 or more',
    'the result is 4 or higher',
    'the result is 4 or greater',
    'the result is 2 or less',
    'the result is 2 or lower',
    'the result is 20',
  ],
  rejects: [
    'the result is',
    'the result is 0',
    'the result is 1-3',
    'the result is 1–3',
    'the result is 1 or 2',
    'the result is 1 or fewer',
    'the result is one',
    'the result is at least 4',
    'the result is greater than 4',
    'the result is 4 or more,',
    'the results are 1',
    'the result was 1',
    'the roll is 1',
    'that result is 1',
    'the result is X',
    'the result is 1 or more or less',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /the result is (\d+)(?: or (more|higher|greater|less|lower))?(?![\p{L}\p{N}])(?![-–—])(?! or )/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { value: match, span } = r.value;
    const value = Number(match[1]);
    if (!Number.isSafeInteger(value) || value < 1) return fail(ctx, pos);
    const word = (match[2] ?? '').toLowerCase();
    const compare: IrComparison = {
      cmp: word === '' ? 'equal' : word === 'less' || word === 'lower' ? 'atMost' : 'atLeast',
      value,
    };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'dieResult', compare },
        span,
        rule: 'condition.die-result',
      },
      pos: r.pos,
    };
  },
});

/**
 * `condition.this-in-your-graveyard`: "~ is in your graveyard", "this card is in your graveyard" (CR 113.6b, 603.4, 400.7): the card the text belongs to
 * is in its owner's graveyard, read from the card itself as the event happens and again as the ability resolves. The engine's `thisInYourGraveyard`,
 * which the lowering of a triggered ability accepts as its intervening "if" when the ability works from the graveyard (it returns the card). Not read:
 * another zone ("in your hand", "on the battlefield"), another graveyard ("in a graveyard", "in an opponent's graveyard"), another card ("target card"),
 * a negation, or more words after it.
 */
export const CONDITION_THIS_IN_YOUR_GRAVEYARD = defineRule<IrCondition>({
  id: 'condition.this-in-your-graveyard',
  family: 'condition',
  leading: ['~', 'this'],
  cites: ['CR 113.6b (Abilities)', 'CR 603.4 (Handling Triggered Abilities)', 'CR 400.7 (General)'],
  examples: ['~ is in your graveyard', 'this card is in your graveyard'],
  rejects: [
    '~ is in a graveyard',
    "~ is in an opponent's graveyard",
    '~ is in your hand',
    '~ is on the battlefield',
    '~ is not in your graveyard',
    '~ isn’t in your graveyard',
    '~ is in your graveyards',
    '~ was in your graveyard',
    '~ is in your graveyard or exile',
    '~ is in your graveyard and you control a Mountain',
    'this creature is in your graveyard',
    'this card is in the graveyard',
    'that card is in your graveyard',
    'it is in your graveyard',
    "it's in your graveyard",
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(/(?:~|this card) is in your graveyard(?![\p{L}\p{N}])(?! or )(?! and )/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'thisInYourGraveyard' },
        span: r.value.span,
        rule: 'condition.this-in-your-graveyard',
      },
      pos: r.pos,
    };
  },
});

export const ARDEN_CONDITION_RULES = [CONDITION_DIE_RESULT, CONDITION_THIS_IN_YOUR_GRAVEYARD];
