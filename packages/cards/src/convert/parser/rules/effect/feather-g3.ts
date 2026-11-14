/**
 * Effect rules of group 3 of the Feather deck (issue 27, D-438, D-439): the spell of a cast trigger copied for each other creature it could target, and exiled instead of put into
 * the graveyard as it resolves, with its return to the hand. Each reads two sentences as one (`segment.ts` joins them).
 */
import { fail, literal, optional, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { flag } from './dragons';
import { type Clauses, makeClause } from './operands';

/** What may follow the clause on its sentence: a join says a second instruction, which is not read. */
const CLAUSE_END = pattern(/(?=\.|$)/u);

/** "that spell" or "that card": the spell whose casting caused the trigger, bound by the binding pass. */
function spellNoun(
  rule: string,
  word: { readonly span: { start: number; end: number } },
  text: string,
): IrNoun {
  return {
    kind: 'noun',
    det: 'anaphor',
    filter: { raw: text.slice(word.span.start, word.span.end) },
    upTo: false,
    plural: false,
    other: false,
    span: word.span,
    rule,
  };
}

/**
 * `effect.copy-spell-each`: "copy that spell for each other creature you control that the spell could target. Each copy targets a different one of those creatures." and "that
 * player copies that spell for each other creature they control that the spell could target. Each copy targets a different one of those creatures." (CR 707.10, 707.10e, 115.3:
 * a copy of the spell for each other creature the spell could target, each copy aimed at one of them, the copy belonging to the player the words say). The engine's `copySpell`
 * with `forEach` (and `copier` for "that player"). Only creatures, only the creatures "you" or "they" control, and only both sentences together.
 * Not read: another kind of permanent, the creatures of an opponent, a count, "may choose new targets", a join with a second instruction.
 */
export const EFFECT_COPY_SPELL_EACH = defineRule<Clauses>({
  id: 'effect.copy-spell-each',
  family: 'effect',
  leading: ['copy', 'that'],
  cites: [
    'CR 707.10 (Copying Objects)',
    'CR 707.10e (Copying Objects)',
    'CR 115.3 (Targets)',
    'CR 113.7a (Abilities)',
  ],
  examples: [
    'copy that spell for each other creature you control that the spell could target. each copy targets a different one of those creatures',
    'that player copies that spell for each other creature they control that the spell could target. each copy targets a different one of those creatures',
  ],
  rejects: [
    'copy that spell for each other creature you control that the spell could target',
    'copy that spell for each other creature you control that the spell could target. you may choose new targets for the copies',
    'copy that spell for each other creature you control that the spell could target. each copy targets a different one of those creatures and draw a card',
    'copy that spell for each other creature you control. each copy targets a different one of those creatures',
    'copy that spell for each creature you control that the spell could target. each copy targets a different one of those creatures',
    'copy that spell for each other creature your opponents control that the spell could target. each copy targets a different one of those creatures',
    'copy that spell for each other artifact you control that the spell could target. each copy targets a different one of those creatures',
    'copy it for each other creature you control that the spell could target. each copy targets a different one of those creatures',
    'copy target spell for each other creature you control that the spell could target. each copy targets a different one of those creatures',
    'copy that spell for each other creature they control that the spell could target. each copy targets a different one of those creatures',
    'that player copies that spell for each other creature you control that the spell could target. each copy targets a different one of those creatures',
    'that player copies that spell for each other creature they control. each copy targets a different one of those creatures',
    'that creature copies that spell for each other creature they control that the spell could target. each copy targets a different one of those creatures',
    'copy that spell for each other creature you control that the spell could target. each copy targets a different one of those creatures, then',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.copy-spell-each';
    // "that player copies ... they control" and "copy ... you control": the pronoun agrees with the one who copies.
    const head = (copier: boolean) =>
      sequence(
        literal(copier ? 'that player copies ' : 'copy '),
        spanned(pattern(new RegExp(`that spell${BOUNDARY}`, 'iu'))),
        literal(
          ` for each other creature ${copier ? 'they' : 'you'} control that the spell could target`,
        ),
        CLAUSE_END,
        pattern(
          /\. each copy targets a different one of those creatures(?![\p{L}\p{N}])(?!,| and\b| then\b)/iu,
        ),
      );
    const theirs = head(true)(ctx, pos);
    const copier = theirs.ok;
    const parsed = theirs.ok ? theirs : head(false)(ctx, pos);
    if (!parsed.ok) return parsed;
    const spellWord = parsed.value[1];
    const end = parsed.pos;
    const span = { start: pos, end };
    const each: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: {
        types: ['creature'],
        controller: copier ? 'triggerPlayer' : 'you',
        raw: 'creature',
      },
      upTo: false,
      plural: true,
      other: true,
      span,
      rule: id,
    };
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'copySpell',
          {
            spell: spellNoun(id, spellWord, ctx.text),
            newTargets: flag(id, false, span),
            each,
            copier: flag(id, copier, span),
          },
          span,
        ),
      ],
      pos: end,
    };
  },
});

