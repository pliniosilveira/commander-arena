/**
 * `effect.add-counters`: "Put a +1/+1 counter on ~", "put two +1/+1 counters on target creature"
 * (CR 122.6: putting counters on an object). The count is a number, "a"/"an" or X (stage P16: the
 * X of the spell or ability, CR 107.3a; a line outside a spell or activated ability with an X in
 * its cost is refused by the lowering). The counter is "+1/+1", "-1/-1" or a named kind ("charge").
 * A single counter may be counted by the times a multikicker was paid (stage P17: "put a +1/+1 counter
 * on it for each time it was kicked", the engine's `timesKicked`); since stage P28 (D-131) by any count of "for each"
 * ("put a +1/+1 counter on ~ for each creature destroyed this way"), and a quantity above one multiplies it. The count
 * may be what the sentence defines X as: "put X +1/+1 counters on target creature, where X is that creature's power".
 */
import {
  literal,
  map,
  optional,
  pattern,
  satisfy,
  separatedBy1,
  sequence,
} from '../../combinators';
import type { IrAmount, IrCounterSpec, IrNoun } from '../../ir/types';
import { EQUAL_AMOUNTS, FOR_EACH_TAIL, scaled } from '../amount/scaled';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, LIST_SEPARATOR, makeClause, operands, single } from './operands';

// Stage P69 (D-256): "that many", the life a life gain trigger names (the lowering refuses it where no such trigger or instruction gives it a meaning).
/**
 * The name of a kind of counter: "+1/+1", "-1/-1", the keyword counters of two words (CR 122.1b: first strike, double strike) and any other word ("charge").
 * Read at the lowering, where the names the engine runs as keyword counters (D-430) are told from the ones it cannot run (decayed).
 */
const COUNTER_NAME = /[+-]\d+\/[+-]\d+|first strike|double strike|[a-z]+/i;

const COUNT_ONLY = ['amount.number', 'amount.article', 'amount.x', 'amount.that-many'] as const;

/** The objects counters can be put on: this permanent, "it", a target, or each of a kind. */
const COUNTER_OPERANDS = [
  'noun.self',
  'noun.it',
  // Stage P49 (D-206): "put two +1/+1 counters on that token" (the token the sentence before made).
  'noun.that-token',
  'noun.target-permanent',
  'noun.up-to-one-permanent',
  'noun.all-permanents',
  'noun.each-permanent',
  // Stage P68 (D-230): "each permanent you control that's a creature or Vehicle".
  'noun.each-permanent-that-is',
  // Stage P48 (D-205): "Tap up to two target creatures. Put a stun counter on each of them."
  'noun.each-of-them',
] as const;

/**
 * D-653 (Breena, the Demagogue): "put two +1/+1 counters on a creature you control", one permanent the controller chooses as the effect resolves. Only the plain
 * counters effect reads it ("a number of ... equal to" and the others keep the operands above).
 */
const ADD_COUNTERS_OPERANDS = [...COUNTER_OPERANDS, 'noun.a-permanent'] as const;

