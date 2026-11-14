/**
 * Copying a spell (stage P27; D-129): "Copy target instant or sorcery spell. You may choose new targets for the
 * copy.", its "you control" form and "copy that spell" after a spell was cast (CR 707.10: to copy a spell is to
 * put a copy of it on the stack; CR 707.10c: its controller may choose new targets for it). One clause,
 * `copySpell`, with the spell (a target or the spell of the cast trigger) and a flag, `newTargets`, that is true
 * when the second sentence "You may choose new targets for the copy." follows; the lowering builds the engine's
 * `copySpell` with `newTargets: 'may'` or `'no'`.
 *
 * The sentence about the new targets is read with the clause (it is a second sentence in the text, but only
 * means something next to the copy). Not read: "Copy target instant or sorcery spell, then return it to its
 * owner's hand." (a second instruction that the engine has no way to run on the card that the copy came from),
 * "except" copies, "copy it", copies of abilities and "for each" counts.
 */
import { literal, map, optional, pattern, quiet, sequence } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { BOUNDARY, spellPhrase } from '../noun/phrases';
import { defineRule, node, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

/** " you control": the spell is one of the caster's. The only words after the spell phrase that are read. */
const YOU_CONTROL = pattern(new RegExp(` you control${BOUNDARY}`, 'iu'));

/**
 * ". You may choose new targets for the copy": the next sentence, taken with the clause. Not followed by more
 * of the same sentence ("... for the copy and ...").
 */
const NEW_TARGETS = quiet(
  pattern(/\. you may choose new targets for the copy(?![\p{L}\p{N}])(?!,| and\b| then\b)/iu),
);

/** What may follow the copied spell on the same clause: a join says a second instruction, which is not read. */
const CLAUSE_END = pattern(/(?=\.|$)/u);

/** "target instant or sorcery spell [you control]": a target of the spells on the stack. */
const TARGET_SPELL = node<{ filter: IrFilter; yours: boolean }, IrNoun>(
  'effect.copy-spell',
  map(
    sequence(literal('target '), spellPhrase(), optional(YOU_CONTROL, null)),
    ([, filter, control]) => ({ filter, yours: control !== null }),
  ),
  ({ filter, yours }) => ({
    kind: 'noun',
    det: 'target',
    filter: yours ? { ...filter, controller: 'you' } : filter,
    upTo: false,
    plural: false,
    other: false,
  }),
);

/** "that spell": the spell whose casting triggered the ability, bound by the binding pass. */
const THAT_SPELL = node<RegExpExecArray, IrNoun>(
  'effect.copy-spell',
  pattern(new RegExp(`that spell${BOUNDARY}`, 'iu')),
  (m) => ({
    kind: 'noun',
    det: 'anaphor',
    filter: { raw: m[0] },
    upTo: false,
    plural: false,
    other: false,
  }),
);

/**
 * `effect.copy-spell`: "copy target instant or sorcery spell", "copy target instant or sorcery spell you control"
 * and "copy that spell", each with or without the sentence "You may choose new targets for the copy." (CR 707.10,
 * 707.10c). A spell that is not an instant or a sorcery is as legal for the engine as for the rules; the words
 * decide the filter.
 */
export const EFFECT_COPY_SPELL = defineRule<Clauses>({
  id: 'effect.copy-spell',
  family: 'effect',
  leading: ['copy'],
  cites: [
    'CR 707.10 (Copying Objects)',
    'CR 707.10c (Copying Objects)',
    'CR 113.7a (Abilities)',
    'CR 601.2c (Casting Spells)',
  ],
  examples: [
    'copy target instant or sorcery spell. you may choose new targets for the copy',
    'copy target instant or sorcery spell you control. you may choose new targets for the copy',
    'copy target spell. you may choose new targets for the copy',
    'copy target instant or sorcery spell',
    'copy that spell',
  ],
  rejects: [
    'copy target instant or sorcery spell, then return it to its owner’s hand. you may choose new targets for the copy',
    "copy target instant or sorcery spell, then return it to its owner's hand",
    'copy target instant or sorcery spell and draw a card',
    'copy target instant or sorcery spell. you may choose new targets for the copies',
    'copy target instant or sorcery spell. you may choose a new target for the copy',
    'copy target instant or sorcery spell you don’t control',
    'copy target instant or sorcery spell with mana value X or less',
    'copy target instant spell, sorcery spell, activated ability, or triggered ability',
    'copy target triggered ability you control',
    'copy target instant or sorcery',
    'copy target creature',
    'copy target spells',
    'copy that creature',
    'copy that spell for each creature you control',
    'copy it',
    'copy this spell',
    'copy',
  ],
  parse: (ctx, pos) =>
    map(
      spanned(
        sequence(
          literal('copy '),
          (c, p) => {
            const target = TARGET_SPELL(c, p);
            return target.ok ? target : THAT_SPELL(c, p);
          },
          CLAUSE_END,
          optional(NEW_TARGETS, null),
        ),
      ),
      ({ value, span }): Clauses => {
        const [, spell, , newTargets] = value;
        return [
          makeClause(
            'effect.copy-spell',
            'copySpell',
            {
              spell,
              newTargets: {
                kind: 'flag',
                value: newTargets !== null,
                span,
                rule: 'effect.copy-spell',
              },
            },
            span,
          ),
        ];
      },
    )(ctx, pos),
});