/**
 * `effect.exile-on-resolve`: "exile that card instead of putting it into your graveyard as it resolves. If you do, return it to your hand at the beginning of the next end
 * step." (CR 614.1a, 608.2n, 603.7, 603.7c: the spell whose casting caused the trigger is exiled when it resolves instead of going to its owner's graveyard, and a delayed
 * triggered ability returns it to the hand; both sentences are one instruction, because the second is about the first). The engine's `exileOnResolve`.
 * Not read: another place or time of the return, "that spell", a graveyard other than yours, one sentence without the other, a join with a second instruction.
 */
export const EFFECT_EXILE_ON_RESOLVE = defineRule<Clauses>({
  id: 'effect.exile-on-resolve',
  family: 'effect',
  leading: ['exile'],
  cites: [
    'CR 614.1a (Replacement Effects)',
    'CR 608.2n (Resolving Spells and Abilities)',
    'CR 603.7 (Handling Triggered Abilities)',
    'CR 603.7c (Handling Triggered Abilities)',
  ],
  examples: [
    'exile that card instead of putting it into your graveyard as it resolves. if you do, return it to your hand at the beginning of the next end step',
  ],
  rejects: [
    'exile that card instead of putting it into your graveyard as it resolves',
    'exile that card instead of putting it into your graveyard as it resolves. if you do, return it to your hand at the beginning of your next end step',
    'exile that card instead of putting it into your graveyard as it resolves. if you do, return it to your hand at the beginning of the next upkeep',
    'exile that card instead of putting it into your graveyard as it resolves. if you do, return it to the battlefield at the beginning of the next end step',
    'exile that card instead of putting it into your graveyard as it resolves. if you do, return it to your hand',
    'exile that card instead of putting it into your graveyard as it resolves. if you do, return it to your hand at the beginning of the next end step and draw a card',
    "exile that card instead of putting it into its owner's graveyard as it resolves. if you do, return it to your hand at the beginning of the next end step",
    'exile that spell instead of putting it into your graveyard as it resolves. if you do, return it to your hand at the beginning of the next end step',
    'exile that card instead of putting it into a graveyard as it resolves. if you do, return it to your hand at the beginning of the next end step',
    'exile target card instead of putting it into your graveyard as it resolves. if you do, return it to your hand at the beginning of the next end step',
    'exile that card instead of putting it into your graveyard. if you do, return it to your hand at the beginning of the next end step',
    'exile that card instead of putting it into your graveyard as it resolves. return it to your hand at the beginning of the next end step',
    'exile that card instead of putting it into your graveyard as it resolves. if you do, return it to its owner’s hand at the beginning of the next end step',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.exile-on-resolve';
    const r = sequence(
      literal('exile '),
      spanned(pattern(new RegExp(`that card${BOUNDARY}`, 'iu'))),
      literal(' instead of putting it into your graveyard as it resolves'),
      optional(
        pattern(
          /\. if you do, return it to your hand at the beginning of the next end step(?![\p{L}\p{N}])/iu,
        ),
        null,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, cardWord, , back] = r.value;
    // The sentence about the return is part of the instruction: without it the instruction is another one (a plain replacement), which is not read.
    if (back === null) return fail(ctx, pos);
    const stop = CLAUSE_END(ctx, r.pos);
    if (!stop.ok) return stop;
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: [makeClause(id, 'exileOnResolve', { spell: spellNoun(id, cardWord, ctx.text) }, span)],
      pos: r.pos,
    };
  },
});

export const FEATHER_G3_EFFECT_RULES = [EFFECT_COPY_SPELL_EACH, EFFECT_EXILE_ON_RESOLVE].map(
  quietly,
);
