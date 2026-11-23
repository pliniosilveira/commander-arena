/**
 * Conditions about the controller and about the permanent itself (stage P29, D-133): "you control your commander"
 * (CR 903.3), "you have 30 or more life" and "you have at least 7 life more than your starting life total" (CR 119.1,
 * 903.7), "it's untapped" (CR 701.26). They are read after "as long as" of a static ability (CR 611.3a) and, like every
 * condition, after the "if" of an intervening "if" (CR 603.4) and of "Activate only if" (CR 602.5b). The engine reads
 * them where no layer 7 effect can change them (CR 613.8), which is why a condition on a power or a keyword is not here.
 */
import {
  choice,
  fail,
  literal,
  map,
  type Parser,
  pattern,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrComparison, IrCondition } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule, spanned } from '../registry';

function condition(
  rule: string,
  start: number,
  end: number,
  test: IrCondition['test'],
): IrCondition {
  return { kind: 'condition', test, span: { start, end }, rule };
}

/**
 * `condition.control-your-commander`: "you control your commander" (CR 903.3: a commander is a card its owner designated;
 * a commander of another player that you control is not "your commander"). A commander that is in the command zone is
 * not controlled. The engine's `controlCommander` with `yours`.
 */
export const CONDITION_CONTROL_YOUR_COMMANDER = defineRule<IrCondition>({
  id: 'condition.control-your-commander',
  family: 'condition',
  leading: ['you'],
  cites: ['CR 903.3 (Commander)', 'CR 903.3d (Commander)', 'CR 611.3a (Continuous Effects)'],
  examples: ['you control your commander'],
  rejects: [
    'you control a commander',
    'you control commander',
    'you control your commanders',
    'you control your commander.',
    'you control your commander or a creature',
    'an opponent controls your commander',
    'you cast your commander',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/you control your commander(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: condition('condition.control-your-commander', pos, r.pos, {
        kind: 'controlCommander',
        yours: true,
      }),
      pos: r.pos,
    };
  },
});

/** The number of life points: digits or a number word, one or more. */
const POINTS: Parser<number> = satisfy(quantity, (n) => n >= 1);

/**
 * "at least 7 life", "7 or more life", "7 or less life", "7 or fewer life" and, after "life", "more than your starting
 * life total": the comparison of a life total and whether it is the difference from the starting one.
 */
interface LifeCompare {
  readonly compare: IrComparison;
  readonly aboveStarting: boolean;
}

const LIFE_COMPARE: Parser<LifeCompare> = choice<LifeCompare>(
  map(
    sequence(literal('at least '), POINTS, literal(' life more than your starting life total')),
    ([, value]) => ({ compare: { cmp: 'atLeast' as const, value }, aboveStarting: true }),
  ),
  map(sequence(literal('at least '), POINTS, literal(' life')), ([, value]) => ({
    compare: { cmp: 'atLeast' as const, value },
    aboveStarting: false,
  })),
  map(sequence(POINTS, pattern(/ or (more|less|fewer) life/iu)), ([value, word]) => ({
    compare: {
      cmp: (word[1] ?? '').toLowerCase() === 'more' ? ('atLeast' as const) : ('atMost' as const),
      value,
    },
    aboveStarting: false,
  })),
);

/**
 * `condition.life-total`: "you have 30 or more life", "you have at least 30 life", "you have 5 or less life", "you have
 * at least 7 life more than your starting life total" (CR 119.1: a player's life total, CR 903.7: each player starts
 * the game with 40 life in Commander; the engine reads the starting life total of the game). The number is a whole number
 * of 1 or more. "More life than each opponent" and "life equal to" are other tests.
 */
export const CONDITION_LIFE_TOTAL = defineRule<IrCondition>({
  id: 'condition.life-total',
  family: 'condition',
  leading: ['you', 'an'],
  cites: ['CR 119.1 (Life)', 'CR 903.7 (Commander)', 'CR 611.3a (Continuous Effects)'],
  examples: [
    'you have 30 or more life',
    'an opponent has 10 or less life',
    'you have at least 30 life',
    'you have five or less life',
    'you have 5 or fewer life',
    'you have at least 7 life more than your starting life total',
    'you have at least seven life more than your starting life total',
  ],
  rejects: [
    'you have 30 life',
    'you have 30 or more',
    'you have more life than each opponent',
    'you have at least 7 life more than your starting life',
    'you have 0 or more life',
    'you have at most 30 life',
    'each opponent has 30 or more life',
    'you have 30 or more life.',
    'you have seven or more creature cards in your graveyard',
    'you have at least 7 life more than your starting life total or more',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(choice(literal('you have '), literal('an opponent has ')), LIFE_COMPARE),
    )(ctx, pos);
    if (!r.ok) return r;
    const { compare, aboveStarting } = r.value.value[1];
    return {
      ok: true,
      value: condition('condition.life-total', pos, r.pos, {
        kind: 'lifeTotal',
        compare,
        ...(r.value.value[0].toLowerCase().startsWith('an ')
          ? { player: 'opponent' as const }
          : {}),
        ...(aboveStarting ? { aboveStarting: true as const } : {}),
      }),
      pos: r.pos,
    };
  },
});

