/**
 * Effect rules of the Final Fantasy X counter group (group A): the keyword action Support (CR 701.41), "put those counters on target permanent you control" (Resourceful Defense),
 * the evasion of Rikku, Resourceful Guardian, and the delayed return of Together Forever.
 */
import { fail, literal, map, pattern, refuseAt, sequence } from '../../combinators';
import type { IrAmount, IrArg, IrCounterSpec, IrDuration, IrNoun } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, operands, single } from './operands';

const END = "(?![\\p{L}\\p{N}'’])";

/**
 * `effect.support`: "support 2", "support X" (CR 701.41a: "Support N" on a permanent means "Put a +1/+1 counter on each of up to N other target creatures"; on an instant or sorcery spell, up to
 * N target creatures). The words are the keyword action alone: the lowering builds the counters and the targets (the permanent's own "other" is left to it, which knows whether the text is a spell's).
 * X is read only in the enters trigger of the permanent itself (the X of the spell it came from, CR 107.3m) and in a spell with an {X} (CR 107.3a). Not read: no number, a count word ("support
 * two"), "supports 2", "support 0", "you support 2", "support 2 times", "support X times".
 */
export const EFFECT_SUPPORT = defineRule<Clauses>({
  id: 'effect.support',
  family: 'effect',
  leading: ['support'],
  cites: ['CR 701.41a (Support)', 'CR 122.6 (Counters)', 'CR 115.1 (Targets)'],
  examples: ['support 2', 'support 1', 'support X', 'Support 3'],
  rejects: [
    'support',
    'support two',
    'supports 2',
    'support 0',
    'you support 2',
    'support 2 times',
    'support X times',
    'support Y',
    'support 2 creatures',
    'support up to 2',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.support';
    const r = spanned(pattern(new RegExp(`support (?:([1-9]\\d*)|(X))${END}`, 'iu')))(ctx, pos);
    if (!r.ok) return r;
    const { span } = r.value;
    const digits = r.value.value[1];
    const count: IrAmount =
      digits !== undefined ? { kind: 'number', value: Number(digits), span } : { kind: 'x', span };
    const counter: IrCounterSpec = { kind: 'counterSpec', name: '+1/+1', span, rule: id };
    const objects: IrNoun = {
      kind: 'noun',
      det: 'target',
      filter: { types: ['creature'], zone: 'battlefield', raw: 'creatures' },
      count,
      upTo: true,
      plural: true,
      // The permanent's "other"; a spell's own text has none (CR 701.41a): the lowering reads the owner.
      other: true,
      span,
      rule: id,
    };
    const one: IrAmount = { kind: 'number', value: 1, span };
    return {
      ok: true,
      value: [
        {
          kind: 'clause',
          verb: 'support',
          args: { count: one, counter, objects } as Readonly<Record<string, IrArg>>,
          optional: false,
          span,
          rule: id,
        },
      ],
      pos: r.pos,
    };
  },
});

