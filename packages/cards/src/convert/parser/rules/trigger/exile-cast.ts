/**
 * Trigger rules of the Exit from Exile deck: "you cast a spell from exile" (CR 601.2a, 601.2i, 406.1).
 */
import { choice, fail, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { KEYWORD_WORDS } from '../keyword/list';
import { defineRule, family, spanned } from '../registry';
import { makeNoun } from './subjects';

const NOT_IN_WORD = '(?![\\p{L}\\p{N}])';

/**
 * `trigger.cast-from-exile`: "you cast a spell from exile" (CR 601.2a: the spell is cast from where the card was; CR 601.2i: the ability triggers as the spell becomes cast). The spell
 * `trigger.cast` reads, and "from exile" (the engine's `castFromExile`). Not read: another zone, another caster than you, "from exile" with nothing before it, a second event after "or".
 */
export const TRIGGER_CAST_FROM_EXILE = defineRule<IrTrigger>({
  id: 'trigger.cast-from-exile',
  family: 'trigger',
  leading: ['you'],
  cites: [
    'CR 601.2a (Casting Spells)',
    'CR 601.2i (Casting Spells)',
    'CR 603.2 (Handling Triggered Abilities)',
  ],
  examples: [
    'you cast a spell from exile',
    'you cast a creature spell from exile',
    'you cast an instant or sorcery spell from exile',
  ],
  rejects: [
    'you cast a spell from your hand',
    'you cast a spell from a graveyard',
    'you cast a spell',
    'you cast a spell from exile or',
    'you cast a spell from exile or a land you control enters from exile',
    'an opponent casts a spell from exile',
    'a player casts a spell from exile',
    'you cast from exile',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      satisfy(
        family<IrTrigger>('trigger', { only: ['trigger.cast'] }),
        (t) => t.actor?.det === 'you',
      ),
      spanned(pattern(new RegExp(` from exile${NOT_IN_WORD}(?! or\\b)`, 'iu'))),
    )(ctx, pos);
    if (!r.ok) return r;
    const [cast, tail] = r.value;
    const subject = cast.subject;
    if (subject === undefined) return fail(ctx, pos);
    return {
      ok: true,
      value: {
        ...cast,
        span: { start: pos, end: tail.span.end },
        rule: 'trigger.cast-from-exile',
        subject: { ...subject, filter: { ...subject.filter, castFromExile: true } },
      },
      pos: r.pos,
    };
  },
});

/**
 * `trigger.cast-or-land-enters-from-exile`: "you cast a spell from exile or a land you control enters from exile" (Faldorn; CR 601.2a, 603.6a, 603.2c, 406.1): one ability that two events
 * cause, as each event is an engine ability of its own: a spell the controller casts from exile, and a land the controller controls that came onto the battlefield from exile (the zone it
 * moved from; a token is not that). Not read: another caster, another kind than "land", another zone, a third event.
 */
