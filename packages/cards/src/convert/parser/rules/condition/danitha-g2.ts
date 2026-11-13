/**
 * Conditions of group 2 of the Danitha deck (issue 26, D-1220 and D-1221 provisional): "If you don't, put a +1/+1 counter on this creature." (Ainok Wayfarer, Blanchwood
 * Prowler, Airlift Chaplain) and "If you control a Squirrel or returned a Squirrel card to your hand this way, create a Food token." (Cache Grab). "If you put a Town card into
 * your hand this way" is `condition.put-this-way` (`korvold.ts`).
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { WHAT_IT_IS } from './recursion';

/**
 * `condition.if-you-dont`: "you don't", after the "if" the sentence parser reads (CR 608.2c: a later instruction depends on what an earlier one did, CR 608.2d: the player who may do
 * something chooses). It is the other half of "you may put a land card from among them into your hand": true whenever no card was put into the hand, because the player declined,
 * no card could be taken or none was milled. The lowering reads it only as the sentence right after such a choice; anywhere else it is refused (an "If you don't" after a payment is
 * the replacement of `replacement.enters-tapped-unless-pays`, after another offer a pair of its own). Not read: "you do", "you do not", "you didn't", "you don't put it onto the
 * battlefield" (that is `condition.you-dont-put-it-onto-battlefield`).
 */
export const CONDITION_IF_YOU_DONT = defineRule<IrCondition>({
  id: 'condition.if-you-dont',
  family: 'condition',
  leading: ['you'],
  cites: [
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: ["you don't", 'you don’t', "You don't"],
  rejects: [
    'you do',
    'you do not',
    "you didn't",
    "you don't put it onto the battlefield",
    "you don't control a creature",
    "they don't",
    "you don'ts",
    'you',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/you don['’]t(?![\p{L}\p{N}'’])(?! (?:put|control|have)(?![\p{L}\p{N}]))/iu)(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'youDont' },
        span: { start: pos, end: r.pos },
        rule: 'condition.if-you-dont',
      },
      pos: r.pos,
    };
  },
});

/**
 * `condition.control-or-returned`: "you control a Squirrel or returned a Squirrel card to your hand this way" (CR 608.2c, 400.7j, 205.3): you control a permanent that is that
 * (the reading of `condition.control-a`) or the card an earlier instruction of the text put into your hand is that. The kind is said twice and read twice, so the two halves may
 * differ. The engine's `or` of `controlsAtLeast` and `objectMatches` of the moved card in the hand. Not read: "and", other zones, a count, "you control a Squirrel or you returned".
 */
export const CONDITION_CONTROL_OR_RETURNED = defineRule<IrCondition>({
  id: 'condition.control-or-returned',
  family: 'condition',
  leading: ['you'],
  cites: [
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 400.7j (General)',
    'CR 205.3 (Subtypes)',
  ],
  examples: [
    'you control a Squirrel or returned a Squirrel card to your hand this way',
    'you control a Cat or returned a Cat card to your hand this way',
    'you control an artifact or returned an artifact card to your hand this way',
  ],
  rejects: [
    'you control a Squirrel',
    'you control a Squirrel and returned a Squirrel card to your hand this way',
    'you control a Squirrel or returned a Squirrel card to your graveyard this way',
    'you control a Squirrel or returned a Squirrel card to your hand',
    'you control a Squirrel or returned a Squirrel card to their hand this way',
    'you control a Squirrel or you returned a Squirrel card to your hand this way',
    'you control a Squirrel or returned Squirrel cards to your hand this way',
    'an opponent controls a Squirrel or returned a Squirrel card to your hand this way',
  ],
  parse: (ctx, pos) => {
    const control = family<IrCondition>('condition', { only: ['condition.control-a'] })(ctx, pos);
    if (!control.ok) return control;
    const or = pattern(/ or returned (?:a|an) /iu)(ctx, control.pos);
    if (!or.ok) return or;
    const what = spanned(sequence(WHAT_IT_IS, literal(' to your hand this way')))(ctx, or.pos);
    if (!what.ok) return what;
    // Looked at as the end of the phrase: a longer word is another phrase.
    const end = pattern(/(?![\p{L}\p{N}])/u)(ctx, what.pos);
    if (!end.ok) return end;
    const span = { start: pos, end: what.pos };
    const id = 'condition.control-or-returned';
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: {
          kind: 'or',
          terms: [
            control.value,
            {
              kind: 'condition',
              test: { kind: 'putThisWay', filter: what.value.value[0], zone: 'hand' },
              span: { start: or.pos, end: what.pos },
              rule: id,
            },
          ],
        },
        span,
        rule: id,
      },
      pos: what.pos,
    };
  },
});

export const DANITHA_G2_CONDITION_RULES = [CONDITION_CONTROL_OR_RETURNED];

/** Registered after `condition.you-dont-put-it-onto-battlefield`, whose phrase starts with the same words. */
export const DANITHA_G2_LATE_CONDITION_RULES = [CONDITION_IF_YOU_DONT];