export const EFFECT_ADD_COUNTERS = defineRule<Clauses>({
  id: 'effect.add-counters',
  family: 'effect',
  leading: ['put', 'you'],
  cites: ['CR 122.6 (Counters)', 'CR 122.1 (Counters)'],
  examples: [
    'put a +1/+1 counter on ~',
    'put two +1/+1 counters on target creature',
    'put a +1/+1 counter on each creature you control',
    'put a -1/-1 counter on target creature',
    'put three charge counters on ~',
    'put two +1/+1 counters on it',
    'put two +1/+1 counters on that token',
    'put a stun counter on each of them',
    'put X +1/+1 counters on target creature',
    'put X +1/+1 counters on ~',
    'put X charge counters on ~',
    'put X +1/+1 counters on each creature you control',
    'put a +1/+1 counter on it for each time it was kicked',
    'put a charge counter on ~ for each time ~ was kicked',
    'put two +1/+1 counters on it for each time it was kicked',
    'put a +1/+1 counter on it for each creature you control',
    'put a +1/+1 counter on ~ for each creature destroyed this way',
    'put two +1/+1 counters on ~ for each opponent who has more life than you',
    'put that many +1/+1 counters on each creature you control',
    'put that many +1/+1 counters on ~',
    'you put two +1/+1 counters on a creature you control',
    'put two +1/+1 counters on a creature you control',
  ],
  rejects: [
    'you put two +1/+1 counters on target creature and draw a card',
    'put X +1/+1 counters on it for each time it was kicked',
    'put a +1/+1 counter on it for each time',
    'put a +1/+1 counter on it for each creature',
    'put a +1/+1 counter on that creature',
    'put a +1/+1 counter on each of those',
    'put a +1/+1 counter on each of it',
    'put a card from your hand onto the battlefield',
    'put Y +1/+1 counters on ~',
    'put X counters on ~',
    'put up to X +1/+1 counters on ~',
    // A choice of three (a type and two subtypes) is not read: "creature or Dragon" is (D-447).
    'put a +1/+1 counter on target creature, Dragon, or Elf',
    'put a +1/+1 counter on ~ and draw a card',
    'put a +1/+1 counter on',
    'put that many counters on ~',
    'put that much +1/+1 counters on ~',
    'put that many +1/+1 counters on ~ for each creature you control',
  ],
  parse: single(
    'effect.add-counters',
    // A count of "for each time it was kicked" replaces the "a": two counters for each time would
    // multiply, which the engine's one amount cannot say.
    satisfy(
      sequence(
        // D-653 (Breena, the Demagogue): "... and you put two +1/+1 counters on a creature you control": the controller as the subject.
        map(sequence(optional(literal('you '), null), literal('put ')), () => 'put '),
        family<IrAmount>('amount', { only: COUNT_ONLY }),
        literal(' '),
        map(
          spanned(pattern(COUNTER_NAME)),
          ({ value, span }): IrCounterSpec => ({
            kind: 'counterSpec',
            name: value[0].toLowerCase(),
            span,
            rule: 'effect.add-counters',
          }),
        ),
        pattern(/ counters? on /i),
        operands(ADD_COUNTERS_OPERANDS, 'effect.add-counters'),
        optional(FOR_EACH_TAIL, null),
      ),
      ([, count, , , , , each]) => each === null || scaled(count, each) !== null,
    ),
    ([, count, , counter, , objects, each]) => ({
      verb: 'addCounters',
      args: { count: each === null ? count : (scaled(count, each) ?? count), counter, objects },
    }),
  ),
});

/** The objects the counters of a kind can be doubled on: this permanent, "it", a target, or a group as the effect resolves. */
const DOUBLE_COUNTER_OPERANDS = [
  'noun.self',
  'noun.it',
  'noun.target-permanent',
  'noun.each-permanent',
  'noun.all-permanents',
] as const;

/**
 * `effect.double-counters`: "double the number of +1/+1 counters on target creature you control" (CR 701.10 Double, 122.6): each object gets as
 * many more counters of the kind as it has as the effect resolves. The counters are put by the controller of the spell or ability, so they go
 * through the same placement as "put a +1/+1 counter on" does. Not read: a doubling of a quantity that is not a counter kind ("double the
 * number of counters" with no kind, which is every kind), "any number of" targets, or one with a trailing clause.
 */
export const EFFECT_DOUBLE_COUNTERS = defineRule<Clauses>({
  id: 'effect.double-counters',
  family: 'effect',
  leading: ['double'],
  cites: ['CR 701.10 (Double)', 'CR 122.6 (Counters)', 'CR 122.1 (Counters)'],
  examples: [
    'double the number of +1/+1 counters on target creature you control',
    'double the number of +1/+1 counters on ~',
    'double the number of +1/+1 counters on it',
    'double the number of -1/-1 counters on target creature',
    'double the number of charge counters on ~',
    'double the number of +1/+1 counters on each creature you control',
  ],
  rejects: [
    'double the number of counters on target creature',
    'double the number of +1/+1 counters on target creature you control and draw a card',
    'double the number of +1/+1 counters on',
    'double the number of +1/+1 counters',
    'double the number of +1/+1 counters on any number of other target creatures',
    'double the +1/+1 counters on ~',
    'double the number of +1/+1 counters on ~ until end of turn',
    'double the power and toughness of ~ until end of turn',
  ],
  parse: single(
    'effect.double-counters',
    sequence(
      literal('double the number of '),
      map(
        spanned(pattern(COUNTER_NAME)),
        ({ value, span }): IrCounterSpec => ({
          kind: 'counterSpec',
          name: value[0].toLowerCase(),
          span,
          rule: 'effect.double-counters',
        }),
      ),
      pattern(/ counters on /i),
      operands(DOUBLE_COUNTER_OPERANDS, 'effect.double-counters'),
    ),
    ([, counter, , objects]) => ({ verb: 'doubleCounters', args: { counter, objects } }),
  ),
});

