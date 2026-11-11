/**
 * Trigger rules of stage P37 (D-180): the Korvold deck's slice of triggers and small statics. "When you cycle this card" (CR 702.29c), the
 * ability of a card that was discarded to pay a cycling cost, which triggers from the zone the card winds up in.
 */
import { choice, literal, map, pattern, sequence } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import { makeNoun, youNoun } from './subjects';

/**
 * `trigger.cycled`: "you cycle this card", "you cycle ~" (CR 702.29c, 702.29f: "when you discard this card to pay an activation cost of a cycling
 * ability"; a typecycling cost is a cycling cost). The card cycled is the one with the ability: only "this card" is read, not "a card" ("whenever
 * you cycle a card" is another event, and so is "cycle or discard").
 */
export const TRIGGER_CYCLED = defineRule<IrTrigger>({
  id: 'trigger.cycled',
  family: 'trigger',
  leading: ['you'],
  cites: [
    'CR 702.29c (Cycling)',
    'CR 702.29f (Cycling)',
    'CR 603.2 (Handling Triggered Abilities)',
  ],
  examples: ['you cycle this card', 'you cycle ~'],
  rejects: [
    'you cycle a card',
    'you cycle another card',
    'you cycle or discard a card',
    'you cycle this card or',
    'you discard this card',
    'you cycled this card',
    'a player cycles this card',
    'an opponent cycles a card',
    'you cycle',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      youNoun('trigger.cycled'),
      literal(' cycle '),
      spanned(
        choice(
          map(pattern(/this card(?![\p{L}\p{N}])/iu), () => 'this card'),
          map(literal('~'), () => '~'),
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [actor, , card] = r.value;
    const subject = makeNoun('trigger.cycled', card.span, 'self', { raw: card.value });
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'cycled',
        subject,
        actor,
        args: {},
        span: { start: pos, end: r.pos },
        rule: 'trigger.cycled',
      },
      pos: r.pos,
    };
  },
});

/**
 * `trigger.cast-self`: "you cast this spell", "you cast ~" (CR 601.2i, 603.2: "When you cast this spell, ..." is an ability of the spell that
 * works while it is on the stack, which triggers when it is cast; stage P39, D-184). The spell is the one with the ability: only "this spell"
 * is read, not "a spell" or a description of one ("you cast a creature spell" is `trigger.cast`).
 */
export const TRIGGER_CAST_SELF = defineRule<IrTrigger>({
  id: 'trigger.cast-self',
  family: 'trigger',
  leading: ['you'],
  cites: [
    'CR 601.2i (Casting Spells)',
    'CR 603.2 (Handling Triggered Abilities)',
    'CR 112.1 (Spells)',
  ],
  examples: ['you cast this spell', 'you cast ~'],
  rejects: [
    'you cast a spell',
    'you cast a creature spell',
    'you cast another spell',
    'you cast this spell or',
    'you cast this card',
    'you cast it',
    'you casts this spell',
    'you cast this spells',
    'a player casts this spell',
    'an opponent casts ~',
    'you cast',
    'you cast ~ from your hand',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      youNoun('trigger.cast-self'),
      literal(' cast '),
      spanned(
        choice(
          map(pattern(/this spell(?![\p{L}\p{N}])/iu), () => 'this spell'),
          map(literal('~'), () => '~'),
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [actor, , spell] = r.value;
    const subject = makeNoun('trigger.cast-self', spell.span, 'self', { raw: spell.value });
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'castSelf',
        subject,
        actor,
        args: {},
        span: { start: pos, end: r.pos },
        rule: 'trigger.cast-self',
      },
      pos: r.pos,
    };
  },
});

/**
 * `trigger.you-attack`: "you attack" (CR 508.1, 603.2: "Whenever you attack" triggers once when attackers are declared, whatever their number, as
 * long as there is at least one; stage P41, D-188). It is the batch trigger of "you attack with two or more creatures" with one creature
 * enough, so it lowers to the engine's `attackBatch` with `atLeast` 1. The words that say which creatures ("with ...") belong to `trigger.attack-batch`.
 */
export const TRIGGER_YOU_ATTACK = defineRule<IrTrigger>({
  id: 'trigger.you-attack',
  family: 'trigger',
  leading: ['you'],
  cites: [
    'CR 508.1 (Declare Attackers Step)',
    'CR 603.2 (Handling Triggered Abilities)',
    'CR 603.2c (Handling Triggered Abilities)',
  ],
  examples: ['you attack'],
  rejects: [
    'you attack with two or more creatures',
    'you attack with a creature',
    'you attack alone',
    'you attacks',
    'you attacked',
    'another player attacks',
    'an opponent attacks',
    'you attack you',
    'you attack or',
  ],
  parse: (ctx, pos) => {
    // What follows ("with two or more creatures", "alone", "you", "or ...") belongs to another trigger rule: a rule that reads a prefix would hide it.
    const r = sequence(
      youNoun('trigger.you-attack'),
      pattern(/ attack(?![\p{L}\p{N}])(?!\s+(?:with|alone|you|or|and)(?![\p{L}\p{N}]))/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [actor] = r.value;
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'attackBatch',
        actor,
        atLeast: 1,
        args: {},
        span: { start: pos, end: r.pos },
        rule: 'trigger.you-attack',
      },
      pos: r.pos,
    };
  },
});

/**
 * `trigger.ring-tempts`: "the Ring tempts you" (CR 701.54d, stage P45, D-197): "Whenever the Ring tempts you" triggers each time the Ring tempts the
 * controller of the ability, as they have done what CR 701.54a says, even when some or all of it was impossible. Only "you": "the Ring tempts a
 * player" and "an opponent" are other events.
 */
export const TRIGGER_RING_TEMPTS = defineRule<IrTrigger>({
  id: 'trigger.ring-tempts',
  family: 'trigger',
  leading: ['the'],
  cites: ['CR 701.54d (The Ring Tempts You)', 'CR 603.2 (Handling Triggered Abilities)'],
  examples: ['the Ring tempts you', 'The Ring tempts you'],
  rejects: [
    'the Ring tempts an opponent',
    'the Ring tempts a player',
    'the Ring tempts',
    'the Ring tempts you or',
    'the Ring tempted you',
    'the Ring tempts yourself',
    'a Ring tempts you',
    'Ring tempts you',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/the Ring tempts you(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'ringTempted',
        args: {},
        span: { start: pos, end: r.pos },
        rule: 'trigger.ring-tempts',
      },
      pos: r.pos,
    };
  },
});

export const KORVOLD_TRIGGER_RULES = [
  TRIGGER_CYCLED,
  TRIGGER_CAST_SELF,
  TRIGGER_YOU_ATTACK,
  TRIGGER_RING_TEMPTS,
];
