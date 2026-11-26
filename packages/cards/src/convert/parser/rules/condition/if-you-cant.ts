/**
 * "If you can't," at the start of a sentence (Eldrazi Monument, CR 608.2c, 701.21a): what the sentence says happens only when the instruction before it, a
 * sacrifice the player has to make, could not be carried out. Read only in the body of a triggered ability (`sentence.ts`); the lowering reads it only as the
 * sentence right after "sacrifice a creature" (or another permanent of the controller's choice) and refuses it anywhere else.
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `condition.if-you-cant`: "you can't", after the "if" the sentence parser reads (CR 608.2c: a later instruction depends on what an earlier one did; CR 701.21a: a player
 * can't sacrifice what they don't control, and an effect may forbid it). True whenever the sacrifice before it sacrificed nothing. Not read: "you can", "you can't" followed
 * by a verb ("you can't attack"), "you cannot", "you couldn't", "they can't".
 */
export const CONDITION_IF_YOU_CANT = defineRule<IrCondition>({
  id: 'condition.if-you-cant',
  family: 'condition',
  leading: ['you'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)', 'CR 701.21a (Sacrifice)'],
  examples: ["you can't", 'you can’t', "You can't"],
  rejects: [
    'you can',
    'you cannot',
    "you couldn't",
    "they can't",
    "you can't attack",
    "you can'ts",
    "you don't",
    'you',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/you can['’]t(?![\p{L}\p{N}'’])(?! [\p{L}])/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'youCant' },
        span: { start: pos, end: r.pos },
        rule: 'condition.if-you-cant',
      },
      pos: r.pos,
    };
  },
});

export const IF_YOU_CANT_CONDITION_RULES = [CONDITION_IF_YOU_CANT];