/**
 * `effect.add-counters-number-of`: "Put a number of +1/+1 counters on each creature you control equal to the number of security votes" (stage P44, D-195,
 * CR 122.6, 608.2c): the count is the amount after "equal to", worked out as the instruction runs and put on each of the objects (the same count on every
 * one, as "put X +1/+1 counters on each creature you control" does). Not read: "a number of" with one counter or no counter, no "equal to", and an
 * object that is not one of the operands of `effect.add-counters`.
 */
export const EFFECT_ADD_COUNTERS_NUMBER_OF = defineRule<Clauses>({
  id: 'effect.add-counters-number-of',
  family: 'effect',
  leading: ['put'],
  cites: ['CR 122.6 (Counters)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'put a number of +1/+1 counters on each creature you control equal to the number of security votes',
    'put a number of +1/+1 counters on ~ equal to the number of creatures you control',
    'put a number of charge counters on ~ equal to its power',
    'put a number of +1/+1 counters on target creature equal to twice the number of profit votes',
  ],
  rejects: [
    'put a number of +1/+1 counters on each creature you control',
    'put a number of +1/+1 counters on each creature you control equal to',
    'put a number of +1/+1 counters on each creature you control equal to 3',
    'put a number of counters on each creature you control equal to the number of security votes',
    'put a number of +1/+1 counter on each creature you control equal to the number of security votes',
    'put a +1/+1 counter on each creature you control equal to the number of security votes',
    'put the number of +1/+1 counters on each creature you control equal to the number of security votes',
    'put a number of +1/+1 counters on each creature you control equal to the number of security votes and draw a card',
    'put a number of +1/+1 counters on a creature you control equal to its power',
  ],
  parse: single(
    'effect.add-counters-number-of',
    sequence(
      literal('put a number of '),
      map(
        spanned(pattern(COUNTER_NAME)),
        ({ value, span }): IrCounterSpec => ({
          kind: 'counterSpec',
          name: value[0].toLowerCase(),
          span,
          rule: 'effect.add-counters-number-of',
        }),
      ),
      pattern(/ counters on /i),
      operands(COUNTER_OPERANDS, 'effect.add-counters-number-of'),
      literal(' '),
      family<IrAmount>('amount', { only: EQUAL_AMOUNTS }),
    ),
    ([, counter, , objects, , count]) => ({
      verb: 'addCounters',
      args: { count, counter, objects },
    }),
  ),
});

/**
 * `effect.add-counters-kinds`: "Put a +1/+1 counter, a reach counter, and a deathtouch counter on target creature" (D-430, CR 122.6, 122.1b): one counter of each of
 * two or more kinds on the same object, put in the order written (CR 608.2c), each its own instruction. The object is one noun (a target, "~" or "it"), which every
 * instruction shares: a target is chosen once (CR 115.1). Only "a" or "an" before each counter: "two +1/+1 counters and a reach counter" is not read.
 */