const BLOCKERS_TAIL = /can['’]t be blocked by creatures your opponents control/iu;

/**
 * `effect.cant-be-blocked-by-opponents-creatures`: "Until end of turn, that creature can't be blocked by creatures your opponents control" (Rikku, Resourceful Guardian; CR 509.1b, 611.2a: a
 * blocking restriction for the turn, read when blockers are declared for each creature an opponent controls, the opponents being those of the controller as it resolves). The subject is
 * what the text named before ("it", "that creature") or one target creature; the duration is "until end of turn" in front or "this turn" behind. The engine's `cantBeBlockedByPlayer` of each
 * opponent. Not read: "your opponent's creatures", "creatures an opponent controls", "creatures that player controls", another duration, plural subjects, "can't block", a missing duration, both
 * durations.
 */
export const EFFECT_CANT_BE_BLOCKED_BY_OPPONENTS_CREATURES = defineRule<Clauses>({
  id: 'effect.cant-be-blocked-by-opponents-creatures',
  family: 'effect',
  leading: ['until', 'that', 'it', 'target'],
  cites: [
    'CR 509.1b (Declare Blockers Step)',
    'CR 611.2a (Continuous Effects)',
    'CR 102.2 (Players)',
    'CR 115.1 (Targets)',
  ],
  examples: [
    "until end of turn, that creature can't be blocked by creatures your opponents control",
    'until end of turn, that creature can’t be blocked by creatures your opponents control',
    "until end of turn, it can't be blocked by creatures your opponents control",
    "until end of turn, target creature can't be blocked by creatures your opponents control",
    "target creature can't be blocked by creatures your opponents control this turn",
    "that creature can't be blocked by creatures your opponents control this turn",
  ],
  rejects: [
    "that creature can't be blocked by creatures your opponents control",
    "until your next turn, that creature can't be blocked by creatures your opponents control",
    "until end of turn, that creature can't be blocked by creatures an opponent controls",
    "until end of turn, that creature can't be blocked by creatures that player controls",
    "until end of turn, that creature can't be blocked by your opponents' creatures",
    "until end of turn, those creatures can't be blocked by creatures your opponents control",
    "until end of turn, target creatures can't be blocked by creatures your opponents control",
    "until end of turn, that creature can't block creatures your opponents control",
    "until end of turn, that creature can't be blocked by creatures your opponents control this turn",
    "until end of turn, that creature can't be blocked by creatures your opponents control and draw a card",
    "until end of turn, up to one target creature can't be blocked by creatures your opponents control",
    "target creature can't be blocked by creatures your opponents control until end of turn",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.cant-be-blocked-by-opponents-creatures';
    const subject = family<IrNoun>('noun', {
      only: ['noun.it', 'noun.that-object', 'noun.target-permanent'],
    });
    const lead = sequence(family<IrDuration>('duration'), literal(', '), subject)(ctx, pos);
    let objects: IrNoun;
    let duration: IrDuration;
    let at: number;
    if (lead.ok) {
      [duration, , objects] = lead.value;
      if (duration.scope !== 'untilEndOfTurn') return fail(ctx, pos);
      const tail = pattern(
        new RegExp(` ${BLOCKERS_TAIL.source}(?![\\p{L}\\p{N}'’])(?! this turn)`, 'iu'),
      )(ctx, lead.pos);
      if (!tail.ok) return tail;
      at = tail.pos;
    } else {
      const bare = subject(ctx, pos);
      if (!bare.ok) return bare;
      objects = bare.value;
      const tail = spanned(
        pattern(new RegExp(` ${BLOCKERS_TAIL.source} this turn(?![\\p{L}\\p{N}'’])`, 'iu')),
      )(ctx, bare.pos);
      if (!tail.ok) return tail;
      duration = { kind: 'duration', scope: 'thisTurn', span: tail.value.span, rule: id };
      at = tail.pos;
    }
    // One creature: a plural noun, a count or an "up to" is another sentence.
    if (objects.plural || objects.upTo || objects.count !== undefined) return fail(ctx, pos);
    if (
      objects.det === 'target' &&
      (objects.filter.types?.length !== 1 ||
        objects.filter.types[0] !== 'creature' ||
        objects.filter.anyOf !== undefined)
    ) {
      return fail(ctx, pos);
    }
    return {
      ok: true,
      value: [
        {
          kind: 'clause',
          verb: 'cantBeBlockedByOpponents',
          args: { objects },
          optional: false,
          duration,
          span: { start: pos, end: at },
          rule: id,
        },
      ],
      pos: at,
    };
  },
});

/** One creature that is a target (CR 115.1): "target creature with a counter on it", not several, not "up to". */
const targetCreature = refuseAt(
  family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
  (n) =>
    !n.plural &&
    !n.upTo &&
    n.count === undefined &&
    n.det === 'target' &&
    n.filter.anyOf === undefined &&
    n.filter.types?.length === 1 &&
    n.filter.types[0] === 'creature',
  (_n, _ctx, start) => start,
);

/**
 * `effect.choose-target-dies-return`: "Choose target creature with a counter on it. When that creature dies this turn, return that card to its owner's hand." (Together Forever; CR 115.1,
 * 603.7, 603.7c, 603.10a, 700.4: the creature is a target of the ability, and a delayed triggered ability of the controller waits for that creature to die before the end of the turn, once;
 * the card is the one the creature became in the graveyard, if it is still there). The two sentences are one instruction (`segment.ts`). The engine's `delayedDies`. Not read: another
 * zone, "you may", "up to one", a count, "this creature", a later turn, another instruction after it.
 */
export const EFFECT_CHOOSE_TARGET_DIES_RETURN = defineRule<Clauses>({
  id: 'effect.choose-target-dies-return',
  family: 'effect',
  leading: ['choose'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 603.7 (Delayed Triggered Abilities)',
    'CR 603.7c (Delayed Triggered Abilities)',
    'CR 603.10a (Handling Triggered Abilities)',
    'CR 700.4 (General)',
  ],
  examples: [
    "choose target creature with a counter on it. when that creature dies this turn, return that card to its owner's hand",
    "choose target creature. when that creature dies this turn, return that card to its owner's hand",
  ],
  rejects: [
    'choose target creature with a counter on it',
    "choose target creature with a counter on it. when that creature dies, return that card to its owner's hand",
    'choose target creature with a counter on it. when that creature dies this turn, return that card to the battlefield',
    "choose target creature with a counter on it. when that creature dies this turn, you may return that card to its owner's hand",
    "choose up to one target creature with a counter on it. when that creature dies this turn, return that card to its owner's hand",
    "choose target creatures with a counter on it. when those creatures die this turn, return those cards to their owner's hand",
    "choose target creature with a counter on it. when that creature dies this turn, return that card to its owner's hand and draw a card",
    "choose target creature with a counter on it. when it dies this turn, return that card to its owner's hand",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.choose-target-dies-return';
    const head = sequence(literal('choose '), targetCreature, literal('. '))(ctx, pos);
    if (!head.ok) return head;
    const tail = spanned(
      pattern(
        new RegExp(
          `when that creature dies this turn, return that card to its owner['’]s hand${END}`,
          'iu',
        ),
      ),
    )(ctx, head.pos);
    if (!tail.ok) return tail;
    const [, objects] = head.value;
    const span = { start: pos, end: tail.pos };
    return {
      ok: true,
      value: [
        {
          kind: 'clause',
          verb: 'delayedDies',
          args: { objects },
          optional: false,
          span,
          rule: id,
        },
      ],
      pos: tail.pos,
    };
  },
});

/**
 * `effect.put-that-number-counters`: "put that number of +1/+1 counters on target creature" (Yuna, Grand Summoner; CR 122.6, 603.10a: as many counters as the permanent the trigger is about had as it
 * left the battlefield, put on the object named). The same instruction as `effect.add-counters`, the count being "that number", which the lowering of a trigger whose intervening "if" is "if it had
 * one or more counters on it" reads and refuses elsewhere. Not read: "that number" without "of", a count before it, "that many", "that number of counters", a following clause.
 */
export const EFFECT_PUT_THAT_NUMBER_COUNTERS = defineRule<Clauses>({
  id: 'effect.put-that-number-counters',
  family: 'effect',
  leading: ['put'],
  cites: ['CR 122.6 (Counters)', 'CR 603.10a (Handling Triggered Abilities)'],
  examples: [
    'put that number of +1/+1 counters on target creature',
    'put that number of -1/-1 counters on target creature',
    'put that number of +1/+1 counters on ~',
    'put that number of +1/+1 counters on it',
  ],
  rejects: [
    'put that number +1/+1 counters on target creature',
    'put that number of counters on target creature',
    'put that many +1/+1 counters on target creature',
    'put two of that number of +1/+1 counters on target creature',
    'put that number of +1/+1 counter on target creature',
    'put that number of +1/+1 counters',
    'put that number of +1/+1 counters on target creature and draw a card',
  ],
  parse: single(
    'effect.put-that-number-counters',
    sequence(
      literal('put '),
      family<IrAmount>('amount', { only: ['amount.that-number'] }),
      literal(' of '),
      map(
        spanned(pattern(/([+-]\d+\/[+-]\d+) counters on /iu)),
        ({ value, span }): IrCounterSpec => ({
          kind: 'counterSpec',
          name: (value[1] ?? '').toLowerCase(),
          span,
          rule: 'effect.put-that-number-counters',
        }),
      ),
      operands(
        ['noun.self', 'noun.it', 'noun.target-permanent'],
        'effect.put-that-number-counters',
      ),
    ),
    ([, count, , counter, objects]) => ({
      verb: 'addCounters',
      args: { count, counter, objects },
    }),
  ),
});

export const COUNTER_GROUP_A_EFFECT_RULES = [
  EFFECT_SUPPORT,
  EFFECT_PUT_THAT_NUMBER_COUNTERS,
  EFFECT_CANT_BE_BLOCKED_BY_OPPONENTS_CREATURES,
  EFFECT_CHOOSE_TARGET_DIES_RETURN,
];
