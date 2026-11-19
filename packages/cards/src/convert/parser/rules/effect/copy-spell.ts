/**
 * Copying a spell (stage P27; D-129): "Copy target instant or sorcery spell. You may choose new targets for the
 * copy.", its "you control" form and "copy that spell" after a spell was cast (CR 707.10: to copy a spell is to
 * put a copy of it on the stack; CR 707.10c: its controller may choose new targets for it). One clause,
 * `copySpell`, with the spell (a target or the spell of the cast trigger) and a flag, `newTargets`, that is true
 * when the second sentence "You may choose new targets for the copy." follows; the lowering builds the engine's
 * `copySpell` with `newTargets: 'may'` or `'no'`.
 *
 * The sentence about the new targets is read with the clause (it is a second sentence in the text, but only
 * means something next to the copy). ", then return it to its owner's hand" after a targeted spell (Narset's
 * Reversal) is a second instruction on the same target: the copy is made first, and the original then leaves the stack for
 * its owner's hand (CR 400.3, 608.2b). Not read: "except" copies, copies of abilities and "for each" counts. "it" is read
 * as the spell of a cast trigger (Quandrix Unlimited group E); the lowering refuses it anywhere the binding pass did not make it that spell.
 */
import { literal, map, optional, pattern, quiet, satisfy, sequence } from '../../combinators';
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

/** ", then return it to its owner's hand": the original goes back to its owner's hand once copied. Only after a target. */
const THEN_RETURN = quiet(pattern(/, then return it to its owner(?:'|’)s hand(?![\p{L}\p{N}])/iu));

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

/** "that spell" or "it": the spell whose casting triggered the ability, bound by the binding pass (the lowering reads "it" only there, CR 707.10). */
const THAT_SPELL = node<RegExpExecArray, IrNoun>(
  'effect.copy-spell',
  pattern(new RegExp(`(?:that spell|it)${BOUNDARY}`, 'iu')),
  (m) => ({
    kind: 'noun',
    det: 'anaphor',
    filter: { raw: m[0] },
    upTo: false,
    plural: false,
    other: false,
  }),
);

/** " and you may choose new targets for the copy": the same permission as the next sentence, joined to the clause (CR 707.10c). */
const AND_NEW_TARGETS = quiet(
  pattern(/,? and you may choose new targets for the copy(?![\p{L}\p{N}])(?!,| and\b| then\b)/iu),
);

/** "it": the spell whose casting triggered the ability (Quandrix Unlimited group E); the lowering refuses it anywhere the binding pass did not make it that spell. */
const IT_SPELL = node<RegExpExecArray, IrNoun>(
  'effect.copy-spell',
  pattern(new RegExp(`it${BOUNDARY}`, 'iu')),
  (m) => ({
    kind: 'noun',
    det: 'anaphor',
    filter: { raw: m[0] },
    upTo: false,
    plural: false,
    other: false,
  }),
);

/** " if it targets a permanent or player": the copy is made only for a spell with such a target (CR 115.1). Only after "that spell". */
const IF_TARGETS = quiet(pattern(/ if it targets a permanent or player(?![\p{L}\p{N}])/iu));

/** ". If you don't copy a spell this way, draw a card": what happens when the condition did not hold (Shiko and Narset, Unified). Only after the condition. */
const ELSE_DRAW = quiet(
  pattern(/\. if you don['’]t copy a spell this way, draw a card(?![\p{L}\p{N}])/iu),
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
    // Quandrix Unlimited group E (Owlin Spiralmancer): "it" is the spell of the cast trigger.
    'copy it',
    'copy it. you may choose new targets for the copy',
    'copy it and you may choose new targets for the copy',
    'copy that spell if it targets a permanent or player, and you may choose new targets for the copy',
    "copy that spell if it targets a permanent or player, and you may choose new targets for the copy. if you don't copy a spell this way, draw a card",
    'copy that spell if it targets a permanent or player. if you don’t copy a spell this way, draw a card',
    'copy that spell and you may choose new targets for the copy',
    'copy target instant or sorcery spell and you may choose new targets for the copy',
    "copy target instant or sorcery spell, then return it to its owner's hand. you may choose new targets for the copy",
    'copy target instant or sorcery spell, then return it to its owner’s hand',
  ],
  rejects: [
    "copy that spell, then return it to its owner's hand",
    'copy target instant or sorcery spell, then return it to your hand',
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
    'copy it for each creature you control',
    'copy items',
    'copy itself',
    'copy it and you may choose new targets for the copy. you may choose new targets for the copy',
    'copy it and you may choose new targets for the copies',
    'copy it and you may choose new targets for the copy and draw a card',
    'copy this spell',
    'copy that spell if it targets a creature',
    'copy that spell if it targets a permanent or player and draw a card',
    "copy that spell. if you don't copy a spell this way, draw a card",
    "copy that spell if it targets a permanent or player. if you don't copy a spell this way, draw two cards",
    'copy target instant or sorcery spell if it targets a permanent or player',
    "copy that spell if it targets a permanent or player. if you don't copy a spell this way, draw a card and gain 1 life",
    'copy',
  ],
  parse: (ctx, pos) =>
    map(
      satisfy(
        spanned(
          sequence(
            literal('copy '),
            (c, p) => {
              const target = TARGET_SPELL(c, p);
              if (target.ok) return target;
              const that = THAT_SPELL(c, p);
              return that.ok ? that : IT_SPELL(c, p);
            },
            optional(THEN_RETURN, null),
            optional(IF_TARGETS, null),
            optional(AND_NEW_TARGETS, null),
            CLAUSE_END,
            optional(NEW_TARGETS, null),
            optional(ELSE_DRAW, null),
          ),
        ),
        ({ value }) => {
          const [, spell, returnIt, ifTargets, andNew, , nextNew, elseDraw] = value;
          // The condition is about the spell of the trigger, the "otherwise" sentence needs the condition, and the permission to choose new targets is given once.
          if (ifTargets !== null && (spell.det !== 'anaphor' || returnIt !== null)) return false;
          if (returnIt !== null && spell.det !== 'target') return false;
          if (elseDraw !== null && ifTargets === null) return false;
          return andNew === null || nextNew === null;
        },
      ),
      ({ value, span }): Clauses => {
        const [, spell, returnIt, ifTargets, andNew, , nextNew, elseDraw] = value;
        const newTargets = andNew ?? nextNew;
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
              ...(returnIt === null
                ? {}
                : { returnIt: { kind: 'flag', value: true, span, rule: 'effect.copy-spell' } }),
              ...(ifTargets === null
                ? {}
                : { ifTargets: { kind: 'flag', value: true, span, rule: 'effect.copy-spell' } }),
              ...(elseDraw === null
                ? {}
                : { elseDraw: { kind: 'flag', value: true, span, rule: 'effect.copy-spell' } }),
            },
            span,
          ),
        ];
      },
    )(ctx, pos),
});
