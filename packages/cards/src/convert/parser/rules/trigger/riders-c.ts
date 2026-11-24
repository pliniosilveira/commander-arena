/**
 * Trigger rules of the Riders of Rohan deck, group C (combat): "Whenever ~ and at least two other creatures attack" (Frontline Medic, battalion; CR 508.1, 603.2c) and "Whenever
 * one or more creatures attack one of your opponents or a planeswalker they control" (Frontier Warmonger; CR 508.1b, 506.3, 603.2c).
 */
import { fail, literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule, spanned } from '../registry';
import { makeNoun } from './subjects';

/**
 * `trigger.self-and-others-attack`: "~ and at least two other creatures attack" (CR 508.1, 603.2c: the attackers are declared together and the ability triggers once for the
 * declaration; the permanent with the ability must be one of them, and it counts). The engine's `attackBatch` of `who` "you" with `includesSource` and `atLeast` the number of
 * other creatures plus one. Not read: "at least one other" (a single other creature is `trigger.attacks-with-another`'s kind of wording), "other" with a kind of creature,
 * "attacks", "attack you", more words after "attack".
 */
export const TRIGGER_SELF_AND_OTHERS_ATTACK = defineRule<IrTrigger>({
  id: 'trigger.self-and-others-attack',
  family: 'trigger',
  leading: ['~', 'this'],
  cites: [
    'CR 508.1 (Declare Attackers Step)',
    'CR 603.2 (Handling Triggered Abilities)',
    'CR 603.2c (Handling Triggered Abilities)',
  ],
  examples: [
    '~ and at least two other creatures attack',
    '~ and at least three other creatures attack',
    'this creature and at least two other creatures attack',
  ],
  rejects: [
    '~ and at least one other creature attack',
    '~ and at least two other creatures attacks',
    '~ and at least two other creatures attack you',
    '~ and at least two other creatures attack a player',
    '~ and at least two other creatures attack and',
    '~ and at least two other creatures attack or',
    '~ and at least two other artifact creatures attack',
    '~ and two other creatures attack',
    '~ and at least two creatures attack',
    '~ and at least two other creatures',
    '~ attacks',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.self-and-others-attack';
    const r = sequence(
      pattern(/(?:~|this creature)(?![\p{L}\p{N}])/iu),
      literal(' and at least '),
      spanned(satisfy(quantity, (n) => n >= 2)),
      literal(' other creatures attack'),
    )(ctx, pos);
    if (!r.ok) return r;
    // Words after "attack" ("attack you", "attack a player", "attack and ...", "attacks") belong to another reading.
    if (pattern(/(?:[\p{L}\p{N}]|\s+(?:you|a|and|or)(?![\p{L}\p{N}]))/iu)(ctx, r.pos).ok) {
      return fail(ctx, pos);
    }
    const [, , others] = r.value;
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'attackBatch',
        actor: makeNoun(id, { start: pos, end: pos }, 'you', { raw: '' }),
        atLeast: others.value + 1,
        includesSource: true,
        args: {},
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

/**
 * `trigger.attack-your-opponents`: "one or more creatures attack one of your opponents or a planeswalker they control" (CR 508.1b, 506.3, 603.2c: the declaration is made by any
 * player; only the creatures attacking one of the opponents of the controller of the ability as a player, or a planeswalker such an opponent controls, count, and they are
 * "those creatures"). The engine's `attackBatch` of `who` "any" with `attackingYourOpponents`. Not read: "a player", "you", "your planeswalkers", "an opponent" alone, a kind of
 * creature, "attacks", more words after "they control".
 */
export const TRIGGER_ATTACK_YOUR_OPPONENTS = defineRule<IrTrigger>({
  id: 'trigger.attack-your-opponents',
  family: 'trigger',
  leading: ['one'],
  cites: [
    'CR 508.1b (Declare Attackers Step)',
    'CR 506.3 (Combat Phase)',
    'CR 603.2c (Handling Triggered Abilities)',
  ],
  examples: [
    'one or more creatures attack one of your opponents or a planeswalker they control',
    'One or more creatures attack one of your opponents or a planeswalker they control',
  ],
  rejects: [
    'one or more creatures attack one of your opponents',
    'one or more creatures attack you or a planeswalker you control',
    'one or more creatures attack one of your opponents or a planeswalker you control',
    'one or more creatures attack one of your opponents or a battle they control',
    'one or more creatures attacks one of your opponents or a planeswalker they control',
    'one or more creatures attack one of your opponents or a planeswalker they control and',
    'one or more creatures attack one of your opponents or a planeswalker they controls',
    'one or more artifact creatures attack one of your opponents or a planeswalker they control',
    'one or more creatures you control attack one of your opponents or a planeswalker they control',
    'one or more creatures attack a player or a planeswalker they control',
    'two or more creatures attack one of your opponents or a planeswalker they control',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.attack-your-opponents';
    const r = spanned(
      pattern(
        /one or more creatures attack one of your opponents or a planeswalker they control(?![\p{L}\p{N}'’])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    if (pattern(/\s+(?:and|or)(?![\p{L}\p{N}])/iu)(ctx, r.pos).ok) return fail(ctx, pos);
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'attackBatch',
        actor: makeNoun(id, { start: pos, end: pos }, 'eachPlayer', { raw: '' }),
        atLeast: 1,
        attackingYourOpponents: true,
        args: {},
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

/**
 * `trigger.exerted-once-a-turn`: "if ~ hasn't been exerted this turn, you may exert it as it attacks" (Combat Celebrant; CR 701.43b, 701.43d, 508.1g, 607.2h): the optional cost to
 * attack of `trigger.exerted`, offered only to a creature that has not been exerted yet this turn (a permanent can be exerted more than once in a turn, so the condition is what limits
 * it). The creature is the one with the ability. The engine's `exertOnAttack` with `unlessExertedThisTurn` and the `exerted` trigger linked to it. Not read: another creature, another
 * time ("this combat"), "may exert" without the condition (`trigger.exerted`), "as it blocks", "attacks" or more words after "attacks".
 */
export const TRIGGER_EXERTED_ONCE_A_TURN = defineRule<IrTrigger>({
  id: 'trigger.exerted-once-a-turn',
  family: 'trigger',
  leading: ['if'],
  cites: [
    'CR 701.43b (Exert)',
    'CR 701.43d (Exert)',
    'CR 508.1g (Declare Attackers Step)',
    'CR 607.2h (Linked Abilities)',
  ],
  examples: [
    "if ~ hasn't been exerted this turn, you may exert it as it attacks",
    'if ~ hasn’t been exerted this turn, you may exert it as it attacks',
    "if this creature hasn't been exerted this turn, you may exert it as it attacks",
    "if ~ hasn't been exerted this turn, you may exert ~ as it attacks",
  ],
  rejects: [
    "if another creature hasn't been exerted this turn, you may exert it as it attacks",
    "if ~ hasn't been exerted this combat, you may exert it as it attacks",
    "if ~ hasn't been exerted this turn, you may exert it",
    "if ~ hasn't been exerted this turn, you may exert it as it blocks",
    "if ~ hasn't been exerted this turn, you may exert it as it attacks.",
    "if ~ hasn't been exerted this turn, you may exert target creature as it attacks",
    "if ~ hasn't been exerted this turn, you exert it as it attacks",
    "if ~ hasn't been exerted this turn, you may exert it as it attacks or blocks",
    'if ~ has been exerted this turn, you may exert it as it attacks',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.exerted-once-a-turn';
    const r = spanned(
      pattern(
        /if (~|this creature) hasn['’]t been exerted this turn, you may exert (?:it|~|this creature) as it attacks(?![\p{L}\p{N}.]|\s+or(?![\p{L}\p{N}]))/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const subject = makeNoun(id, r.value.span, 'self', { raw: '~' });
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'exerted',
        subject,
        unlessExertedThisTurn: true,
        args: {},
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

export const RIDERS_C_TRIGGER_RULES = [
  TRIGGER_SELF_AND_OTHERS_ATTACK,
  TRIGGER_ATTACK_YOUR_OPPONENTS,
  TRIGGER_EXERTED_ONCE_A_TURN,
];
