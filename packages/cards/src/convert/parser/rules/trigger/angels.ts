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
 * `trigger.investigates`: "you investigate", "you investigate for the first time each turn", "an opponent investigates", "a player investigates" (CR 701.16a: the keyword action, once for each
 * time a player does it; "investigate twice" is two; issue 128, Erdwal Illuminator). "For the first time each turn" limits it to the player's first investigation in the turn (CR 603.2). The player
 * is relative to the controller of the ability. Not read: another ordinal, "investigate" for a creature, "whenever you create a Clue" (another event: tokens made by other means).
 */
export const TRIGGER_INVESTIGATES = defineRule<IrTrigger>({
  id: 'trigger.investigates',
  family: 'trigger',
  leading: ['you', 'an', 'a'],
  cites: ['CR 701.16a (Investigate)', 'CR 603.2 (Handling Triggered Abilities)'],
  examples: [
    'you investigate',
    'you investigate for the first time each turn',
    'an opponent investigates',
    'a player investigates',
  ],
  rejects: [
    'you investigate for the first time',
    'you investigate for the second time each turn',
    'you investigates',
    'an opponent investigate',
    'each opponent investigates',
    'a creature investigates',
    'you investigate this turn',
    'you investigate or',
    'you investigate for the first time each turn or',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.investigates';
    const who = spanned(
      choice(
        map(pattern(/you investigate(?![\p{L}\p{N}])/iu), () => 'you' as const),
        map(pattern(/an opponent investigates(?![\p{L}\p{N}])/iu), () => 'opponent' as const),
        map(pattern(/a player investigates(?![\p{L}\p{N}])/iu), () => 'any' as const),
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
        event: 'investigated',
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

/**
 * `trigger.life-lost`: "you lose life", "you lose life for the first time each turn", "an opponent loses life", "a player loses life" (CR 119.3: every reduction of a life total
 * is a loss of life: damage, a life-loss effect, life paid; CR 603.2: "for the first time each turn" counts the player's losses). The player is relative to the controller of the
 * ability; the player who lost the life is "that player" in the body.
 */
export const TRIGGER_LIFE_LOST = defineRule<IrTrigger>({
  id: 'trigger.life-lost',
  family: 'trigger',
  leading: ['you', 'an', 'a', 'one'],
  cites: [
    'CR 119.3 (Life)',
    'CR 603.2 (Handling Triggered Abilities)',
    'CR 603.2c (Handling Triggered Abilities)',
  ],
  examples: [
    'one or more opponents lose life',
    'you lose life',
    'you lose life for the first time each turn',
    'an opponent loses life',
    'a player loses life',
    'an opponent loses life for the first time each turn',
    'an opponent loses life for the first time during each of their turns',
  ],
  rejects: [
    'one or more opponents lose life for the first time each turn',
    'one or more opponents loses life',
    'one or more players lose life',
    'one or more opponent lose life',
    'you lose',
    'you lose 3 life',
    'you lose life for the first time',
    'you lose life for the second time each turn',
    'you lose life this turn',
    'you loses life',
    'an opponent lose life',
    'each opponent loses life',
    'a creature loses life',
    'you lose life or gain life',
    'you lose life for the first time each turn or',
    'you lose life for the first time during each of their turns',
    'an opponent loses life for the first time during each of your turns',
    'an opponent loses life during each of their turns',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.life-lost';
    // CR 603.2c: "one or more opponents lose life" is one trigger for the losses of one event, whatever the number of players.
    const batch = spanned(pattern(/one or more opponents lose life(?![\p{L}\p{N}])/iu))(ctx, pos);
    if (batch.ok) {
      return {
        ok: true,
        value: {
          kind: 'trigger',
          event: 'lifeLost',
          actor: makeNoun(id, batch.value.span, 'eachOpponent', { raw: 'one or more opponents' }),
          batch: true,
          args: {},
          span: { start: pos, end: batch.pos },
          rule: id,
        },
        pos: batch.pos,
      };
    }
    const who = spanned(
      choice(
        map(pattern(/you lose life(?![\p{L}\p{N}])/iu), () => 'you' as const),
        map(pattern(/an opponent loses life(?![\p{L}\p{N}])/iu), () => 'opponent' as const),
        map(pattern(/a player loses life(?![\p{L}\p{N}])/iu), () => 'any' as const),
      ),
    )(ctx, pos);
    if (!who.ok) return who;
    const kind = who.value.value;
    // CR 603.2: "for the first time during each of their turns" (Valgavoth): the first loss of the player in a turn of their own.
    const theirTurn =
      kind === 'you'
        ? { ok: false as const }
        : literal(' for the first time during each of their turns')(ctx, who.pos);
    const first = theirTurn.ok
      ? { ok: true as const, value: 'x', pos: theirTurn.pos }
      : optional(literal(' for the first time each turn'), null)(ctx, who.pos);
    if (!first.ok) return first;
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
        event: 'lifeLost',
        actor,
        ...(first.value === null ? {} : { firstEachTurn: true as const }),
        ...(theirTurn.ok ? { duringTheirTurn: true as const } : {}),
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

/** "a -1/-1 counter is put on ", "a counter is put on ": one counter, the kind (if named) in group 1. */
const SINGLE_COUNTER_PUT = /an? (?:([+-]\d+\/[+-]\d+|[a-z]+) )?counter is put on /iu;

/**
 * `trigger.counters-added`: "you put one or more +1/+1 counters on ~", "you put one or more counters on a creature you control", "one or
 * more +1/+1 counters are put on ~" (CR 122.6, 122.6a: counters are put on an object by an effect, a cost, or as it enters; the ability
 * triggers once for one instance of putting, however many counters). "You put" is counters put by the controller of the ability, "are put"
 * by any player. Only "one or more", the wording of an event of putting.
 */
export const TRIGGER_COUNTERS_ADDED = defineRule<IrTrigger>({
  id: 'trigger.counters-added',
  family: 'trigger',
  leading: ['you', 'one', 'a'],
  cites: ['CR 122.6 (Counters)', 'CR 122.6a (Counters)', 'CR 603.2 (Handling Triggered Abilities)'],
  examples: [
    'you put one or more +1/+1 counters on ~',
    'you put one or more counters on ~',
    'you put one or more page counters on ~',
    'you put one or more +1/+1 counters on a creature you control',
    'you put one or more +1/+1 counters on another creature',
    'one or more +1/+1 counters are put on ~',
    'one or more counters are put on a creature you control',
    'a -1/-1 counter is put on a creature',
    'a +1/+1 counter is put on ~',
    'a counter is put on a creature you control',
  ],
  rejects: [
    'a -1/-1 counters is put on a creature',
    'a -1/-1 counter is put on',
    'a -1/-1 counter is removed from a creature',
    'a -1/-1 counter is put on it',
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
    // CR 122.6, 603.2 (Flourishing Defenses): "a -1/-1 counter is put on a creature" triggers once for each counter put on.
    const single = read === null ? pattern(SINGLE_COUNTER_PUT)(ctx, pos) : null;
    if (read === null && !single?.ok) return fail(ctx, pos);
    const each = read === null;
    const head =
      read !== null
        ? read
        : single?.ok
          ? { by: 'any' as const, counter: single.value[1]?.toLowerCase(), pos: single.pos }
          : null;
    if (head === null) return fail(ctx, pos);
    const subject = triggerSubject(id)(ctx, head.pos);
    if (!subject.ok) return subject;
    // The subject says what the counters are put on, not who puts them: "you" and a count are other wordings.
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'countersAdded',
        subject: subject.value,
        by: head.by,
        ...(head.counter === undefined ? {} : { counter: head.counter }),
        ...(each ? { perCounter: true as const } : {}),
        args: {},
        span: { start: pos, end: subject.pos },
        rule: id,
      },
      pos: subject.pos,
    };
  },
});

const ORDINALS: ReadonlyMap<string, number> = new Map(
  [
    'second',
    'third',
    'fourth',
    'fifth',
    'sixth',
    'seventh',
    'eighth',
    'ninth',
    'tenth',
    'eleventh',
    'twelfth',
    'thirteenth',
    'fourteenth',
    'fifteenth',
    'sixteenth',
    'seventeenth',
    'eighteenth',
    'nineteenth',
    'twentieth',
  ].map((word, i) => [word, i + 2] as const),
);

/**
 * `trigger.nth-counter-put`: "the twelfth hour counter is put on ~" (Midnight Clock, CR 122.6, 603.2): the instance of putting that makes the number of counters of the kind on the permanent reach the
 * ordinal. The engine's `countersAdded` with `reaches`. Not read: "the first" (a count of one is "one or more"), a kind of counter left out, a counter of +1/+1 (the ordinal says a named kind), another
 * subject than the permanent named, "you put".
 */
export const TRIGGER_NTH_COUNTER_PUT = defineRule<IrTrigger>({
  id: 'trigger.nth-counter-put',
  family: 'trigger',
  leading: ['the'],
  cites: ['CR 122.6 (Counters)', 'CR 603.2 (Handling Triggered Abilities)'],
  examples: [
    'the twelfth hour counter is put on ~',
    'the third time counter is put on ~',
    'the twentieth page counter is put on ~',
  ],
  rejects: [
    'the first hour counter is put on ~',
    'the twelfth counter is put on ~',
    'the twelfth hour counter is put on',
    'the twelfth hour counters are put on ~',
    'the twelfth hour counter is removed from ~',
    'the twelve hour counter is put on ~',
    'you put the twelfth hour counter on ~',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.nth-counter-put';
    const head = pattern(/the ([a-z]+) ([a-z]+) counter is put on /iu)(ctx, pos);
    if (!head.ok) return head;
    const reaches = ORDINALS.get((head.value[1] ?? '').toLowerCase());
    const counter = (head.value[2] ?? '').toLowerCase();
    if (reaches === undefined || counter === '') return fail(ctx, pos);
    const subject = triggerSubject(id)(ctx, head.pos);
    if (!subject.ok) return subject;
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'countersAdded',
        subject: subject.value,
        by: 'any',
        counter,
        reaches,
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
    'you attack with one or more creatures',
    'another player attacks with one or more creatures',
  ],
  rejects: [
    'you attack with a creature',
    'you attack with one or more Birds',
    'you attack with one or more creatures you control',
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
    // "One or more" (Shriekwood Devourer's "you attack with one or more creatures", CR 508.1): at least one of the creatures declared, so the same as "you attack"; only for
    // "creatures" with no other word (a group named by a subtype is `trigger.you-attack-with-one-or-more`).
    const count = choice(
      map(literal('one or more '), () => 1),
      map(
        sequence(spanned(satisfy(quantity, (n) => n >= 2)), literal(' or more ')),
        (r) => r[0].value,
      ),
    )(ctx, who.pos);
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
    if (count.value === 1 && !bare) return fail(ctx, pos);
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'attackBatch',
        actor: actor.value,
        atLeast: count.value,
        ...(bare ? {} : { subject: phrase.value }),
        args: {},
        span: { start: pos, end: phrase.pos },
        rule: id,
      },
      pos: phrase.pos,
    };
  },
});

/**
 * `trigger.opponent-attacks`: "an opponent attacks with creatures" (CR 508.1, 603.2, 603.2c: the attackers are declared together and the ability triggers once for the declaration,
 * however many creatures it holds; D-643). One or more creatures, so `atLeast` 1 and every creature declared counts; "an opponent" is a player who is not the controller of the
 * ability, who is "that opponent" in the body.
 */
export const TRIGGER_OPPONENT_ATTACKS = defineRule<IrTrigger>({
  id: 'trigger.opponent-attacks',
  family: 'trigger',
  leading: ['an'],
  cites: [
    'CR 508.1 (Declare Attackers Step)',
    'CR 603.2 (Handling Triggered Abilities)',
    'CR 603.2c (Handling Triggered Abilities)',
  ],
  examples: ['an opponent attacks with creatures'],
  rejects: [
    'an opponent attacks with a creature',
    'an opponent attacks with creature',
    'an opponent attacks with creatures you control',
    'an opponent attack with creatures',
    'an opponent attacks with creatures and',
    'an opponent attacks',
    'a player attacks with creatures',
    'you attack with creatures',
    'another player attacks with creatures',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.opponent-attacks';
    const r = pattern(/an opponent attacks with creatures(?![\p{L}\p{N}'’])/iu)(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'attackBatch',
        actor: makeNoun(id, span, 'eachOpponent', { raw: 'an opponent' }),
        atLeast: 1,
        args: {},
        span,
        rule: id,
      },
      pos: r.pos,
    };
  },
});

/**
 * `trigger.player-attacks-opponent`: "a player attacks one of your opponents" (CR 508.1, 508.6, 603.2c; D-648: the ability triggers once for each opponent of its controller that the
 * declaration attacks, whoever declares the attackers). "That attacking player" is the player who declares them, "that opponent" the one attacked.
 */
export const TRIGGER_PLAYER_ATTACKS_OPPONENT = defineRule<IrTrigger>({
  id: 'trigger.player-attacks-opponent',
  family: 'trigger',
  leading: ['a'],
  cites: [
    'CR 508.1 (Declare Attackers Step)',
    'CR 508.6 (Declare Attackers Step)',
    'CR 603.2c (Handling Triggered Abilities)',
  ],
  examples: ['a player attacks one of your opponents'],
  rejects: [
    'a player attacks one of their opponents',
    'a player attacks your opponents',
    'a player attacks one of your opponent',
    'a player attacks you',
    'a player attacks one of your opponents with creatures',
    'an opponent attacks one of your opponents',
    'you attack one of your opponents',
    'a player attack one of your opponents',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.player-attacks-opponent';
    const r = pattern(/a player attacks one of your opponents(?![\p{L}\p{N}'’])/iu)(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'playerAttacksOpponent',
        actor: makeNoun(id, { start: pos, end: pos + 'a player'.length }, 'eachPlayer', {
          raw: 'a player',
        }),
        args: {},
        span,
        rule: id,
      },
      pos: r.pos,
    };
  },
});

export const ANGEL_TRIGGER_RULES = [
  TRIGGER_LIFE_GAINED,
  TRIGGER_INVESTIGATES,
  TRIGGER_LIFE_LOST,
  TRIGGER_COUNTERS_ADDED,
  TRIGGER_NTH_COUNTER_PUT,
  TRIGGER_ATTACK_BATCH,
  TRIGGER_OPPONENT_ATTACKS,
  TRIGGER_PLAYER_ATTACKS_OPPONENT,
].map(quietly);
