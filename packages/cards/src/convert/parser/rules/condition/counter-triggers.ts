/**
 * Conditions of the Blight Curse deck's counter group (Lorwyn Eclipsed): "you control that creature" and "you don't control it" (Auntie Ool, Cursewretch), "its toughness was less than 1"
 * (Massacre Girl, Known Killer) and "you put a counter on a creature this turn" (Lasting Tarfire). The engine's `subjectControlledByYou` (read of the permanent whose event caused the
 * trigger, CR 603.10a, 608.2h), `subjectStat` (CR 603.10a, 113.7a, 208.1) and `putCountersThisTurn` (the turn log, CR 122.6).
 */
import { fail, pattern } from '../../combinators';
import type { IrComparison, IrCondition, IrNoun } from '../../ir/types';
import { defineRule } from '../registry';

const END = "(?![\\p{L}\\p{N}'’])";

function condition(
  rule: string,
  start: number,
  end: number,
  test: IrCondition['test'],
): IrCondition {
  return { kind: 'condition', test, span: { start, end }, rule };
}

/**
 * `condition.control-that-creature`: "you control that creature", "you control it", "you don't control it", "you don't control that creature" (CR 603.10a, 608.2h, 109.4: the permanent
 * an earlier part of the text names, read under the control it has now or had as it left the battlefield). "It" and "that creature" are pronouns for the binding pass; the lowering
 * reads them of the permanent the trigger is about. The negative says `negated`, which the lowering writes as the engine's `not`. Not read: another noun ("that permanent", "that creature's controller"), "you
 * controlled", "an opponent controls that creature", "you control another creature" and the past tense.
 */
export const CONDITION_CONTROL_THAT_CREATURE = defineRule<IrCondition>({
  id: 'condition.control-that-creature',
  family: 'condition',
  leading: ['you'],
  cites: [
    'CR 603.10a (Handling Triggered Abilities)',
    'CR 608.2h (Resolving Spells and Abilities)',
    'CR 109.4 (Objects)',
  ],
  examples: [
    'you control that creature',
    'you control it',
    "you don't control it",
    'you don’t control that creature',
  ],
  rejects: [
    'you control',
    'you control that',
    'you controlled that creature',
    'you control that permanent',
    'you control that creatures',
    'you control them',
    'you control another creature',
    "you don't control",
    "you don't control a creature",
    'an opponent controls that creature',
    'you control that creature and',
    'you control itself',
  ],
  parse: (ctx, pos) => {
    const r = pattern(new RegExp(`you (don['’]t )?control (that creature|it)${END}`, 'iu'))(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    const negative = r.value[1] !== undefined;
    const word = (r.value[2] ?? '').toLowerCase();
    const id = 'condition.control-that-creature';
    const span = { start: pos, end: r.pos };
    const who: IrNoun = {
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: word },
      upTo: false,
      plural: false,
      other: false,
      span,
      rule: id,
    };
    return {
      ok: true,
      value: condition(id, pos, r.pos, {
        kind: 'controlsThat',
        who,
        ...(negative ? { negated: true as const } : {}),
      }),
      pos: r.pos,
    };
  },
});

/**
 * `condition.its-stat-was`: "its toughness was less than 1", "its power was 2 or less", "its toughness was 4 or greater" (CR 603.10a, 113.7a, 208.1: the power or toughness the
 * permanent the trigger is about has, or had as it left the battlefield). The number is a whole number written in digits. "Less than N" is at most N - 1 and "greater than N" at
 * least N + 1. Not read: a word for the number, a stat besides power and toughness, "more than" (Oracle text says "greater than"), "is" for a permanent that has left, another
 * object than "its", a missing number.
 */