export const EFFECT_ADD_COUNTERS_KINDS = defineRule<Clauses>({
  id: 'effect.add-counters-kinds',
  family: 'effect',
  leading: ['put'],
  cites: [
    'CR 122.6 (Counters)',
    'CR 122.1b (Counters)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'put a +1/+1 counter, a reach counter, and a deathtouch counter on target creature',
    'put a flying counter and a lifelink counter on ~',
    'put a first strike counter, a double strike counter, and a trample counter on it',
    'put a +1/+1 counter and a vigilance counter on target creature',
    'put an exalted counter and a shield counter on target creature',
  ],
  rejects: [
    'put a +1/+1 counter on target creature',
    'put a reach counter and a deathtouch counter',
    'put a reach counter, a deathtouch counter on target creature and draw a card',
    'put two reach counters and a deathtouch counter on target creature',
    'put a reach counter and deathtouch counter on target creature',
    'put a reach counter and a card on target creature',
    'put a reach counter, and a deathtouch counter on each creature you control',
    'put a reach counter and a deathtouch counter on target creature and ~',
  ],
  parse: (ctx, pos) => {
    const item = map(
      spanned(sequence(pattern(/an? /i), pattern(COUNTER_NAME), literal(' counter'))),
      ({ value, span }): IrCounterSpec => ({
        kind: 'counterSpec',
        name: value[1][0].toLowerCase(),
        span,
        rule: 'effect.add-counters-kinds',
      }),
    );
    const r = sequence(
      literal('put '),
      satisfy(separatedBy1(item, LIST_SEPARATOR), (items) => items.length >= 2),
      literal(' on '),
      operands(['noun.self', 'noun.it', 'noun.target-permanent'], 'effect.add-counters-kinds'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, counters, , objects] = r.value;
    // A list of objects ("on target creature and ~") is a different sentence: one noun only.
    if (objects.kind !== 'noun') return { ok: false };
    const span = { start: pos, end: r.pos };
    const one = (counter: IrCounterSpec) =>
      makeClause(
        'effect.add-counters-kinds',
        'addCounters',
        { count: { kind: 'number', value: 1, span: counter.span }, counter, objects },
        span,
      );
    return { ok: true, value: counters.map(one), pos: r.pos };
  },
});

/**
 * `effect.player-add-counters`: "Target player puts a +1/+1 counter on each creature they control" (CR 122.6, 109.4, 608.2c, 115.1): a chosen player puts counters on every permanent
 * of a kind they control. The player is a target noun of its own, numbered with the other targets of the text; the permanents are the engine's `each` selector with `controlledBy`
 * that player. Not read: "you" and the other subjects (`effect.add-counters`), a plural subject, "puts" with a number of counters that is not a number or "a", other objects, a
 * for-each count.
 */
export const EFFECT_PLAYER_ADD_COUNTERS = defineRule<Clauses>({
  id: 'effect.player-add-counters',
  family: 'effect',
  leading: ['target'],
  cites: [
    'CR 122.6 (Counters)',
    'CR 109.4 (Objects)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'target player puts a +1/+1 counter on each creature they control',
    'target opponent puts two -1/-1 counters on each creature they control',
  ],
  rejects: [
    'target player put a +1/+1 counter on each creature they control',
    'target player puts a +1/+1 counter on each creature you control',
    'target player puts a +1/+1 counter on target creature',
    'target player puts a +1/+1 counter on each creature',
    'target player puts a +1/+1 counter on each creature they control for each creature',
    'target players put a +1/+1 counter on each creature they control',
    'each player puts a +1/+1 counter on each creature they control',
    'target player puts X +1/+1 counters on each creature they control',
    'target creature puts a +1/+1 counter on each creature they control',
    'you put a +1/+1 counter on each creature they control',
  ],
  parse: single(
    'effect.player-add-counters',
    satisfy(
      sequence(
        family<IrNoun>('noun', { only: ['noun.player'] }),
        literal(' puts '),
        family<IrAmount>('amount', { only: ['amount.number', 'amount.article'] }),
        literal(' '),
        map(
          spanned(pattern(COUNTER_NAME)),
          ({ value, span }): IrCounterSpec => ({
            kind: 'counterSpec',
            name: value[0].toLowerCase(),
            span,
            rule: 'effect.player-add-counters',
          }),
        ),
        pattern(/ counters? on /i),
        family<IrNoun>('noun', { only: ['noun.each-permanent-they-control'] }),
      ),
      ([subject]) => subject.det === 'target',
    ),
    ([player, , count, , counter, , objects]) => ({
      verb: 'addCounters',
      args: { player, count, counter, objects },
    }),
  ),
});

export const COUNTER_RULES = [
  EFFECT_PLAYER_ADD_COUNTERS,
  EFFECT_ADD_COUNTERS,
  EFFECT_DOUBLE_COUNTERS,
  EFFECT_ADD_COUNTERS_NUMBER_OF,
  EFFECT_ADD_COUNTERS_KINDS,
];
