/**
 * Trigger rules of stage P33 (D-149, D-150): what the engine's Angels slice reads. "Whenever you gain life [for the first time each
 * turn]" (CR 119.9), "Whenever you put one or more +1/+1 counters on ~" (CR 122.6) and "Whenever you attack with two or more creatures"
 * (CR 508.1). "Whenever a commander you control enters or attacks" is the existing `trigger.or` with the commander subjects of
 * `subjects.ts`.
 */
import {
  choice,
  fail,
  literal,
  map,
  optional,
  pattern,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrFilter, IrNoun, IrTrigger } from '../../ir/types';
import { quantity } from '../amount/index';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { makeNoun, triggerSubject, youNoun } from './subjects';

/**
 * `trigger.life-gained`: "you gain life", "you gain life for the first time each turn", "an opponent gains life", "a player gains life"
 * (CR 119.9: a life gain event, once for each time a player gains life; the amount is what was gained after any replacement; a gain of 0 is
 * no event). "For the first time each turn" limits it to the first gain of that player in the turn (CR 603.2). The player is relative to the
 * controller of the ability; the player who gained the life is "that player" in the body.
 */
export const TRIGGER_LIFE_GAINED = defineRule<IrTrigger>({
  id: 'trigger.life-gained',
  family: 'trigger',
  leading: ['you', 'an', 'a'],
  cites: ['CR 119.9 (Life)', 'CR 603.2 (Handling Triggered Abilities)'],
  examples: [
    'you gain life',
    'you gain life for the first time each turn',
    'an opponent gains life',
    'a player gains life',
    'an opponent gains life for the first time each turn',
  ],
  rejects: [
    'you gain',
    'you gain 3 life',
    'you gain life for the first time',
    'you gain life for the second time each turn',
    'you gain life this turn',
    'you gains life',
    'an opponent gain life',
    'each opponent gains life',
    'a creature gains life',
    'you lose life',
    'you gain life or lose life',
    'you gain life for the first time each turn or',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.life-gained';
    const who = spanned(
      choice(
        map(pattern(/you gain life(?![\p{L}\p{N}])/iu), () => 'you' as const),
        map(pattern(/an opponent gains life(?![\p{L}\p{N}])/iu), () => 'opponent' as const),
        map(pattern(/a player gains life(?![\p{L}\p{N}])/iu), () => 'any' as const),
      ),
    )(ctx, pos);
    if (!who.ok) return who;
    const first = optional(literal(' for the first time each turn'), null)(ctx, who.pos);
    if (!first.ok) return first;
    const kind = who.value.value;
    const actor: IrNoun =
      kind === 'you'
        ? makeNoun(id, who.value.span, 'you', { raw: 'you' })
        : makeNoun(id, who.value.span, kind === 'opponent' ? 'eachOpponent' : 'eachPlayer', {
            raw: kind === 'opponent' ? 'an opponent' : 'a player',
          });
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'lifeGained',
        actor,
        ...(first.value === null ? {} : { firstEachTurn: true as const }),
        args: {},
        span: { start: pos, end: first.pos },
        rule: id,
      },
      pos: first.pos,
    };
  },
});

/** The kind of counter a trigger names: "+1/+1", "page", or none ("one or more counters"). */
const COUNTER_KIND = choice(
  map(pattern(/([+-]\d+\/[+-]\d+|[a-z]+) counters(?![\p{L}\p{N}])/iu), (m) =>
    (m[1] ?? '').toLowerCase(),
  ),
  map(pattern(/counters(?![\p{L}\p{N}])/iu), () => undefined),
);

/**
 * `trigger.counters-added`: "you put one or more +1/+1 counters on ~", "you put one or more counters on a creature you control", "one or
 * more +1/+1 counters are put on ~" (CR 122.6, 122.6a: counters are put on an object by an effect, a cost, or as it enters; the ability
 * triggers once for one instance of putting, however many counters). "You put" is counters put by the controller of the ability, "are put"
 * by any player. Only "one or more", the wording of an event of putting.
 */
export const TRIGGER_COUNTERS_ADDED = defineRule<IrTrigger>({
  id: 'trigger.counters-added',
  family: 'trigger',
  leading: ['you', 'one'],
  cites: ['CR 122.6 (Counters)', 'CR 122.6a (Counters)', 'CR 603.2 (Handling Triggered Abilities)'],
  examples: [
    'you put one or more +1/+1 counters on ~',
    'you put one or more counters on ~',
    'you put one or more page counters on ~',
    'you put one or more +1/+1 counters on a creature you control',
    'you put one or more +1/+1 counters on another creature',
    'one or more +1/+1 counters are put on ~',
    'one or more counters are put on a creature you control',
  ],
  rejects: [
    'you put a +1/+1 counter on ~',
    'you put one or more +1/+1 counters',
    'you put one or more +1/+1 counters on',
    'you put two or more +1/+1 counters on ~',
    'you put one or more +1/+1 counter on ~',
    'you put one or more +1/+1 counters on it',
    'you put one or more +1/+1 counters on ~ or ~',
    'you put one or more +1/+1 counters on target creature',
    'one or more +1/+1 counters are put on',
    'one or more +1/+1 counters is put on ~',
    'one or more +1/+1 counters are removed from ~',
    'one or more players put +1/+1 counters on ~',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.counters-added';
    const byYou = sequence(
      literal('you put one or more '),
      COUNTER_KIND,
      literal(' on '),
    )(ctx, pos);
    const read = byYou.ok
      ? { by: 'you' as const, counter: byYou.value[1], pos: byYou.pos }
      : (() => {
          const passive = sequence(
            literal('one or more '),
            COUNTER_KIND,
            literal(' are put on '),
          )(ctx, pos);
          return passive.ok
            ? { by: 'any' as const, counter: passive.value[1], pos: passive.pos }
            : null;
        })();
    if (read === null) return fail(ctx, pos);
    const subject = triggerSubject(id)(ctx, read.pos);
    if (!subject.ok) return subject;
    // The subject says what the counters are put on, not who puts them: "you" and a count are other wordings.
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'countersAdded',
        subject: subject.value,
        by: read.by,
        ...(read.counter === undefined ? {} : { counter: read.counter }),
        args: {},
        span: { start: pos, end: subject.pos },
        rule: id,
      },
      pos: subject.pos,
    };
  },
});

