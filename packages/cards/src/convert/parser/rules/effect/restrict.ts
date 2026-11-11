/**
 * `effect.restrict`: a resolving spell or ability keeps one creature from blocking or from being
 * blocked for the turn, or makes it attack: "target creature can't be blocked this turn", "target
 * creature can't block this turn", "target creature attacks this turn if able" (CR 509.1b, 508.1d,
 * 611.2a: a rule-changing effect of a resolving spell or ability lasts as long as it says, here "this
 * turn", and ends in the cleanup step, CR 514.2). The restriction is not an ability of the creature,
 * so "loses all abilities" does not remove it (CR 613.11). One target, a creature: the plural, "up to
 * one", an exception ("except by creatures with flying") and a quality of the target the noun
 * rules do not read ("with flying") are other lines and stay unread; "with power 3 or less" is read
 * since stage P18 (D-111).
 */
import { choice, map, pattern, refuseAt, sequence } from '../../combinators';
import type { IrArg, IrDuration, IrNoun, IrRestrictionKind, Span } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, single } from './operands';

const RULE = 'effect.restrict';

/**
 * The words after the subject, each with the restriction it says; "this turn" is the duration. One
 * creature "attacks", several "attack" (stage P15).
 */
const wordsFor = (plural: boolean): readonly (readonly [RegExp, IrRestrictionKind])[] => [
  [/ can['’]t be blocked this turn(?![\p{L}\p{N}])/iu, 'cantBeBlocked'],
  [/ can['’]t block this turn(?![\p{L}\p{N}])/iu, 'cantBlock'],
  [
    plural
      ? / attack this turn if able(?![\p{L}\p{N}])/iu
      : / attacks this turn if able(?![\p{L}\p{N}])/iu,
    'attacksEachCombat',
  ],
  // Stage P49 (D-206, CR 509.1c): "must be blocked this turn if able".
  [/ must be blocked this turn if able(?![\p{L}\p{N}])/iu, 'mustBeBlocked'],
];

const tail = (plural: boolean) => {
  const words = wordsFor(plural);
  return map(
    spanned(pattern(new RegExp(words.map(([re]) => `(?:${re.source})`).join('|'), 'iu'))),
    ({ value, span }): { restriction: IrRestrictionKind; span: Span } => {
      const hit = words.find(([re]) => new RegExp(re.source, 'iu').test(value[0]));
      // The pattern is the union of the words, so one of them matched the text it read.
      return { restriction: hit?.[1] ?? 'cantBlock', span };
    },
  );
};

const TAIL = tail(false);
const TAIL_ALL = tail(true);

export const EFFECT_RESTRICT = defineRule<Clauses>({
  id: RULE,
  family: 'effect',
  leading: ['target', 'up'],
  cites: [
    'CR 509.1b (Declare Blockers Step)',
    'CR 508.1d (Declare Attackers Step)',
    'CR 611.2a (Continuous Effects)',
    'CR 613.11 (Interaction of Continuous Effects)',
    'CR 514.2 (Cleanup Step)',
  ],
  examples: [
    "target creature can't be blocked this turn",
    'target creature can’t be blocked this turn',
    "target creature can't block this turn",
    "target creature you don't control can't block this turn",
    'target creature attacks this turn if able',
    "target creature with power 3 or less can't be blocked this turn",
    // Stage P49 (D-206): "up to one target creature" (Key to the City).
    "up to one target creature can't be blocked this turn",
  ],
  rejects: [
    "target creature can't be blocked",
    "target creature can't block",
    "target creature can't be blocked until end of turn",
    "target creature can't be blocked this turn except by creatures with flying",
    "target creature can't block this turn and draw a card",
    "target creature can't attack this turn",
    "target creatures can't block this turn",
    "two target creatures can't be blocked this turn",
    "target creature or planeswalker can't be blocked this turn",
    "target permanent can't block this turn",
    "target creature with power greater than 3 can't be blocked this turn",
    "target creature can't be blocked by more than one creature this turn",
    "~ can't be blocked this turn",
    "creatures you control can't be blocked this turn",
  ],
  parse: single(
    RULE,
    sequence(
      // One creature: the engine's `restrict` takes one object, and a spell's "target" is a creature.
      choice(
        refuseAt(
          family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
          (n) =>
            !n.plural &&
            n.det === 'target' &&
            n.filter.anyOf === undefined &&
            n.filter.types?.length === 1 &&
            n.filter.types[0] === 'creature',
          (_n, _ctx, start) => start,
        ),
      ),
      TAIL,
    ),
    ([objects, { restriction, span }]) => {
      const kind: IrArg = { kind: 'restrictionKind', restriction, span, rule: RULE };
      const duration: IrDuration = { kind: 'duration', scope: 'thisTurn', span, rule: RULE };
      return { verb: 'restrict', args: { objects, restriction: kind }, duration };
    },
  ),
});

/**
 * `effect.restrict-all`: "creatures your opponents control attack this turn if able", "creatures
 * you control can't be blocked this turn" (CR 509.1b, 508.1d, 611.2a, 611.2c: the creatures are those
 * the words describe when the effect begins, and a creature that comes later is not affected). Every
 * creature of a group; "creatures" and no other type, and no quality of the group the noun rules do
 * not read ("creatures without flying", "creatures with power 3 or less").
 */
export const EFFECT_RESTRICT_ALL = defineRule<Clauses>({
  id: 'effect.restrict-all',
  family: 'effect',
  leading: ['creatures'],
  cites: [
    'CR 509.1b (Declare Blockers Step)',
    'CR 508.1d (Declare Attackers Step)',
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 514.2 (Cleanup Step)',
  ],
  examples: [
    'creatures your opponents control attack this turn if able',
    "creatures you control can't be blocked this turn",
    'creatures your opponents control can’t block this turn',
    'creatures you control attack this turn if able',
  ],
  rejects: [
    'creatures your opponents control attacks this turn if able',
    "creatures you control can't be blocked",
    "creatures you control can't be blocked until end of turn",
    "creatures you control can't be blocked this turn and draw a card",
    "other creatures you control can't be blocked this turn",
    "artifacts you control can't be blocked this turn",
    "creatures you control can't attack this turn",
    "target creatures can't block this turn",
    "creature you control can't be blocked this turn",
  ],
  parse: single(
    `${RULE}-all`,
    sequence(
      refuseAt(
        family<IrNoun>('noun', { only: ['noun.plain-permanents'] }),
        (n) =>
          n.plural &&
          n.det === 'each' &&
          n.filter.anyOf === undefined &&
          n.filter.subtypes === undefined &&
          n.filter.types?.length === 1 &&
          n.filter.types[0] === 'creature',
        (_n, _ctx, start) => start,
      ),
      TAIL_ALL,
    ),
    ([objects, { restriction, span }]) => {
      const kind: IrArg = { kind: 'restrictionKind', restriction, span, rule: `${RULE}-all` };
      const duration: IrDuration = {
        kind: 'duration',
        scope: 'thisTurn',
        span,
        rule: `${RULE}-all`,
      };
      return { verb: 'restrict', args: { objects, restriction: kind }, duration };
    },
  ),
});

/**
 * `effect.restrict-self`: "~ can't be blocked this turn", "it can't be blocked this turn" (stage P29, CR 509.1b, 611.2a):
 * the same effect as `effect.restrict` on the source of the ability or on "it", the permanent a sentence before it
 * named ("Put a +1/+1 counter on ~. It can't be blocked this turn."). The permanent is on the battlefield when the effect
 * resolves, or the effect finds nothing (CR 608.2b).
 */
export const EFFECT_RESTRICT_SELF = defineRule<Clauses>({
  id: `${RULE}-self`,
  family: 'effect',
  leading: ['~', 'it'],
  cites: [
    'CR 509.1b (Declare Blockers Step)',
    'CR 508.1d (Declare Attackers Step)',
    'CR 611.2a (Continuous Effects)',
    'CR 613.11 (Interaction of Continuous Effects)',
    'CR 514.2 (Cleanup Step)',
  ],
  examples: [
    "~ can't be blocked this turn",
    "it can't be blocked this turn",
    "It can't be blocked this turn",
    '~ can’t block this turn',
    '~ attacks this turn if able',
  ],
  rejects: [
    "~ can't be blocked",
    "~ can't be blocked until end of turn",
    "~ can't be blocked this turn except by creatures with flying",
    "~ can't be blocked this turn and draw a card",
    "~ can't attack this turn",
    "its can't be blocked this turn",
    "target creature can't be blocked this turn",
    "creatures you control can't be blocked this turn",
  ],
  parse: single(
    `${RULE}-self`,
    sequence(family<IrNoun>('noun', { only: ['noun.self', 'noun.it'] }), TAIL),
    ([objects, { restriction, span }]) => {
      const kind: IrArg = { kind: 'restrictionKind', restriction, span, rule: `${RULE}-self` };
      const duration: IrDuration = {
        kind: 'duration',
        scope: 'thisTurn',
        span,
        rule: `${RULE}-self`,
      };
      return { verb: 'restrict', args: { objects, restriction: kind }, duration };
    },
  ),
});

/**
 * `effect.restrict-while-controlling`: "up to one target creature can't block for as long as you control ~" (stage P45, D-197, CR 509.1b, 611.2b,
 * 613.11): the same effect as `effect.restrict` with the duration of an ability of a permanent, which does nothing when the permanent is not on the
 * battlefield under its controller's control as the ability resolves and ends, for good, as that stops being so. One creature (a target; "up to one"
 * chooses none or one as the ability goes on the stack), and "can't block" or "can't be blocked". The other restrictions, the plural and a duration
 * of another permanent ("for as long as you control a Dragon") are other lines and stay unread.
 */
export const EFFECT_RESTRICT_WHILE_CONTROLLING = defineRule<Clauses>({
  id: `${RULE}-while-controlling`,
  family: 'effect',
  leading: ['target', 'up'],
  cites: [
    'CR 509.1b (Declare Blockers Step)',
    'CR 611.2b (Continuous Effects)',
    'CR 613.11 (Interaction of Continuous Effects)',
  ],
  examples: [
    "up to one target creature can't block for as long as you control ~",
    'up to one target creature can’t block for as long as you control ~',
    "target creature can't block for as long as you control ~",
    "target creature can't be blocked for as long as you control ~",
    "up to one target creature can't be blocked for as long as you control ~",
    "target creature an opponent controls can't block for as long as you control ~",
  ],
  rejects: [
    "up to one target creature can't block for as long as you control",
    "up to one target creature can't block for as long as you control a Dragon",
    "up to one target creature can't block for as long as ~ remains tapped",
    "up to one target creature can't block this turn",
    "up to one target creature can't attack for as long as you control ~",
    'up to one target creature attacks each combat if able for as long as you control ~',
    "up to two target creatures can't block for as long as you control ~",
    "target creatures can't block for as long as you control ~",
    "target permanent can't block for as long as you control ~",
    "target creature or planeswalker can't block for as long as you control ~",
    "~ can't block for as long as you control ~",
    "creatures you control can't block for as long as you control ~",
    "up to one target creature can't block for as long as you control ~ and draw a card",
  ],
  parse: single(
    `${RULE}-while-controlling`,
    sequence(
      refuseAt(
        family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
        (n) =>
          !n.plural &&
          n.det === 'target' &&
          n.filter.anyOf === undefined &&
          n.filter.types?.length === 1 &&
          n.filter.types[0] === 'creature',
        (_n, _ctx, start) => start,
      ),
      spanned(
        pattern(/ can['’]t (block|be blocked) for as long as you control ~(?![\p{L}\p{N}])/iu),
      ),
    ),
    ([objects, { value, span }]) => {
      const restriction: IrRestrictionKind =
        value[1]?.toLowerCase() === 'block' ? 'cantBlock' : 'cantBeBlocked';
      const kind: IrArg = {
        kind: 'restrictionKind',
        restriction,
        span,
        rule: `${RULE}-while-controlling`,
      };
      const duration: IrDuration = {
        kind: 'duration',
        scope: 'whileYouControlSelf',
        span,
        rule: `${RULE}-while-controlling`,
      };
      return { verb: 'restrict', args: { objects, restriction: kind }, duration };
    },
  ),
});

export const RESTRICT_RULES = [
  EFFECT_RESTRICT,
  EFFECT_RESTRICT_ALL,
  EFFECT_RESTRICT_SELF,
  EFFECT_RESTRICT_WHILE_CONTROLLING,
];
