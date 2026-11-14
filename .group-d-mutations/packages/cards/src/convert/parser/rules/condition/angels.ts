/**
 * Conditions of stage P33 (D-149, D-150): what the engine's Angels slice reads. "It had counters on it" (the permanent that left the
 * battlefield, as it last was, CR 603.10a, 122.1), "none of those creatures attacked you" (the attackers that triggered the ability, CR
 * 508.1b) and "you control three or more lands with the same name" (a count of permanents that share a name, CR 201.2).
 */
import { fail, literal, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrCondition, IrNoun } from '../../ir/types';
import { quantity } from '../amount/index';
import { BOUNDARY, permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';

function conditionOf(
  rule: string,
  start: number,
  end: number,
  test: IrCondition['test'],
): IrCondition {
  return { kind: 'condition', test, span: { start, end }, rule };
}

/**
 * `condition.had-counters`: "it had counters on it", "it had a +1/+1 counter on it", "it had a page counter on it" (CR 603.10a, 122.1: a
 * permanent that left the battlefield is looked at as it last was). Any kind of counter, or the kind the text names; the lowering reads it
 * as a part of the filter of the trigger about the permanent ("Whenever another permanent you control leaves the battlefield, if it had
 * counters on it, ...").
 */
export const CONDITION_HAD_COUNTERS = defineRule<IrCondition>({
  id: 'condition.had-counters',
  family: 'condition',
  leading: ['it'],
  cites: [
    'CR 603.10a (Handling Triggered Abilities)',
    'CR 122.1 (Counters)',
    'CR 113.7a (Abilities)',
  ],
  examples: [
    'it had counters on it',
    'it had a +1/+1 counter on it',
    'it had a counter on it',
    'it had a page counter on it',
    'it had +1/+1 counters on it',
    'it had an oil counter on it',
  ],
  rejects: [
    'it had counters',
    'it had a counter',
    'it had a +1/+1 counters on it',
    'it has counters on it',
    'it had no counters on it',
    'it had two +1/+1 counters on it',
    'it had counters on them',
    'they had counters on them',
    'it had counters on it and',
  ],
  parse: (ctx, pos) => {
    const kind = '([+-]\\d+\\/[+-]\\d+|[a-z]+)';
    const r = pattern(
      new RegExp(
        `it had (?:an? (?:${kind} )?counter|(?:${kind} )?counters) on it${BOUNDARY}`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const counter = (r.value[1] ?? r.value[2])?.toLowerCase();
    // "it had no counters on it" says the opposite.
    if (counter === 'no') return fail(ctx, pos);
    return {
      ok: true,
      value: conditionOf(
        'condition.had-counters',
        pos,
        r.pos,
        counter === undefined ? { kind: 'hadCounters' } : { kind: 'hadCounters', counter },
      ),
      pos: r.pos,
    };
  },
});

/**
 * `condition.those-attacked-you`: "none of those creatures attacked you" and "one or more of those creatures attacked you" (CR 508.1b:
 * a creature is declared as attacking a player, a planeswalker or a battle; "you" is the player who controls the ability and a planeswalker
 * they control is not "you"). "Those creatures" are the attackers that triggered the ability (`trigger.attack-batch`), which the lowering
 * checks.
 */
export const CONDITION_THOSE_ATTACKED_YOU = defineRule<IrCondition>({
  id: 'condition.those-attacked-you',
  family: 'condition',
  leading: ['none', 'one'],
  cites: ['CR 508.1b (Declare Attackers Step)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: ['none of those creatures attacked you', 'one or more of those creatures attacked you'],
  rejects: [
    'none of those creatures attacked you or a planeswalker you control',
    'none of those creatures attacked',
    'none of those creatures attacks you',
    'none of those creatures attacked me',
    'none of those creatures attacked an opponent',
    'none of the creatures attacked you',
    'none of those creatures attacked you and',
    'one of those creatures attacked you',
    'all of those creatures attacked you',
    'none of those creatures were attacking you',
  ],
  parse: (ctx, pos) => {
    // "or a planeswalker you control" says the opposite of what the engine reads ("attacked you" is the player alone): not read.
    const r = pattern(
      /(none|one or more) of those creatures attacked you(?![\p{L}\p{N}])(?! or )/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const attacked = conditionOf('condition.those-attacked-you', pos, r.pos, {
      kind: 'attackersAttackedYou',
    });
    const none = (r.value[1] ?? '').toLowerCase() === 'none';
    return {
      ok: true,
      value: none
        ? conditionOf('condition.those-attacked-you', pos, r.pos, { kind: 'not', term: attacked })
        : attacked,
      pos: r.pos,
    };
  },
});

/**
 * `condition.same-name`: "you control three or more lands with the same name", "you control two or more artifacts with the same name"
 * (CR 201.2, 603.4: two objects have the same name when their names are identical; the engine counts the permanents the controller
 * controls that match and share some one name, two basic Plains sharing theirs). A count of two or more of a plural phrase with no
 * controller of its own.
 */
export const CONDITION_SAME_NAME = defineRule<IrCondition>({
  id: 'condition.same-name',
  family: 'condition',
  leading: ['you'],
  cites: ['CR 201.2 (Names)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: [
    'you control three or more lands with the same name',
    'you control two or more artifacts with the same name',
    'you control four or more creatures with the same name',
    'you control three or more nonland permanents with the same name',
  ],
  rejects: [
    'you control three or more lands with the same name.',
    'you control three or more lands',
    'you control a land with the same name',
    'you control two lands with the same name',
    'you control three or more lands with the same names',
    'you control three or more lands with the same name as ~',
    'you control three or more lands you control with the same name',
    'you control three or more land with the same name',
    'an opponent controls three or more lands with the same name',
    'you control three or fewer lands with the same name',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('you control '),
      spanned(satisfy(quantity, (n) => n >= 2)),
      literal(' or more '),
      satisfy(
        map(permanentPhrase(true, 'all'), withoutZone),
        (filter) => filter.controller === undefined && filter.anyOf === undefined,
      ),
      pattern(new RegExp(` with the same name${BOUNDARY}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, count, , filter] = r.value;
    const span = { start: pos, end: r.pos };
    const noun: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter,
      upTo: false,
      plural: true,
      other: false,
      span,
      rule: 'condition.same-name',
    };
    return {
      ok: true,
      value: conditionOf('condition.same-name', pos, r.pos, {
        kind: 'sameName',
        noun,
        atLeast: count.value,
      }),
      pos: r.pos,
    };
  },
});

export const ANGEL_CONDITION_RULES = [
  CONDITION_SAME_NAME,
  CONDITION_HAD_COUNTERS,
  CONDITION_THOSE_ATTACKED_YOU,
].map(quietly);
