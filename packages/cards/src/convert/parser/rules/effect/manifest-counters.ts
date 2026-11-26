/**
 * Effect rules of the counters and the turning face up that follow manifest dread (Experimental Lab // Staff Room; CR 122.6, 122.1b, 701.40g, 708.8): "put two +1/+1 counters and a trample
 * counter on that creature", "turn that creature face up" and "turn that creature face up or put a +1/+1 counter on it". The lowerings are in `lower/manifest-counters.ts`; "that creature"
 * after "manifest dread" is the creature it manifested (`lower/nouns.ts`).
 */
import {
  choice,
  fail,
  literal,
  map,
  type Parser,
  pattern,
  separatedBy1,
  sequence,
} from '../../combinators';
import type { IrAmount, IrCounterSpec, IrNoun } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { COUNTER_NAME } from './counters';
import { type Clauses, LIST_SEPARATOR, makeClause, operands, single } from './operands';

/** The permanent the text can say after "turn" or "on": "it" or "that creature", the one a trigger or an earlier instruction named. */
const ANAPHORA = ['noun.it', 'noun.that-object'] as const;

interface CounterItem {
  readonly count: IrAmount;
  readonly counter: IrCounterSpec;
  /** The count was written as a number word ("two"), not as an article. */
  readonly counted: boolean;
}