export const CONDITION_ITS_STAT_WAS = defineRule<IrCondition>({
  id: 'condition.its-stat-was',
  family: 'condition',
  leading: ['its'],
  cites: [
    'CR 603.10a (Handling Triggered Abilities)',
    'CR 113.7a (Abilities)',
    'CR 208.1 (Power/Toughness)',
  ],
  examples: [
    'its toughness was less than 1',
    'its power was 2 or less',
    'its toughness was 4 or greater',
    'its power was greater than 3',
    'its toughness was less than 0',
  ],
  rejects: [
    'its toughness was',
    'its toughness was less than',
    'its toughness was less than one',
    'its toughness was more than 1',
    'its toughness was 1',
    'its loyalty was less than 1',
    'its mana value was less than 1',
    'that creature’s toughness was less than 1',
    'his toughness was less than 1',
    'its toughness was less than 1 and',
    'its toughness is less than 1',
    'its toughness was less than -1',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(
        `its (power|toughness) was (?:(less than|greater than) (\\d+)|(\\d+) or (less|greater))${END}`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const stat = (r.value[1] ?? '').toLowerCase() as 'power' | 'toughness';
    const strict = (r.value[2] ?? '').toLowerCase();
    const loose = (r.value[5] ?? '').toLowerCase();
    const value = Number(r.value[3] ?? r.value[4]);
    if (!Number.isSafeInteger(value)) return fail(ctx, pos);
    const compare: IrComparison =
      strict === 'less than'
        ? { cmp: 'atMost', value: value - 1 }
        : strict === 'greater than'
          ? { cmp: 'atLeast', value: value + 1 }
          : { cmp: loose === 'less' ? 'atMost' : 'atLeast', value };
    return {
      ok: true,
      value: condition('condition.its-stat-was', pos, r.pos, {
        kind: 'subjectStat',
        stat,
        compare,
      }),
      pos: r.pos,
    };
  },
});

/**
 * `condition.you-put-counter-this-turn`: "you put a counter on a creature this turn", "you put a +1/+1 counter on a permanent this turn" (CR 122.6, 603.4: the player put a counter
 * on a permanent, read from what happened this turn: counters put by an opponent, or by no player, do not count). The kind of counter is the one the text names, any when it says
 * only "a counter"; the permanent is "a creature" or "a permanent". Not read: "one or more", "two or more counters", a kind of permanent besides creature and permanent, "on
 * ~", "on target", "an opponent put", "you've put", another span of time ("last turn") and the singular "counters".
 */
export const CONDITION_YOU_PUT_COUNTER_THIS_TURN = defineRule<IrCondition>({
  id: 'condition.you-put-counter-this-turn',
  family: 'condition',
  leading: ['you'],
  cites: ['CR 122.6 (Counters)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: [
    'you put a counter on a creature this turn',
    'you put a -1/-1 counter on a creature this turn',
    'you put a +1/+1 counter on a permanent this turn',
    'you put a stun counter on a creature this turn',
  ],
  rejects: [
    'you put one or more counters on a creature this turn',
    'you put two counters on a creature this turn',
    'you put a counter on a land this turn',
    'you put a counter on ~ this turn',
    'you put a counter on a creature',
    'you put a counter on a creature last turn',
    "you've put a counter on a creature this turn",
    'an opponent put a counter on a creature this turn',
    'you put a counters on a creature this turn',
    'you put a counter on a creature this turn and',
    'you put a counter on target creature this turn',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(
        `you put an? (?:([+-]\\d+\\/[+-]\\d+|[a-z]+) )?counter on a (creature|permanent) this turn${END}`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const kind = r.value[1]?.toLowerCase();
    // "a counter" read as the kind "counter" when the optional kind swallows it: the word "counter" is no kind.
    if (kind === 'counter') return fail(ctx, pos);
    const on = (r.value[2] ?? '').toLowerCase();
    return {
      ok: true,
      value: condition('condition.you-put-counter-this-turn', pos, r.pos, {
        kind: 'putCountersThisTurn',
        ...(kind === undefined ? {} : { counter: kind }),
        ...(on === 'creature' ? { onType: 'creature' } : {}),
      }),
      pos: r.pos,
    };
  },
});

export const COUNTER_TRIGGER_CONDITION_RULES = [
  CONDITION_CONTROL_THAT_CREATURE,
  CONDITION_ITS_STAT_WAS,
  CONDITION_YOU_PUT_COUNTER_THIS_TURN,
];
