/**
 * Trigger rules of the Jeskai free-cast cards (deck support issue 100): "you cast your first instant or sorcery spell each turn" (CR 601.2i, 603.2).
 */
import { fail, literal, map, pattern, sequence } from '../../combinators';
import type { IrFilter, IrTrigger } from '../../ir/types';
import { spellPhrase, withoutZone } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { makeNoun } from './subjects';

/**
 * `trigger.cast-first-of-kind`: "you cast your first instant or sorcery spell each turn" (CR 601.2i, 603.2: the ability triggers as the controller casts the first spell of
 * those card types this turn, whatever else they cast before it). The engine's `castSpell` with `firstOfKind`. Not read: a plain "spell" (`trigger.cast-nth`), another ordinal, another
 * player, a subtype or another kind of word, a missing "each turn", digits.
 */
export const TRIGGER_CAST_FIRST_OF_KIND = defineRule<IrTrigger>({
  id: 'trigger.cast-first-of-kind',
  family: 'trigger',
  leading: ['you'],
  cites: [
    'CR 601.2i (Casting Spells)',
    'CR 603.2 (Handling Triggered Abilities)',
    'CR 112.1 (Spells)',
  ],
  examples: [
    'you cast your first instant or sorcery spell each turn',
    'you cast your first creature spell each turn',
    'you cast your first noncreature spell each turn',
    'you cast your first outlaw spell each turn',
  ],
  rejects: [
    'you cast your first spell each turn',
    'you cast your second instant or sorcery spell each turn',
    'an opponent casts their first instant or sorcery spell each turn',
    'you cast your first instant or sorcery spell',
    'you cast your 1st instant or sorcery spell each turn',
    'you cast your first Dragon spell each turn',
    'you cast your first instant or sorcery spell each turn and',
    'you cast your first instant or sorcery spell during each opponent’s turn',
    'you cast your first non-outlaw spell each turn',
    'you cast your first non-outlaw creature spell each turn',
    'you cast a first instant or sorcery spell each turn',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.cast-first-of-kind';
    const r = sequence(
      spanned(literal('you cast your first ')),
      spanned(map(spellPhrase(), withoutZone)),
      pattern(/ each turn(?![\p{L}\p{N}])(?!\s+and)/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [lead, spell] = r.value;
    const filter: IrFilter = spell.value;
    // A kind of spell by card type only ("instant or sorcery", "creature", "noncreature"): a plain spell is `trigger.cast-nth`'s, a subtype or another condition is not read.
    const kinded =
      (filter.types !== undefined && filter.types.length > 0) ||
      (filter.anyOf !== undefined &&
        filter.anyOf.length > 0 &&
        filter.anyOf.every((m) => m.types !== undefined && m.subtypes === undefined));
    const bare = Object.keys(filter).every(
      (k) =>
        ['raw', 'zone', 'stackKind', 'types', 'anyOf'].includes(k) ||
        k === 'notTypes' ||
        k === 'outlaw',
    );
    // Discreet Retreat (CR 700.12): "your first outlaw spell each turn", the outlaws among the spells.
    const outlawKind = filter.outlaw === true && filter.types === undefined;
    if (!kinded && filter.notTypes === undefined && !outlawKind) return fail(ctx, pos);
    // "Non-outlaw" is not read (the engine's first-of-kind counts the outlaws or the card types, not the others).
    if (!bare || filter.outlaw === false) return fail(ctx, pos);
    const actor = makeNoun(id, { start: lead.span.start, end: lead.span.start + 3 }, 'you', {
      raw: 'you',
    });
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'cast',
        subject: makeNoun(id, spell.span, 'a', filter),
        actor,
        firstOfKind: true,
        args: {},
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

export const JESKAI_CASTFREE_TRIGGER_RULES = [TRIGGER_CAST_FIRST_OF_KIND].map(quietly);
