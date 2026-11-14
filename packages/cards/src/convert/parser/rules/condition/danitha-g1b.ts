/**
 * Conditions of group 1b of the Danitha deck (issue 26, D-403 provisional): "If you don't put it onto the battlefield, put it into your hand." (Cosmic Rebirth).
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `condition.you-dont-put-it-onto-battlefield`: "you don't put it onto the battlefield", "you don't put it onto the battlefield this way", after the "if" the sentence parser
 * reads (CR 608.2c: a later instruction depends on what an earlier one did; CR 608.2d: a player who may do something chooses as the instruction comes up). It is true whenever
 * the card was not put onto the battlefield by the offer of the sentence before it: the player declined, the offer was never made (the test before it failed) or the card could
 * not be put there. The lowering reads it only as the second of two sentences, the first of which offers to put "it" onto the battlefield; anywhere else it is refused.
 * Not read: "you do", "you don't" alone, another zone or another object, "you didn't", "you do not".
 */
export const CONDITION_YOU_DONT_PUT_IT = defineRule<IrCondition>({
  id: 'condition.you-dont-put-it-onto-battlefield',
  family: 'condition',
  leading: ['you'],
  cites: [
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: [
    "you don't put it onto the battlefield",
    'you don’t put it onto the battlefield',
    "you don't put it onto the battlefield this way",
    "You don't put it onto the battlefield",
  ],
  rejects: [
    "you don't",
    'you do not put it onto the battlefield',
    "you didn't put it onto the battlefield",
    "you don't put it into your hand",
    "you don't put that card onto the battlefield",
    "you don't put them onto the battlefield",
    "you don't put it onto the battlefield tapped",
    "you don't put it onto the battlefield or into your hand",
    'you put it onto the battlefield',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /you don['’]t put it onto the battlefield(?: this way)?(?![\p{L}\p{N}'’])(?! (?:tapped|or|and)(?![\p{L}\p{N}]))/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'notPutOntoBattlefield' },
        span: { start: pos, end: r.pos },
        rule: 'condition.you-dont-put-it-onto-battlefield',
      },
      pos: r.pos,
    };
  },
});

export const DANITHA_G1B_CONDITION_RULES = [CONDITION_YOU_DONT_PUT_IT];