/**
 * `condition.this-tapped`: "~ is untapped", "it's untapped", "it is untapped", "~ is tapped" (CR 701.26: a permanent is
 * tapped or untapped). The permanent is the one the ability is on: `~`, or "it" in an ability about itself. The engine's
 * `thisMatches` with the tapped status, read each time the effects of the permanent are worked out.
 */
export const CONDITION_THIS_TAPPED = defineRule<IrCondition>({
  id: 'condition.this-tapped',
  family: 'condition',
  leading: ['~', 'it', 'it’s', "it's"],
  cites: ['CR 701.26 (Tap and Untap)', 'CR 611.3a (Continuous Effects)'],
  examples: [
    '~ is untapped',
    "it's untapped",
    'it’s untapped',
    'it is untapped',
    '~ is tapped',
    "it's tapped",
  ],
  rejects: [
    '~ is untapped.',
    'it untapped',
    '~ untapped',
    "it's not untapped",
    '~ is a creature',
    'target creature is untapped',
    'another creature is untapped',
    '~ is untapped or tapped',
    "it's untapped and tapped",
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(/(~|it)(?: is|['’]s) (untapped|tapped)(?![\p{L}\p{N}])/iu))(ctx, pos);
    if (!r.ok) return r;
    const who = (r.value.value[1] ?? '').toLowerCase() === '~' ? 'self' : 'it';
    const tapped = (r.value.value[2] ?? '').toLowerCase() === 'tapped';
    return {
      ok: true,
      value: condition('condition.this-tapped', pos, r.pos, {
        kind: 'thisMatches',
        filter: { tapped, raw: r.value.value[0] },
        who,
      }),
      pos: r.pos,
    };
  },
});

/**
 * `condition.this-attacking`: "~ is attacking" (CR 506.4: a creature is attacking from the declare attackers step until it leaves combat). The permanent is the one the ability is on:
 * the engine's `thisMatches` with the attacking status. Read as the "while" of a trigger (Fire Lord Azula: "Whenever you cast a spell while ~ is attacking").
 * Not read: "it", another creature, a negative, "attacking a player".
 */
export const CONDITION_THIS_ATTACKING = defineRule<IrCondition>({
  id: 'condition.this-attacking',
  family: 'condition',
  leading: ['~'],
  cites: ['CR 506.4 (Combat Phase)', 'CR 603.2 (Handling Triggered Abilities)'],
  examples: ['~ is attacking'],
  rejects: [
    '~ is attacking.',
    '~ is not attacking',
    '~ is attacking you',
    '~ is attacking and',
    'it is attacking',
    'another creature is attacking',
    '~ attacking',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(/~ is attacking(?![\p{L}\p{N}])/iu))(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: condition('condition.this-attacking', pos, r.pos, {
        kind: 'thisMatches',
        filter: { attacking: true, raw: r.value.value[0] },
        who: 'self',
      }),
      pos: r.pos,
    };
  },
});

/**
 * `condition.attached-to`: "~ is attached to a creature", "it's attached to a creature" (CR 301.5, 303.4: an Equipment or an Aura is attached to a
 * permanent). The permanent is the one the ability is on, the host a creature: the engine's `objectMatches` of the permanent it is attached to.
 * Read as the condition of a static ability ("As long as this Equipment is attached to a creature, ..."). Not read: another kind of host,
 * "enchanted", "equipped" and a negative ("isn't attached").
 */
export const CONDITION_ATTACHED_TO = defineRule<IrCondition>({
  id: 'condition.attached-to',
  family: 'condition',
  leading: ['~', 'it', 'it’s', "it's"],
  cites: ['CR 301.5 (Equipment)', 'CR 303.4 (Aura)', 'CR 611.3a (Continuous Effects)'],
  examples: [
    '~ is attached to a creature',
    "it's attached to a creature",
    'it is attached to a creature',
    'it’s attached to a creature',
  ],
  rejects: [
    '~ is attached to a creature.',
    '~ is attached to a land',
    '~ is attached to an creature',
    '~ is attached to target creature',
    '~ is attached to creature',
    "~ isn't attached to a creature",
    '~ is attached',
    'target Equipment is attached to a creature',
    '~ is attached to a creature you control',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(/(~|it)(?: is|['’]s) attached to a creature(?![\p{L}\p{N}])(?! you control)/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: condition('condition.attached-to', pos, r.pos, {
        kind: 'attachedTo',
        filter: { types: ['creature'], raw: 'a creature' },
      }),
      pos: r.pos,
    };
  },
});

/**
 * `condition.paired`: "~ is paired with another creature", "it's paired with another creature" (CR 702.95b: a creature becomes paired with another as the result of a
 * soulbond ability; abilities may refer to whether a creature is paired). The permanent is the one the ability is on: `~`, or "it" in an ability about itself. The engine's
 * `paired`. Not read: another kind of partner ("a Human"), "isn't paired", "is paired" alone, "unpaired" and a pair of another permanent.
 */
export const CONDITION_PAIRED = defineRule<IrCondition>({
  id: 'condition.paired',
  family: 'condition',
  leading: ['~', 'it', 'it’s', "it's"],
  cites: ['CR 702.95b (Soulbond)', 'CR 611.3a (Continuous Effects)'],
  examples: [
    '~ is paired with another creature',
    'it is paired with another creature',
    "it's paired with another creature",
    'it’s paired with another creature',
  ],
  rejects: [
    '~ is paired with another creature.',
    '~ is paired',
    '~ is paired with a creature',
    '~ is paired with another Human',
    '~ is paired with another creature you control',
    "~ isn't paired with another creature",
    '~ is unpaired',
    'another creature is paired with another creature',
    'target creature is paired with another creature',
    '~ is paired with another creatures',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(/(~|it)(?: is|['’]s) paired with another creature(?![\p{L}\p{N}])(?! you control)/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const who = (r.value.value[1] ?? '').toLowerCase() === '~' ? 'self' : 'it';
    return {
      ok: true,
      value: condition('condition.paired', pos, r.pos, { kind: 'paired', who }),
      pos: r.pos,
    };
  },
});

/**
 * `condition.this-has-counter`: "~ has a +1/+1 counter on it", "it has a counter on it" (CR 122.1: a counter is a marker on an object; a permanent has
 * a counter of a kind when at least one is on it). The permanent is the one the ability is on: `~`, or "it" in an ability about itself. The engine's
 * `thisMatches` with `hasCounter` (counters belong to no layer, CR 613.8), read where the condition is read: "Activate only if ~ has a +1/+1 counter on it."
 * (CR 602.5b). Not read: a number of counters ("two or more"), "no counters", another permanent's counters and a player's counters.
 */
export const CONDITION_THIS_HAS_COUNTER = defineRule<IrCondition>({
  id: 'condition.this-has-counter',
  family: 'condition',
  leading: ['~', 'it'],
  cites: ['CR 122.1 (Counters)', 'CR 602.5b (Activating Activated Abilities)'],
  examples: [
    '~ has a +1/+1 counter on it',
    '~ has a counter on it',
    'it has a +1/+1 counter on it',
    '~ has a stun counter on it',
    '~ has an oil counter on it',
    '~ has +1/+1 counters on it',
    // Ingenious Prodigy (Quandrix Unlimited deck, group G): at least one counter of the kind.
    '~ has one or more +1/+1 counters on it',
    '~ has one or more counters on it',
  ],
  rejects: [
    '~ has a +1/+1 counter on it.',
    '~ has no counters on it',
    '~ has no +1/+1 counters on it',
    '~ has a +1/+1 counters on it',
    '~ has one or more +1/+1 counter on it',
    '~ has one or more no counters on it',
    '~ has two +1/+1 counters on it',
    '~ has a +1/+1 counter',
    '~ has a +1/+1 counter on it and',
    '~ had a +1/+1 counter on it',
    'target creature has a +1/+1 counter on it',
    '~ has flying',
  ],
  parse: (ctx, pos) => {
    const kind = '([+-]\\d+\\/[+-]\\d+|[a-z]+)';
    const r = spanned(
      pattern(
        new RegExp(
          `(~|it) has (?:an? (?:${kind} )?counter|(?:${kind} )?counters|one or more (?:${kind} )?counters) on it(?![\\p{L}\\p{N}])`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const match = r.value.value;
    const counter = (match[2] ?? match[3] ?? match[4])?.toLowerCase();
    // "it has no counters on it" says the opposite, and "two" is a number: neither is a kind of counter.
    if (counter === 'no' || counter === 'two') return fail(ctx, pos);
    const who = (match[1] ?? '').toLowerCase() === '~' ? 'self' : 'it';
    return {
      ok: true,
      value: condition('condition.this-has-counter', pos, r.pos, {
        kind: 'thisMatches',
        filter: { hasCounter: counter ?? true, raw: match[0] },
        who,
      }),
      pos: r.pos,
    };
  },
});

/**
 * `condition.this-counter-count`: "~ has fewer than three charge counters on it", "~ has three or more charge counters on it" (CR 122.1, 603.4: the number of counters of a
 * kind on the permanent compared with a number, read as the ability triggers and as it resolves). The engine's `amountIs` of `countersOn` of the permanent itself;
 * "fewer than N" is at most N - 1. Not read: another permanent's counters, "it", an unnamed kind of counter, "no counters", other comparisons.
 */
export const CONDITION_THIS_COUNTER_COUNT = defineRule<IrCondition>({
  id: 'condition.this-counter-count',
  family: 'condition',
  leading: ['~', 'she', 'he'],
  cites: ['CR 122.1 (Counters)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: [
    '~ has fewer than three charge counters on it',
    '~ has fewer than 3 charge counters on it',
    '~ has three or more charge counters on it',
    '~ has fewer than two +1/+1 counters on it',
    // A card the text names by a person's pronoun (Kes, Evolving Telepath): the pronoun is bound to the permanent like "it" is.
    'she has nine or more time counters on her',
    'he has three or more charge counters on him',
  ],
  rejects: [
    '~ has fewer than three charge counters on it.',
    '~ has fewer than three counters on it',
    '~ has fewer than zero charge counters on it',
    '~ has fewer than three charge counters',
    '~ has fewer than three charge counters on it and',
    'it has fewer than three charge counters on it',
    'she has nine or more time counters on it',
    'she has nine or more time counters on him',
    'he has nine or more time counters on her',
    'she has nine or more counters on her',
    'target artifact has fewer than three charge counters on it',
    '~ has more than three charge counters on it',
    '~ had fewer than three charge counters on it',
    '~ has one or more charge counters on it',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(
        pattern(/(~|she|he) has /iu),
        choice<{ cmp: 'atMost' | 'atLeast'; value: number }>(
          map(
            sequence(
              literal('fewer than '),
              satisfy(quantity, (n) => n >= 1),
            ),
            ([, n]) => ({
              cmp: 'atMost' as const,
              value: n - 1,
            }),
          ),
          map(
            sequence(
              satisfy(quantity, (n) => n >= 2),
              literal(' or more'),
            ),
            ([n]) => ({ cmp: 'atLeast' as const, value: n }),
          ),
        ),
        literal(' '),
        pattern(/[+-]\d+\/[+-]\d+|[a-z]+/i),
        pattern(/ counters on (it|her|him)(?![\p{L}\p{N}])/iu),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [head, compare, , counter, tail] = r.value.value;
    // "she has ... on her" and "he has ... on him" name the card by a person's pronoun, which the binding pass makes the permanent the text last named; "~ ... on it" is the permanent itself.
    const subject = (head[1] ?? '').toLowerCase();
    const object = (tail[1] ?? '').toLowerCase();
    if (object !== { '~': 'it', she: 'her', he: 'him' }[subject]) return fail(ctx, pos);
    const name = counter[0].toLowerCase();
    if (name === 'no') return fail(ctx, pos);
    const span = r.value.span;
    return {
      ok: true,
      value: condition('condition.this-counter-count', pos, r.pos, {
        kind: 'amountIs',
        amount: {
          kind: 'countersOn',
          of: {
            kind: 'noun',
            det: subject === '~' ? 'self' : 'anaphor',
            filter: { raw: subject === '~' ? '~' : object },
            upTo: false,
            plural: false,
            other: false,
            span,
            rule: 'condition.this-counter-count',
          },
          counter: name,
          span,
        },
        compare,
      }),
      pos: r.pos,
    };
  },
});

/**
 * `condition.there-are-counters-on-self`: "there are three or more ribbon counters on ~" (Prize Pig, CR 122.1, 608.2c: the counters of one kind the permanent has now, read as the
 * sentence is reached, after the counters an instruction before it put on). The engine's `amountIs` of `countersOn` of the permanent itself. Not read: "fewer than", another permanent,
 * "it", an unnamed kind of counter, a bare number ("there are three counters").
 */
export const CONDITION_THERE_ARE_COUNTERS_ON_SELF = defineRule<IrCondition>({
  id: 'condition.there-are-counters-on-self',
  family: 'condition',
  leading: ['there'],
  cites: ['CR 122.1 (Counters)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'there are three or more ribbon counters on ~',
    'there are 3 or more charge counters on ~',
    'there are ten or more +1/+1 counters on ~',
  ],
  rejects: [
    'there are three or more ribbon counters on ~.',
    'there are three or more counters on ~',
    'there are three ribbon counters on ~',
    'there are fewer than three ribbon counters on ~',
    'there are three or more ribbon counters on it',
    'there are three or more ribbon counters on target creature',
    'there are three or more ribbon counters',
    'there are three or more ribbon counters on ~ and',
    'there are one or more ribbon counters on ~',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(
        literal('there are '),
        satisfy(quantity, (n) => n >= 2),
        literal(' or more '),
        pattern(/[+-]\d+\/[+-]\d+|[a-z]+/i),
        literal(' counters on ~'),
        pattern(/(?![\p{L}\p{N}])/u),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, value, , counter] = r.value.value;
    const name = counter[0].toLowerCase();
    if (name === 'no') return fail(ctx, pos);
    const span = r.value.span;
    return {
      ok: true,
      value: condition('condition.there-are-counters-on-self', pos, r.pos, {
        kind: 'amountIs',
        amount: {
          kind: 'countersOn',
          of: {
            kind: 'noun',
            det: 'self',
            filter: { raw: '~' },
            upTo: false,
            plural: false,
            other: false,
            span,
            rule: 'condition.there-are-counters-on-self',
          },
          counter: name,
          span,
        },
        compare: { cmp: 'atLeast', value },
      }),
      pos: r.pos,
    };
  },
});

/**
 * `condition.this-is-token`: "it isn't a token", "it's not a token", "it's a token", "~ is a token" (issue 145, Gruff Triplets; CR 111.1, 603.4: a token is a permanent that is not
 * represented by a card). The engine's `thisMatches` with `token`, read as the ability triggers and as it resolves (the intervening "if" of an enters trigger of the permanent
 * itself). The permanent is the one the ability is on: `~`, or "it" in an ability about itself. Not read: a kind of token ("a Treasure token"), another permanent, a past
 * tense, "isn't not a token".
 */
export const CONDITION_THIS_IS_TOKEN = defineRule<IrCondition>({
  id: 'condition.this-is-token',
  family: 'condition',
  leading: ['~', 'it', 'it’s', "it's"],
  cites: ['CR 111.1 (Tokens)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: [
    "it isn't a token",
    'it isn’t a token',
    "it's not a token",
    "it's a token",
    '~ is a token',
    "~ isn't a token",
    'it is a token',
  ],
  rejects: [
    "it isn't a token.",
    "it isn't a Treasure token",
    "it isn't not a token",
    "it's not a tokens",
    'it was a token',
    'it wasn’t a token',
    'target creature is a token',
    "it isn't a token and",
    "that isn't a token",
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(/(~|it)(?:['’]s(?: (not))?| is(?: (not))?| isn['’]t) an? token(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const match = r.value.value;
    const text = match[0].toLowerCase();
    const negative = /isn['’]t|\bnot\b/.test(text);
    // "it's not a token" and "it isn't a token" are one denial; a second "not" is no wording.
    if (/isn['’]t not|not not/.test(text)) return fail(ctx, pos);
    const who = (match[1] ?? '').toLowerCase() === '~' ? 'self' : 'it';
    return {
      ok: true,
      value: condition('condition.this-is-token', pos, r.pos, {
        kind: 'thisMatches',
        filter: { token: !negative, raw: match[0] },
        who,
      }),
      pos: r.pos,
    };
  },
});

export const SELF_STATE_CONDITION_RULES = [
  CONDITION_CONTROL_YOUR_COMMANDER,
  CONDITION_LIFE_TOTAL,
  CONDITION_THIS_TAPPED,
  CONDITION_THIS_ATTACKING,
  CONDITION_ATTACHED_TO,
  CONDITION_PAIRED,
  CONDITION_THIS_HAS_COUNTER,
  CONDITION_THIS_COUNTER_COUNT,
  CONDITION_THERE_ARE_COUNTERS_ON_SELF,
  CONDITION_THIS_IS_TOKEN,
];
