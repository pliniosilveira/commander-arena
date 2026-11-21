/**
 * Effect rules of the Federation Fleet deck, group A ("Seek out": "Whenever you draw your second card each turn, ..."): the two phrases that follow that trigger and were not read
 * before. The trigger (`trigger.drawn` with `nth`) and the targets "one or two target creatures" and "up to one other target creature" are older rules.
 */
import { literal, map, type Parser, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrCounterSpec, IrNoun } from '../../ir/types';
import { defineRule, family, quietly, spanned } from '../registry';
import { COUNTER_NAME } from './counters';
import { gainParser } from './gain';
import { type Clauses, makeClause } from './operands';

/** "one or two target creatures": at least one target and at most two (CR 115.1, 601.2c), as `noun.target-permanent` reads it. */
function oneOrTwoTargets(noun: IrNoun): boolean {
  return (
    noun.det === 'target' &&
    noun.plural &&
    noun.minTargets === 1 &&
    noun.count?.kind === 'number' &&
    noun.count.value === 2 &&
    noun.upTo !== true &&
    noun.filter.player === undefined &&
    noun.filter.anyTarget !== true
  );
}

/**
 * `effect.gain-keyword-targets-each`: "one or two target creatures each get +2/+0 and gain lifelink until end of turn" (Vic Fontaine, One Night Only; CR 115.1, 601.2c, 611.2a,
 * 613.1f, 613.4c): the creatures chosen as the ability is put on the stack, one or two of them, each getting the change and the keywords. Not read: another count of targets, the
 * verbs in the singular or without "each", a keyword the engine cannot grant, no duration.
 */
export const EFFECT_GAIN_KEYWORD_TARGETS_EACH = defineRule<Clauses>({
  id: 'effect.gain-keyword-targets-each',
  family: 'effect',
  leading: ['one'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 601.2c (Casting Spells)',
    'CR 611.2a (Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 613.4c (Interaction of Continuous Effects)',
  ],
  examples: [
    'one or two target creatures each get +2/+0 and gain lifelink until end of turn',
    'one or two target creatures each gain flying until end of turn',
    'one or two target creatures you control each get +1/+1 and gain trample and haste until end of turn',
  ],
  rejects: [
    'one or two target creatures get +2/+0 and gain lifelink until end of turn',
    'one or two target creatures each gets +2/+0 and gains lifelink until end of turn',
    'one or two target creatures each get +2/+0 and gain lifelink',
    'one or two target creatures each get +2/+0 and gain flash until end of turn',
    'up to two target creatures each get +2/+0 and gain lifelink until end of turn',
    'two target creatures each get +2/+0 and gain lifelink until end of turn',
    'one or two target creature each get +2/+0 and gain lifelink until end of turn',
    'one or two target creatures each get +2/+0 until end of turn',
  ],
  parse: gainParser(
    'effect.gain-keyword-targets-each',
    [],
    true,
    () => true,
    undefined,
    map(
      sequence(
        satisfy(family<IrNoun>('noun', { only: ['noun.target-permanent'] }), oneOrTwoTargets),
        literal(' each'),
      ),
      ([noun]) => noun,
    ),
  ),
});

/**
 * `effect.add-counters-up-to-two-targets`: "put a +1/+1 counter on up to one other target creature and two charge counters on up to one target Spacecraft" (Jean-Luc Picard,
 * Luminary; CR 122.6, 115.1, 115.3, 601.2c, 608.2c): two instructions of one sentence, each its own number of counters of its own kind on its own optional target (a target noun of
 * "up to one"; none need be chosen). The second target is a slot of its own: "another" is not said, so the same object may be both (CR 115.3). Not read: "up to one" missing in either
 * slot, a plain target, a third item, a trailing clause.
 */
export const EFFECT_ADD_COUNTERS_UP_TO_TWO_TARGETS = defineRule<Clauses>({
  id: 'effect.add-counters-up-to-two-targets',
  family: 'effect',
  leading: ['put'],
  cites: [
    'CR 122.6 (Counters)',
    'CR 115.1 (Targets)',
    'CR 115.3 (Targets)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'put a +1/+1 counter on up to one other target creature and two charge counters on up to one target Spacecraft',
    'put a +1/+1 counter on up to one target creature and a charge counter on up to one target artifact',
  ],
  rejects: [
    'put a +1/+1 counter on target creature and two charge counters on up to one target Spacecraft',
    'put a +1/+1 counter on up to one other target creature and two charge counters on target Spacecraft',
    'put a +1/+1 counter on up to one other target creature',
    'put a +1/+1 counter on up to one other target creature and two charge counters on up to one target Spacecraft and draw a card',
    'put a +1/+1 counter on up to one other target creature, two charge counters on up to one target Spacecraft, and a stun counter on up to one target creature',
    'put a +1/+1 counter on up to one other target creature and two charge counters on up to two target Spacecraft',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.add-counters-up-to-two-targets';
    const oneOptionalTarget = (noun: IrNoun) =>
      noun.det === 'target' &&
      noun.upTo === true &&
      !noun.plural &&
      noun.filter.player === undefined &&
      noun.filter.anyTarget !== true;
    const counters: Parser<[IrAmount, IrCounterSpec]> = map(
      sequence(
        family<IrAmount>('amount', { only: ['amount.number', 'amount.article'] }),
        literal(' '),
        map(
          spanned(pattern(COUNTER_NAME)),
          ({ value, span }): IrCounterSpec => ({
            kind: 'counterSpec',
            name: value[0].toLowerCase(),
            span,
            rule: id,
          }),
        ),
        pattern(/ counters? on /i),
      ),
      ([count, , counter]): [IrAmount, IrCounterSpec] => [count, counter],
    );
    const target = satisfy(
      family<IrNoun>('noun', { only: ['noun.target-permanent', 'noun.up-to-one-permanent'] }),
      oneOptionalTarget,
    );
    const r = sequence(
      literal('put '),
      counters,
      target,
      literal(' and '),
      counters,
      target,
    )(ctx, pos);
    if (!r.ok) return r;
    const [, [count1, counter1], objects1, , [count2, counter2], objects2] = r.value;
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'addCounters',
          { count: count1, counter: counter1, objects: objects1 },
          span,
        ),
        makeClause(
          id,
          'addCounters',
          { count: count2, counter: counter2, objects: objects2 },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

export const SEEK_OUT_EFFECT_RULES = [
  EFFECT_GAIN_KEYWORD_TARGETS_EACH,
  EFFECT_ADD_COUNTERS_UP_TO_TWO_TARGETS,
].map(quietly);
