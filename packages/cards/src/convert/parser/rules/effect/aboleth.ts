/**
 * Effect rule of Aboleth Spawn (Mind Flayarrrs deck, group 7): "copy that ability. You may choose new targets for the copy." (CR 707.10, 707.10c, 113.7a): the copy of the triggered ability
 * that the trigger of the text is about.
 */
import { literal, optional, pattern, quiet, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

/** What may follow the clause on its sentence: a join says a second instruction, which is not read. */
const CLAUSE_END = pattern(/(?=\.|$)/u);

/** ". You may choose new targets for the copy": the next sentence, taken with the clause. */
const NEW_TARGETS = quiet(
  pattern(/\. you may choose new targets for the copy(?![\p{L}\p{N}])(?!,| and\b| then\b)/iu),
);

/**
 * `effect.copy-that-ability`: "copy that ability" with or without "You may choose new targets for the copy." (CR 707.10, 707.10c, 113.7a). The engine's `copySpell` of the ability on the
 * stack the trigger is about (`triggerSubject`); the validation refuses it where the trigger is not about an ability. Not read: "that spell or ability" (`effect.copy-spell-or-ability`),
 * "target ability", "this ability", a plural, a join with a second instruction, "the copies".
 */
export const EFFECT_COPY_THAT_ABILITY = defineRule<Clauses>({
  id: 'effect.copy-that-ability',
  family: 'effect',
  leading: ['copy'],
  cites: ['CR 707.10 (Copying Objects)', 'CR 707.10c (Copying Objects)', 'CR 113.7a (Abilities)'],
  examples: ['copy that ability. you may choose new targets for the copy', 'copy that ability'],
  rejects: [
    'copy that ability and draw a card',
    'copy that ability, then draw a card',
    'copy that ability. you may choose new targets for the copies',
    'copy that abilities',
    'copy target ability',
    'copy this ability',
    'copy that spell or ability',
    'copy that',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(
        literal('copy '),
        spanned(pattern(new RegExp(`that ability${BOUNDARY}`, 'iu'))),
        CLAUSE_END,
        optional(NEW_TARGETS, null),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, word, , newTargets] = r.value.value;
    const span = r.value.span;
    const ability: IrNoun = {
      kind: 'noun',
      det: 'triggerSubject',
      filter: { raw: 'that ability' },
      upTo: false,
      plural: false,
      other: false,
      span: word.span,
      rule: 'effect.copy-that-ability',
      ref: 'trig',
    };
    return {
      ok: true,
      value: [
        makeClause(
          'effect.copy-that-ability',
          'copySpell',
          {
            spell: ability,
            newTargets: {
              kind: 'flag',
              value: newTargets !== null,
              span,
              rule: 'effect.copy-that-ability',
            },
          },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

export const ABOLETH_EFFECT_RULES = [EFFECT_COPY_THAT_ABILITY];
