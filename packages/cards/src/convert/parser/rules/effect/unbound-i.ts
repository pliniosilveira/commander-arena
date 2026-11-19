/**
 * Effect rules of group I of the Quandrix Unlimited deck (Unbound Flourishing): "double the value of X" (CR 107.3: the X announced for the spell that was cast) and "copy that spell or
 * ability" (CR 707.10: a copy of the spell, or of the activated ability, that caused the trigger), with its sentence about new targets.
 */
import { literal, optional, pattern, quiet, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

/** What may follow the clause on its sentence: a join says a second instruction, which is not read. */
const CLAUSE_END = pattern(/(?=\.|$)/u);

/** ". You may choose new targets for the copy": the next sentence, taken with the clause. */
const NEW_TARGETS = quiet(
  pattern(/\. you may choose new targets for the copy(?![\p{L}\p{N}])(?!,| and\b| then\b)/iu),
);

/** The spell (or ability) whose casting (or activation) caused the trigger, an anaphor the binding pass resolves. */
function antecedent(rule: string, raw: string, span: { start: number; end: number }): IrNoun {
  return {
    kind: 'noun',
    det: 'anaphor',
    filter: { raw },
    upTo: false,
    plural: false,
    other: false,
    span,
    rule,
  };
}

/**
 * `effect.double-x`: "double the value of X" (CR 107.3, 107.3a: while a spell is on the stack every X in it is the value announced for it; the effect changes that value to twice
 * itself). The spell is the one of the cast trigger the text is part of (the lowering checks that), so the words name none. The engine's `doubleSpellX`. Not read: "double X",
 * another value, "the value of Y", "double the value of X" with more words, a join with a second instruction.
 */
export const EFFECT_DOUBLE_X = defineRule<Clauses>({
  id: 'effect.double-x',
  family: 'effect',
  leading: ['double'],
  cites: [
    'CR 107.3 (Mana Cost)',
    'CR 107.3a (Mana Cost)',
    'CR 603.2 (Handling Triggered Abilities)',
  ],
  examples: ['double the value of X'],
  rejects: [
    'double X',
    'double the value of Y',
    'double the value of X and draw a card',
    'double the value of X, then draw a card',
    'double the value of',
    'triple the value of X',
    'double the value of X.5',
    'double the value of x2',
    'double the value of the X',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(
        literal('double the value of '),
        pattern(new RegExp(`X${BOUNDARY}`, 'u')),
        CLAUSE_END,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const span = r.value.span;
    return {
      ok: true,
      value: [
        makeClause(
          'effect.double-x',
          'doubleSpellX',
          { spell: antecedent('effect.double-x', 'that spell', span) },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.copy-spell-or-ability`: "copy that spell or ability" with or without "You may choose new targets for the copy." (CR 707.10, 707.10c, 113.7a). The engine's `copySpell` of the
 * object that caused the trigger, a spell or an activated ability on the stack. The lowering checks that the trigger is about both (it has an activation among its events).
 */
export const EFFECT_COPY_SPELL_OR_ABILITY = defineRule<Clauses>({
  id: 'effect.copy-spell-or-ability',
  family: 'effect',
  leading: ['copy'],
  cites: ['CR 707.10 (Copying Objects)', 'CR 707.10c (Copying Objects)', 'CR 113.7a (Abilities)'],
  examples: [
    'copy that spell or ability. you may choose new targets for the copy',
    'copy that spell or ability',
  ],
  rejects: [
    'copy that spell or ability and draw a card',
    'copy that spell or ability, then draw a card',
    'copy that spell or ability. you may choose new targets for the copies',
    'copy that spell or ability for each creature you control',
    'copy that spell or abilities',
    'copy that ability',
    'copy target spell or ability',
    'copy that spell or',
    'copy this spell or ability',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(
        literal('copy '),
        spanned(pattern(new RegExp(`that spell or ability${BOUNDARY}`, 'iu'))),
        CLAUSE_END,
        optional(NEW_TARGETS, null),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, word, , newTargets] = r.value.value;
    const span = r.value.span;
    return {
      ok: true,
      value: [
        makeClause(
          'effect.copy-spell-or-ability',
          'copySpell',
          {
            spell: antecedent('effect.copy-spell-or-ability', 'that spell or ability', word.span),
            newTargets: {
              kind: 'flag',
              value: newTargets !== null,
              span,
              rule: 'effect.copy-spell-or-ability',
            },
          },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

export const UNBOUND_I_EFFECT_RULES = [EFFECT_DOUBLE_X, EFFECT_COPY_SPELL_OR_ABILITY].map(quietly);