/** What the creatures declared must be: "creatures", or a group named by a type ("Angels", "artifact creatures"). */
function attackersPhrase(rule: string) {
  return (ctx: Parameters<ReturnType<typeof permanentPhrase>>[0], pos: number) => {
    const r = spanned(map(permanentPhrase(true, 'all'), withoutZone))(ctx, pos);
    if (!r.ok) return r;
    const filter: IrFilter = r.value.value;
    // The attackers are the attacking player's own: a controller, a choice of types and "other" are other statements.
    if (filter.controller !== undefined || filter.anyOf !== undefined) return fail(ctx, pos);
    const noun = makeNoun(rule, r.value.span, 'a', filter);
    return { ok: true as const, value: { ...noun, plural: true }, pos: r.pos };
  };
}

/**
 * `trigger.attack-batch`: "you attack with two or more creatures", "you attack with three or more Angels", "another player attacks with
 * two or more creatures", "an opponent attacks with two or more creatures" (CR 508.1: the attackers are declared together, once; CR
 * 603.2: the ability triggers once for the declaration, however many creatures it holds). At least two, the creatures declared that match
 * (all of them for "creatures"); "another player" is a player who is not the controller of the ability, who is "they" in the body.
 */
export const TRIGGER_ATTACK_BATCH = defineRule<IrTrigger>({
  id: 'trigger.attack-batch',
  family: 'trigger',
  leading: ['you', 'another', 'an'],
  cites: [
    'CR 508.1 (Declare Attackers Step)',
    'CR 603.2 (Handling Triggered Abilities)',
    'CR 603.2c (Handling Triggered Abilities)',
  ],
  examples: [
    'you attack with two or more creatures',
    'you attack with three or more creatures',
    'you attack with three or more Angels',
    'another player attacks with two or more creatures',
    'an opponent attacks with two or more creatures',
    'you attack with two or more artifact creatures',
  ],
  rejects: [
    'you attack with a creature',
    'you attack with one or more creatures',
    'you attack with two creatures',
    'you attack with two or more',
    'you attack with two or fewer creatures',
    'you attack with two or more creatures you control',
    'you attack with two or more creature',
    'you attack with two or more creatures and',
    'you attack with two or more creatures or planeswalkers',
    'a player attacks with two or more creatures',
    'each opponent attacks with two or more creatures',
    'another player attacks you with two or more creatures',
    'you attacks with two or more creatures',
    'another player attack with two or more creatures',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.attack-batch';
    const who = spanned(
      choice(
        map(pattern(/you attack with /iu), () => 'you' as const),
        map(pattern(/(?:another player|an opponent) attacks with /iu), () => 'opponent' as const),
      ),
    )(ctx, pos);
    if (!who.ok) return who;
    const count = sequence(spanned(satisfy(quantity, (n) => n >= 2)), literal(' or more '))(
      ctx,
      who.pos,
    );
    if (!count.ok) return count;
    const phrase = attackersPhrase(id)(ctx, count.pos);
    if (!phrase.ok) return phrase;
    const kind = who.value.value;
    const actor =
      kind === 'you'
        ? youNoun(id)(ctx, pos)
        : {
            ok: true as const,
            value: makeNoun(id, who.value.span, 'eachOpponent', { raw: 'another player' }),
            pos,
          };
    if (!actor.ok) return actor;
    // All the creatures declared count when the text says "creatures" alone.
    const plain =
      phrase.value.filter.types?.length === 1 && phrase.value.filter.types[0] === 'creature';
    const bare =
      plain && Object.keys(phrase.value.filter).every((k) => ['types', 'raw'].includes(k));
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'attackBatch',
        actor: actor.value,
        atLeast: count.value[0].value,
        ...(bare ? {} : { subject: phrase.value }),
        args: {},
        span: { start: pos, end: phrase.pos },
        rule: id,
      },
      pos: phrase.pos,
    };
  },
});

export const ANGEL_TRIGGER_RULES = [
  TRIGGER_LIFE_GAINED,
  TRIGGER_COUNTERS_ADDED,
  TRIGGER_ATTACK_BATCH,
].map(quietly);