export const TRIGGER_CAST_OR_LAND_ENTERS_FROM_EXILE = defineRule<IrTrigger>({
  id: 'trigger.cast-or-land-enters-from-exile',
  family: 'trigger',
  leading: ['you'],
  cites: [
    'CR 601.2a (Casting Spells)',
    'CR 603.2c (Handling Triggered Abilities)',
    'CR 603.6a (Handling Triggered Abilities)',
    'CR 400.7 (General)',
  ],
  examples: ['you cast a spell from exile or a land you control enters from exile'],
  rejects: [
    'you cast a spell from exile',
    'a land you control enters from exile',
    'you cast a spell from exile or a creature you control enters from exile',
    'you cast a spell from exile or a land enters from exile',
    'you cast a spell from exile or a land you control enters from a graveyard',
    'you cast a spell from exile or a land you control enters from exile or',
    'an opponent casts a spell from exile or a land you control enters from exile',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      satisfy(
        family<IrTrigger>('trigger', { only: ['trigger.cast'] }),
        (t) => t.actor?.det === 'you',
      ),
      spanned(
        pattern(
          new RegExp(
            ` from exile or a land you control enters from exile${NOT_IN_WORD}(?! or\\b)`,
            'iu',
          ),
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [cast, tail] = r.value;
    const subject = cast.subject;
    if (subject === undefined) return fail(ctx, pos);
    const id = 'trigger.cast-or-land-enters-from-exile';
    const span = { start: pos, end: tail.span.end };
    const land = makeNoun(id, span, 'a', {
      types: ['land'],
      controller: 'you',
      raw: 'a land you control',
    });
    const entersFromExile: IrTrigger = {
      kind: 'trigger',
      event: 'enters',
      args: {},
      span,
      rule: id,
      subject: land,
      fromExile: true,
    };
    return {
      ok: true,
      value: {
        ...cast,
        span,
        rule: id,
        subject: { ...subject, filter: { ...subject.filter, castFromExile: true } },
        alternatives: [entersFromExile],
      },
      pos: r.pos,
    };
  },
});

/**
 * `trigger.cast-with-keyword`: "you cast a spell with cascade" (Aurora Phoenix; CR 601.2i, 702.85a (Cascade), 113.12: the spell has the keyword ability as it is cast). The spell
 * `trigger.cast` reads, and "with" and one keyword without parameters (the engine's `keywords` of the filter). Not read: another caster, two keywords, "without", a keyword with a cost
 * or number, "with" and a mana value (`trigger.cast`), a second condition after it.
 */
export const TRIGGER_CAST_WITH_KEYWORD = defineRule<IrTrigger>({
  id: 'trigger.cast-with-keyword',
  family: 'trigger',
  leading: ['you'],
  cites: [
    'CR 601.2i (Casting Spells)',
    'CR 603.2 (Handling Triggered Abilities)',
    'CR 702.85a (Cascade)',
  ],
  examples: ['you cast a spell with cascade', 'you cast a creature spell with flying'],
  rejects: [
    'a player casts a spell with cascade',
    'you cast a spell with cascade and flying',
    'you cast a spell without cascade',
    'you cast a spell with',
    'you cast a spell with cascade or',
    'you cast a spell with kicker',
    'you cast with cascade',
    'you cast a spell with mana value 3 or less',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      satisfy(
        family<IrTrigger>('trigger', { only: ['trigger.cast'] }),
        (t) => t.actor?.det === 'you',
      ),
      spanned(pattern(/ with /iu)),
      // Cascade is a keyword the engine runs but does not grant (`GRANTABLE_KEYWORDS`), so it is read here as a word of the spell.
      choice(
        KEYWORD_WORDS,
        map(pattern(/cascade(?![\p{L}\p{N}])(?! and\b| or\b)/iu), (m) => [m[0].toLowerCase()]),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [cast, , words] = r.value;
    const subject = cast.subject;
    const [keyword, ...more] = words;
    if (subject === undefined || keyword === undefined || more.length > 0) return fail(ctx, pos);
    return {
      ok: true,
      value: {
        ...cast,
        span: { start: pos, end: r.pos },
        rule: 'trigger.cast-with-keyword',
        subject: { ...subject, filter: { ...subject.filter, keywords: [keyword] } },
      },
      pos: r.pos,
    };
  },
});

/**
 * `trigger.cast-not-from-hand`: "an opponent casts a spell from anywhere other than their hand" (Ghostly Pilferer; CR 601.2a, 601.2i, 603.2: the spell is cast from where the card was, and the
 * ability triggers as it becomes cast). The spell `trigger.cast` reads, and the zone words (the engine's `notCastFromHand`). The possessive agrees with the caster: "your" for "you", "their"
 * for an opponent or a player. Not read: another zone word, a possessive that does not agree, "anywhere" with nothing before it, a second event after "or".
 */
export const TRIGGER_CAST_NOT_FROM_HAND = defineRule<IrTrigger>({
  id: 'trigger.cast-not-from-hand',
  family: 'trigger',
  leading: ['you', 'a', 'an', 'another'],
  cites: [
    'CR 601.2a (Casting Spells)',
    'CR 601.2i (Casting Spells)',
    'CR 603.2 (Handling Triggered Abilities)',
  ],
  examples: [
    'an opponent casts a spell from anywhere other than their hand',
    'an opponent casts a creature spell from anywhere other than their hand',
    'you cast a spell from anywhere other than your hand',
    'a player casts a spell from anywhere other than their hand',
    'another player casts a spell from anywhere other than their hand',
  ],
  rejects: [
    'an opponent casts a spell from anywhere other than your hand',
    'you cast a spell from anywhere other than their hand',
    'an opponent casts a spell from anywhere other than a hand',
    'an opponent casts a spell from anywhere other than their library',
    'an opponent casts a spell from anywhere other than their hand or',
    'an opponent casts a spell from their hand',
    'an opponent casts from anywhere other than their hand',
    'an opponent casts a spell',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      family<IrTrigger>('trigger', { only: ['trigger.cast'] }),
      spanned(
        pattern(
          new RegExp(` from anywhere other than (your|their) hand${NOT_IN_WORD}(?! or\\b)`, 'iu'),
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [cast, tail] = r.value;
    const subject = cast.subject;
    if (subject === undefined || cast.actor === undefined) return fail(ctx, pos);
    const yours = cast.actor.det === 'you';
    if (tail.value[1]?.toLowerCase() !== (yours ? 'your' : 'their')) return fail(ctx, pos);
    return {
      ok: true,
      value: {
        ...cast,
        span: { start: pos, end: tail.span.end },
        rule: 'trigger.cast-not-from-hand',
        subject: { ...subject, filter: { ...subject.filter, notCastFromHand: true } },
      },
      pos: r.pos,
    };
  },
});

export const EXILE_CAST_TRIGGER_RULES = [
  TRIGGER_CAST_NOT_FROM_HAND,
  TRIGGER_CAST_WITH_KEYWORD,
  TRIGGER_CAST_FROM_EXILE,
  TRIGGER_CAST_OR_LAND_ENTERS_FROM_EXILE,
];
