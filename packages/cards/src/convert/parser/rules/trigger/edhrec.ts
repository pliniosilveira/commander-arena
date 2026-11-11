/**
 * Trigger rules of the Vraska EDHREC deck (stage P65, D-218): "Whenever one or more creatures attack" and "... artifact creatures you control attack"
 * (CR 508.1, 603.2c), "Whenever one or more tokens you control enter" (CR 603.2c, 603.6a) and "Whenever you cast or copy an instant or sorcery spell"
 * (Magecraft, CR 707.10, 601.2i).
 */
import { fail, literal, map, pattern, sequence } from '../../combinators';
import type { IrFilter, IrNoun, IrTrigger } from '../../ir/types';
import { permanentPhrase, spellPhrase, withoutZone } from '../noun/phrases';
import { defineRule, family, quietly, spanned } from '../registry';
import { makeNoun, youNoun } from './subjects';

/**
 * `trigger.attack-one-or-more`: "one or more creatures attack" (any player declares them) and "one or more artifact creatures you control attack" (CR 508.1,
 * 603.2c: the attackers are declared together and the ability triggers once for the declaration, however many creatures it holds). The engine's `attackBatch` with
 * `atLeast` 1: `who` is "any" for the first form and "you" for the second, whose kind of creature is the filter. Not read: a number, a controller other than
 * "you", a choice of types, "attacks", "attack you", another verb.
 */
export const TRIGGER_ATTACK_ONE_OR_MORE = defineRule<IrTrigger>({
  id: 'trigger.attack-one-or-more',
  family: 'trigger',
  leading: ['one'],
  cites: [
    'CR 508.1 (Declare Attackers Step)',
    'CR 603.2 (Handling Triggered Abilities)',
    'CR 603.2c (Handling Triggered Abilities)',
  ],
  examples: [
    'one or more creatures attack',
    'one or more artifact creatures you control attack',
    'one or more Angels you control attack',
  ],
  rejects: [
    'one or more creatures attack you',
    'one or more creatures attacks',
    'one or more artifact creatures attack',
    'one or more artifact creatures your opponents control attack',
    'one or more creatures you control or planeswalkers attack',
    'two or more creatures attack',
    'one creature attacks',
    'one or more creatures you control attacked',
    'one or more',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.attack-one-or-more';
    const lead = literal('one or more ')(ctx, pos);
    if (!lead.ok) return lead;
    const phrase = spanned(map(permanentPhrase(true, 'all'), withoutZone))(ctx, lead.pos);
    if (!phrase.ok) return phrase;
    const verb = pattern(/ attack(?![\p{L}\p{N}])(?!\s+(?:you|or|and)(?![\p{L}\p{N}]))/iu)(
      ctx,
      phrase.pos,
    );
    if (!verb.ok) return verb;
    const filter: IrFilter = phrase.value.value;
    if (
      filter.anyOf !== undefined ||
      (filter.controller !== undefined && filter.controller !== 'you')
    ) {
      return fail(ctx, pos);
    }
    const yours = filter.controller === 'you';
    const { controller: _controller, ...rest } = filter;
    void _controller;
    const plain = rest.types?.length === 1 && rest.types[0] === 'creature';
    const bare = plain && Object.keys(rest).every((k) => ['types', 'raw'].includes(k));
    // "One or more artifact creatures attack" with nobody named would be any player's: the engine's batch is the attackers of one player at a time, so only
    // "creatures" alone is said of every player; a kind of creature is said of "you control".
    if (!yours && !bare) return fail(ctx, pos);
    const actor: IrNoun = yours
      ? makeNoun(id, { start: pos, end: pos }, 'you', { raw: '' })
      : makeNoun(id, { start: pos, end: pos }, 'eachPlayer', { raw: '' });
    const subject = { ...makeNoun(id, phrase.value.span, 'a', rest), plural: true };
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'attackBatch',
        actor,
        atLeast: 1,
        ...(bare ? {} : { subject }),
        args: {},
        span: { start: pos, end: verb.pos },
        rule: id,
      },
      pos: verb.pos,
    };
  },
});

/**
 * `trigger.enters-one-or-more`: "one or more tokens you control enter", "one or more creature tokens you control enter" (CR 603.2c, 603.6a: tokens made
 * together enter together, and the ability triggers once for them). The engine's `entersBatch`. Not read: a number, "a token", "enters", a controller other
 * than "you", a kind that is not a group of tokens.
 */
export const TRIGGER_ENTERS_ONE_OR_MORE = defineRule<IrTrigger>({
  id: 'trigger.enters-one-or-more',
  family: 'trigger',
  leading: ['one'],
  cites: [
    'CR 603.2c (Handling Triggered Abilities)',
    'CR 603.6a (Handling Triggered Abilities)',
    'CR 111.1 (Tokens)',
  ],
  examples: [
    'one or more tokens you control enter',
    'one or more creature tokens you control enter',
  ],
  rejects: [
    'one or more tokens you control enters',
    'one or more tokens enter',
    'one or more tokens your opponents control enter',
    'one or more creatures you control enter',
    'one or more artifact tokens you control enter',
    'a token you control enters',
    'one or more tokens you control enter tapped',
    'one or more tokens you control enter or',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.enters-one-or-more';
    const r = sequence(
      literal('one or more '),
      family<IrNoun>('noun', { only: ['noun.token-permanents'] }),
      pattern(/ enter(?![\p{L}\p{N}])(?!\s+(?:tapped|untapped|or|and)(?![\p{L}\p{N}]))/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, noun] = r.value;
    const { zone: _zone, ...filter } = noun.filter;
    void _zone;
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'entersBatch',
        subject: { ...noun, det: 'a', filter },
        args: {},
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

/**
 * `trigger.cast-or-copy`: "you cast or copy an instant or sorcery spell" (Magecraft, CR 707.10, 601.2i: a copy of a spell put onto the stack is not cast, so
 * the words name both). The engine's `castSpell` with `orCopy`. Not read: another player, "cast or copy" of anything but the spell phrase `trigger.cast`
 * reads, "or" with a third event.
 */
export const TRIGGER_CAST_OR_COPY = defineRule<IrTrigger>({
  id: 'trigger.cast-or-copy',
  family: 'trigger',
  leading: ['you'],
  cites: [
    'CR 707.10 (Copying Objects)',
    'CR 601.2i (Casting Spells)',
    'CR 603.2 (Handling Triggered Abilities)',
  ],
  examples: [
    'you cast or copy an instant or sorcery spell',
    'you cast or copy a noncreature spell',
  ],
  rejects: [
    'you cast an instant or sorcery spell',
    'you copy an instant or sorcery spell',
    'an opponent casts or copies an instant or sorcery spell',
    'you cast or copy spells',
    'you cast or copy ~',
    'you cast or copy an instant or sorcery spell or',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.cast-or-copy';
    const r = sequence(
      youNoun(id),
      literal(' cast or copy '),
      spanned(sequence(pattern(/an? /i), map(spellPhrase(), withoutZone))),
    )(ctx, pos);
    if (!r.ok) return r;
    const [actor, , spell] = r.value;
    const subject = makeNoun(id, spell.span, 'a', spell.value[1]);
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'castOrCopy',
        subject,
        actor,
        args: {},
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

export const EDHREC_TRIGGER_RULES = [
  TRIGGER_ATTACK_ONE_OR_MORE,
  TRIGGER_ENTERS_ONE_OR_MORE,
  TRIGGER_CAST_OR_COPY,
].map(quietly);