/** "a trample counter", "two +1/+1 counters": a count (an article or a number word) and the kind, with the noun agreeing in number. */
const counterItem = (rule: string): Parser<CounterItem> => {
  const article: Parser<CounterItem> = (ctx, pos) => {
    const r = sequence(
      spanned(pattern(/an? (?=\S)/i)),
      spanned(pattern(COUNTER_NAME)),
      pattern(/ counter(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [{ span }, kind] = r.value;
    return {
      ok: true,
      value: {
        count: { kind: 'number', value: 1, span },
        counter: { kind: 'counterSpec', name: kind.value[0].toLowerCase(), span: kind.span, rule },
        counted: false,
      },
      pos: r.pos,
    };
  };
  const counted: Parser<CounterItem> = (ctx, pos) => {
    const r = sequence(
      family<IrAmount>('amount', { only: ['amount.number'] }),
      literal(' '),
      spanned(pattern(COUNTER_NAME)),
      pattern(/ counters(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [count, , kind] = r.value;
    // "one +1/+1 counters" is not English: a number of two or more takes the plural, and the plural only a number of two or more.
    if (count.kind !== 'number' || count.value < 2) return fail(ctx, pos);
    return {
      ok: true,
      value: {
        count,
        counter: { kind: 'counterSpec', name: kind.value[0].toLowerCase(), span: kind.span, rule },
        counted: true,
      },
      pos: r.pos,
    };
  };
  return choice(counted, article);
};

const KINDS_ID = 'effect.add-counters-counted-kinds';

/**
 * `effect.add-counters-counted-kinds`: "Put two +1/+1 counters and a trample counter on that creature" (Experimental Lab; CR 122.6, 122.1b, 608.2c): counters of two or more kinds on the same
 * object, each kind with its own count, put in the order written, each its own instruction (the lists of articles only, "a reach counter and a deathtouch counter", are
 * `effect.add-counters-kinds`). The object is "~", "it" or "that creature". Not read: a target, a count that is X or "that many", "for each", a counter kind that is not a word of letters
 * or a power and toughness, a number with the singular noun, and a trailing clause.
 */
export const EFFECT_ADD_COUNTERS_COUNTED_KINDS = defineRule<Clauses>({
  id: KINDS_ID,
  family: 'effect',
  leading: ['put'],
  cites: [
    'CR 122.6 (Counters)',
    'CR 122.1b (Counters)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'put two +1/+1 counters and a trample counter on that creature',
    'put two +1/+1 counters and a trample counter on it',
    'put a +1/+1 counter and two charge counters on ~',
    'put three +1/+1 counters, a flying counter, and a lifelink counter on that creature',
  ],
  rejects: [
    'put a +1/+1 counter and a trample counter on that creature',
    'put two +1/+1 counters and a trample counter on target creature',
    'put two +1/+1 counters and a trample counter',
    'put two +1/+1 counter and a trample counter on that creature',
    'put X +1/+1 counters and a trample counter on that creature',
    'put two +1/+1 counters and a trample counter on that creature and draw a card',
    'put two +1/+1 counters on that creature',
    'put two +1/+1 counters and a card on that creature',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('put '),
      separatedBy1(counterItem(KINDS_ID), LIST_SEPARATOR),
      literal(' on '),
      operands(['noun.self', ...ANAPHORA], KINDS_ID),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, items, , objects] = r.value;
    // A list of objects is another sentence; so is a list of articles only (`effect.add-counters-kinds` reads it).
    if (objects.kind !== 'noun' || items.length < 2 || !items.some((item) => item.counted)) {
      return fail(ctx, pos);
    }
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: items.map((item) =>
        makeClause(
          KINDS_ID,
          'addCounters',
          { count: item.count, counter: item.counter, objects },
          span,
        ),
      ),
      pos: r.pos,
    };
  },
});

const TURN_ID = 'effect.turn-face-up';

/** "turn <it | that creature> face up": the permanent a trigger or an earlier instruction named. */
const turnFaceUp = (): Parser<IrNoun> =>
  map(
    sequence(
      literal('turn '),
      family<IrNoun>('noun', { only: ANAPHORA }),
      pattern(/ face up(?![\p{L}\p{N}])/iu),
    ),
    ([, noun]) => noun,
  );

/**
 * `effect.turn-face-up`: "Turn that creature face up." (CR 701.40g, 708.8): an effect turns a face-down permanent face up and pays nothing (the special action that pays is the one a player
 * takes with priority). The permanent is "it" or "that creature", the one a trigger or an earlier instruction named. The engine's `turnFaceUp`. Not read: a target, "face down", another
 * player turning it, a trailing clause.
 */
export const EFFECT_TURN_FACE_UP = defineRule<Clauses>({
  id: TURN_ID,
  family: 'effect',
  leading: ['turn'],
  cites: [
    'CR 701.40g (Manifest)',
    'CR 708.8 (Face-Down Spells and Permanents)',
    'CR 708.7 (Face-Down Spells and Permanents)',
  ],
  examples: ['turn that creature face up', 'Turn that creature face up', 'turn it face up'],
  rejects: [
    'turn target creature face up',
    'turn that creature face down',
    'turn that creature face up and draw a card',
    'turn that creature up',
    'turns that creature face up',
    'turn ~ face up',
  ],
  parse: single(TURN_ID, turnFaceUp(), (objects) => ({
    verb: 'turnFaceUp',
    args: { objects },
  })),
});

const CHOICE_ID = 'effect.turn-face-up-or-counter';

/**
 * `effect.turn-face-up-or-counter`: "Turn that creature face up or put a +1/+1 counter on it." (Staff Room; CR 608.2d, 701.40g, 122.6): the controller chooses one of the two instructions as the
 * effect resolves, both about the same permanent ("it" or "that creature"). The engine's `chooseOne` of a `turnFaceUp` and an `addCounters`. Not read: a number of counters other than one
 * written with an article, another kind of counter in the second half, a target, "and", a trailing clause.
 */
export const EFFECT_TURN_FACE_UP_OR_COUNTER = defineRule<Clauses>({
  id: CHOICE_ID,
  family: 'effect',
  leading: ['turn'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 701.40g (Manifest)',
    'CR 708.8 (Face-Down Spells and Permanents)',
    'CR 122.6 (Counters)',
  ],
  examples: [
    'turn that creature face up or put a +1/+1 counter on it',
    'turn that creature face up or put a +1/+1 counter on that creature',
    'turn it face up or put a +1/+1 counter on it',
  ],
  rejects: [
    'turn that creature face up and put a +1/+1 counter on it',
    'turn that creature face up or put two +1/+1 counters on it',
    'turn that creature face up or put a +1/+1 counter on target creature',
    'turn that creature face up or put a +1/+1 counter on it and draw a card',
    'turn that creature face up or draw a card',
    'turn target creature face up or put a +1/+1 counter on it',
  ],
  parse: single(
    CHOICE_ID,
    map(
      sequence(
        turnFaceUp(),
        literal(' or put '),
        pattern(/an? (?=\S)/i),
        spanned(pattern(COUNTER_NAME)),
        pattern(/ counter on /i),
        family<IrNoun>('noun', { only: ANAPHORA }),
      ),
      ([objects, , , kind, , again]) => ({ objects, kind, again }),
    ),
    ({ objects, kind, again }) => ({
      verb: 'turnFaceUpOrCounter',
      args: {
        objects,
        again,
        counter: {
          kind: 'counterSpec',
          name: kind.value[0].toLowerCase(),
          span: kind.span,
          rule: CHOICE_ID,
        } satisfies IrCounterSpec,
      },
    }),
  ),
});

export const MANIFEST_COUNTERS_EFFECT_RULES = [
  EFFECT_ADD_COUNTERS_COUNTED_KINDS,
  // Before the plain turning face up, of which it is the start.
  EFFECT_TURN_FACE_UP_OR_COUNTER,
  EFFECT_TURN_FACE_UP,
] as const;
