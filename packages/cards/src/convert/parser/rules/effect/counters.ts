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
  choice,
  literal,
  map,
  optional,
  type Parser,
  pattern,
  satisfy,
  separatedBy1,
  sequence,
} from '../../combinators';
import type { IrAmount, IrCounterSpec, IrNoun, IrNounList } from '../../ir/types';
import { EQUAL_AMOUNTS, FOR_EACH_TAIL, scaled } from '../amount/scaled';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, LIST_SEPARATOR, makeClause, operands, single } from './operands';
import { impliedYou } from './player';

// Stage P69 (D-256): "that many", the life a life gain trigger names (the lowering refuses it where no such trigger or instruction gives it a meaning).
/**
 * The name of a kind of counter: "+1/+1", "-1/-1", the keyword counters of two words (CR 122.1b: first strike, double strike) and any other word ("charge").
 * Read at the lowering, where the names the engine runs as keyword counters (D-430) are told from the ones it cannot run (decayed).
 */
export const COUNTER_NAME = /[+-]\d+\/[+-]\d+|first strike|double strike|[a-z]+/i;

const COUNT_ONLY = ['amount.number', 'amount.article', 'amount.x', 'amount.that-many'] as const;

/** The objects counters can be put on: this permanent, "it", a target, or each of a kind. */
const COUNTER_OPERANDS = [
  'noun.self',
  'noun.it',
  // CR 608.2c (Sphere Grid): "put a +1/+1 counter on that creature", the permanent the trigger is about.
  'noun.that-object',
  // Stage P49 (D-206): "put two +1/+1 counters on that token" (the token the sentence before made).
  'noun.that-token',
  'noun.target-permanent',
  'noun.up-to-one-permanent',
  'noun.all-permanents',
  'noun.each-permanent',
  // Issue 145 (Gruff Triplets): "each creature you control named ~".
  'noun.each-creature-you-control-named-self',
  // Stage P68 (D-230): "each permanent you control that's a creature or Vehicle".
  'noun.each-permanent-that-is',
  // Stage P48 (D-205): "Tap up to two target creatures. Put a stun counter on each of them."
  'noun.each-of-them',
  // Exit from Exile deck (Sweet-Gum Recluse): "each of any number of target creatures that entered this turn".
  'noun.each-of-any-number-targets',
  // Counter Blitz deck, group C (Collective Effort): "each creature target player controls".
  'noun.each-permanent-of-target-player',
  // Monstrosity of the Lake: "Tap all creatures your opponents control, then put a stun counter on each of those creatures." (the binding pass turns the words into the group before)
  'noun.paired-creatures',
] as const;

/**
 * D-653 (Breena, the Demagogue): "put two +1/+1 counters on a creature you control", one permanent the controller chooses as the effect resolves. Only the plain
 * counters effect reads it ("a number of ... equal to" and the others keep the operands above).
 */
const ADD_COUNTERS_OPERANDS = [
  // Lulu, Stern Guardian: "put a stun counter on target creature attacking you" (before the plain target, which would stop at "creature").
  'noun.target-creature-attacking-you-plain',
  // Persistent Constrictor: "put a -1/-1 counter on up to one target creature they control", before the plain target, which would stop at "creature".
  'noun.target-permanent-of-that-player',
  ...COUNTER_OPERANDS,
  // "Choose target creature attacking you. Put a stun counter on that creature.": the object the sentence before named (CR 608.2c).
  'noun.that-object',
  // Agitator Ant: "a creature they control", the creature the asked player chooses (before the plain "a creature", which would stop at "they").
  'noun.a-permanent-they-control',
  'noun.a-permanent',
  // "each of up to two Soldiers you control": a resolving choice of up to that many.
  'noun.each-of-up-to-permanents',
] as const;

/**
 * "each of those creatures" after "put a +1/+1 counter on" (Unbreakable Formation, CR 608.2c): the group the sentence before named, bound like "each of them" to the most recent plural
 * group of the text. Read here, with the one verb that needs it, and not as a noun of its own: the same words say the creature a soulbond pair is with (`noun.paired-creatures`).
 */
const EACH_OF_THOSE_CREATURES: Parser<IrNoun> = map(
  spanned(pattern(/each of those creatures(?![\p{L}\p{N}'’])/iu)),
  ({ span }): IrNoun => ({
    kind: 'noun',
    det: 'anaphor',
    // The binding pass reads these words: the plural antecedent, as it reads "each of them".
    filter: { raw: 'each of them' },
    upTo: false,
    plural: true,
    other: false,
    span,
    rule: 'effect.add-counters',
  }),
);

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
    // Lulu, Stern Guardian (CR 608.2c, 508.1b): the object an earlier sentence named, and a target attacking you.
    'put a stun counter on that creature',
    'put a stun counter on target creature attacking you',
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
    'put a +1/+1 counter on each of up to two Soldiers you control',
    'put a +1/+1 counter on that creature',
    // Unbreakable Formation (CR 608.2c): the group the sentence before named.
    'put a +1/+1 counter on each of those creatures',
  ],
  rejects: [
    'you put two +1/+1 counters on target creature and draw a card',
    'put X +1/+1 counters on it for each time it was kicked',
    'put a +1/+1 counter on it for each time',
    'put a +1/+1 counter on it for each creature',
    'put a +1/+1 counter on that creatures',
    'put a +1/+1 counter on each of those',
    'put a +1/+1 counter on each of those creature',
    'put a +1/+1 counter on each of those permanents',
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
        choice<IrNoun | IrNounList>(
          operands(ADD_COUNTERS_OPERANDS, 'effect.add-counters'),
          EACH_OF_THOSE_CREATURES,
        ),
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

/**
 * `effect.add-counters-two-groups`: "put a +1/+1 counter on each creature you control and a loyalty counter on each other planeswalker you control" (Ajani Steadfast; CR 122.6, 306.5b):
 * two instructions about two groups, each with its own counter. Two clauses of `addCounters`, joined by "and". Only "a" counter on "each" group of permanents (`noun.each-permanent`),
 * each as `effect.add-counters` reads it. Not read: three groups, a number other than "a", a target, "for each".
 */
export const EFFECT_ADD_COUNTERS_TWO_GROUPS = defineRule<Clauses>({
  id: 'effect.add-counters-two-groups',
  family: 'effect',
  leading: ['put'],
  cites: [
    'CR 122.6 (Counters)',
    'CR 306.5b (Planeswalkers)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'put a +1/+1 counter on each creature you control and a loyalty counter on each other planeswalker you control',
    'put a +1/+1 counter on each creature you control and a +1/+1 counter on each planeswalker you control',
  ],
  rejects: [
    'put a +1/+1 counter on each creature you control',
    'put a +1/+1 counter on each creature you control and a loyalty counter on target planeswalker',
    'put a +1/+1 counter on each creature you control and two loyalty counters on each other planeswalker you control',
    'put a +1/+1 counter on each creature you control and a loyalty counter on each other planeswalker you control and a charge counter on each artifact you control',
    'put a +1/+1 counter on each creature you control and draw a card',
    'put a +1/+1 counter on each creature you control, and a loyalty counter on each other planeswalker you control',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.add-counters-two-groups';
    const one = (lead: Parser<unknown>) =>
      sequence(
        lead,
        family<IrAmount>('amount', { only: ['amount.article'] }),
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
        pattern(/ counter on /i),
        operands(['noun.each-permanent'], id),
      );
    const r = sequence(one(literal('put ')), one(literal(' and ')))(ctx, pos);
    if (!r.ok) return r;
    const [first, second] = r.value;
    const clause = (part: typeof first, last: boolean) => ({
      ...makeClause(
        id,
        'addCounters',
        { count: part[1], counter: part[3], objects: part[5] },
        { start: pos, end: r.pos },
      ),
      ...(last ? {} : { connector: 'and' as const }),
    });
    return { ok: true, value: [clause(first, false), clause(second, true)], pos: r.pos };
  },
});

/** The objects the counters of a kind can be doubled on: this permanent, "it", a target, or a group as the effect resolves. */
const DOUBLE_COUNTER_OPERANDS = [
  'noun.self',
  'noun.it',
  'noun.target-permanent',
  'noun.each-permanent',
  'noun.all-permanents',
  // Quandrix Unlimited deck, group D2 (Kinetic Ooze): "any number of other target creatures".
  'noun.any-number-targets',
] as const;

/**
 * `effect.double-counters`: "double the number of +1/+1 counters on target creature you control" (CR 701.10 Double, 122.6): each object gets as
 * many more counters of the kind as it has as the effect resolves. The counters are put by the controller of the spell or ability, so they go
 * through the same placement as "put a +1/+1 counter on" does. Not read: a doubling of a quantity that is not a counter kind ("double the
 * number of counters" with no kind, which is every kind) or one with a trailing clause.
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
    'double the number of +1/+1 counters on any number of other target creatures',
    'double the number of each kind of counter on target creature',
    'double the number of each kind of counter on ~',
  ],
  rejects: [
    'double the number of counters on target creature',
    'double the number of each kind of counter',
    'double the number of each kind of counters on target creature',
    'double the number of +1/+1 counters on target creature you control and draw a card',
    'double the number of +1/+1 counters on',
    'double the number of +1/+1 counters',
    'double the +1/+1 counters on ~',
    'double the number of +1/+1 counters on ~ until end of turn',
    'double the power and toughness of ~ until end of turn',
  ],
  parse: single(
    'effect.double-counters',
    sequence(
      literal('double the number of '),
      choice(
        map(
          sequence(
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
          ),
          ([counter]) => counter,
        ),
        // "each kind of counter on target creature" (Ferrafor, CR 701.10, 122.1): every kind the object has, so no counter kind is named.
        map(pattern(/each kind of counter on /i), () => null),
      ),
      operands(DOUBLE_COUNTER_OPERANDS, 'effect.double-counters'),
    ),
    ([, counter, objects]) => ({
      verb: 'doubleCounters',
      args: counter === null ? { objects } : { counter, objects },
    }),
  ),
});

/**
 * `effect.double-player-counters`: "double the number of each kind of counter you have" (issue 105, Aetheric Amplifier; CR 701.10, 122.1: the player puts as many counters of each kind as they
 * have of it, the counters a player has being poison, energy and experience counters). Not read: a kind of counter named, another player, "on target player", a following clause.
 */
export const EFFECT_DOUBLE_PLAYER_COUNTERS = defineRule<Clauses>({
  id: 'effect.double-player-counters',
  family: 'effect',
  leading: ['double'],
  cites: ['CR 701.10 (Double)', 'CR 122.1 (Counters)', 'CR 122.6 (Counters)'],
  examples: ['double the number of each kind of counter you have'],
  rejects: [
    'double the number of each kind of counter on target creature',
    'double the number of each kind of counter',
    'double the number of +1/+1 counters you have',
    'double the number of each kind of counter that player has',
    'double the number of each kind of counter you have and draw a card',
    'double the number of each kind of counters you have',
    'doubles the number of each kind of counter you have',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/double the number of each kind of counter you have(?![\p{L}\p{N}])/iu)(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: [
        makeClause(
          'effect.double-player-counters',
          'doublePlayerCounters',
          { player: impliedYou('effect.double-player-counters', pos) },
          { start: pos, end: r.pos },
        ),
      ],
      pos: r.pos,
    };
  },
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
    // Issue 145 (Gruff Triplets): the amount before the objects.
    'put a number of +1/+1 counters equal to its power on each creature you control',
    'put a number of +1/+1 counters equal to the number of creatures you control on ~',
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
    'put a number of +1/+1 counters equal to its power on a creature you control',
    'put a number of +1/+1 counters equal to its power',
    'put a number of +1/+1 counters equal to 3 on ~',
  ],
  parse: single(
    'effect.add-counters-number-of',
    choice(
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
      // Issue 145 (Gruff Triplets): "put a number of +1/+1 counters equal to its power on each creature you control named ~": the amount before the objects.
      map(
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
          pattern(/ counters /i),
          family<IrAmount>('amount', { only: EQUAL_AMOUNTS }),
          literal(' on '),
          operands(COUNTER_OPERANDS, 'effect.add-counters-number-of'),
        ),
        ([put, counter, counters, count, on, objects]): [
          string,
          IrCounterSpec,
          RegExpExecArray,
          IrNoun | IrNounList,
          string,
          IrAmount,
        ] => [put, counter, counters, objects, on, count],
      ),
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
 * `effect.add-counters-self-and-other`: "Put a +1/+1 counter on ~ and a +1/+1 counter on up to one target commander creature you control" (issue 345, Drillworks Mole; CR 122.6,
 * 608.2c, 115.1): two instructions of one sentence, a counter on the permanent itself and then one on a target (or on up to one target, which may be none, CR 601.2c). Only "a"
 * before each counter and "~" first. Not read: another first object, a count of two, a list of three, a trailing clause.
 */
export const EFFECT_ADD_COUNTERS_SELF_AND_OTHER = defineRule<Clauses>({
  id: 'effect.add-counters-self-and-other',
  family: 'effect',
  leading: ['put'],
  cites: [
    'CR 122.6 (Counters)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 115.1 (Targets)',
  ],
  examples: [
    'put a +1/+1 counter on ~ and a +1/+1 counter on target creature you control',
    'put a +1/+1 counter on ~ and a +1/+1 counter on up to one target creature you control',
    'put a +1/+1 counter on ~ and a charge counter on up to one target commander creature you control',
  ],
  rejects: [
    'put a +1/+1 counter on ~ and a +1/+1 counter on',
    'put a +1/+1 counter on ~ and a +1/+1 counter on ~',
    'put a +1/+1 counter on it and a +1/+1 counter on target creature you control',
    'put two +1/+1 counters on ~ and a +1/+1 counter on target creature you control',
    'put a +1/+1 counter on ~ and two +1/+1 counters on target creature you control',
    'put a +1/+1 counter on ~ and a +1/+1 counter on target creature you control and draw a card',
    'put a +1/+1 counter on ~ and a +1/+1 counter on each creature you control',
  ],
  parse: (ctx, pos) => {
    const item = (rule: string) =>
      map(
        spanned(pattern(COUNTER_NAME)),
        ({ value, span }): IrCounterSpec => ({
          kind: 'counterSpec',
          name: value[0].toLowerCase(),
          span,
          rule,
        }),
      );
    const id = 'effect.add-counters-self-and-other';
    const r = sequence(
      literal('put a '),
      item(id),
      literal(' counter on '),
      family<IrNoun>('noun', { only: ['noun.self'] }),
      literal(' and a '),
      item(id),
      literal(' counter on '),
      family<IrNoun>('noun', { only: ['noun.target-permanent', 'noun.up-to-one-permanent'] }),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, first, , self, , second, , other] = r.value;
    const span = { start: pos, end: r.pos };
    const one = (counter: IrCounterSpec, objects: IrNoun) =>
      makeClause(
        id,
        'addCounters',
        { count: { kind: 'number', value: 1, span: counter.span }, counter, objects },
        span,
      );
    return { ok: true, value: [one(first, self), one(second, other)], pos: r.pos };
  },
});

/**
 * `effect.add-counters-other-and-self`: "Put a +1/+1 counter on target creature you control and a plan counter on ~" (issue 345, Claim the Kingdom; CR 122.6, 608.2c, 115.1): the
 * two instructions of `effect.add-counters-self-and-other` the other way round, a counter on a target and then one on the permanent itself. Only "a" before each counter, a single
 * target and "~" last. Not read: another last object, a count of two, a list of three, a trailing clause.
 */
export const EFFECT_ADD_COUNTERS_OTHER_AND_SELF = defineRule<Clauses>({
  id: 'effect.add-counters-other-and-self',
  family: 'effect',
  leading: ['put'],
  cites: [
    'CR 122.6 (Counters)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 115.1 (Targets)',
  ],
  examples: [
    'put a +1/+1 counter on target creature you control and a plan counter on ~',
    'put a +1/+1 counter on up to one target creature and a charge counter on ~',
  ],
  rejects: [
    'put a +1/+1 counter on target creature you control and a plan counter on',
    'put a +1/+1 counter on target creature you control and a plan counter on target creature',
    'put a +1/+1 counter on target creature you control and two plan counters on ~',
    'put two +1/+1 counters on target creature you control and a plan counter on ~',
    'put a +1/+1 counter on target creature you control and a plan counter on ~ and draw a card',
    'put a +1/+1 counter on each creature you control and a plan counter on ~',
    'put a +1/+1 counter on ~ and a plan counter on ~',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.add-counters-other-and-self';
    const item = map(
      spanned(pattern(COUNTER_NAME)),
      ({ value, span }): IrCounterSpec => ({
        kind: 'counterSpec',
        name: value[0].toLowerCase(),
        span,
        rule: id,
      }),
    );
    const r = sequence(
      literal('put a '),
      item,
      literal(' counter on '),
      family<IrNoun>('noun', { only: ['noun.target-permanent', 'noun.up-to-one-permanent'] }),
      literal(' and a '),
      item,
      literal(' counter on '),
      family<IrNoun>('noun', { only: ['noun.self'] }),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, first, , other, , second, , self] = r.value;
    const span = { start: pos, end: r.pos };
    const one = (counter: IrCounterSpec, objects: IrNoun) =>
      makeClause(
        id,
        'addCounters',
        { count: { kind: 'number', value: 1, span: counter.span }, counter, objects },
        span,
      );
    return { ok: true, value: [one(first, other), one(second, self)], pos: r.pos };
  },
});

/**
 * `effect.add-counters-distinct-targets`: "Put a -1/-1 counter on target creature, two -1/-1 counters on another target creature, and three -1/-1 counters on a third target
 * creature" (Incremental Blight; CR 122.6, 608.2c, 115.1, 115.3): two or three instructions of one sentence, each its own number of counters of its own kind on its own target.
 * "Another" and "a third" make each target differ from the ones before it (a target noun without them may share a target). Only a target creature or permanent of one kind of noun
 * each, "target ..." first, "another target ..." second and, with three, "a third target ..." last. Not read: another order or number of items, a plain "target" after the first,
 * "a second target", a trailing clause, objects that are not a single target.
 */
export const EFFECT_ADD_COUNTERS_DISTINCT_TARGETS = defineRule<Clauses>({
  id: 'effect.add-counters-distinct-targets',
  family: 'effect',
  leading: ['put'],
  cites: [
    'CR 122.6 (Counters)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 115.3 (Targets)',
  ],
  examples: [
    'put a -1/-1 counter on target creature, two -1/-1 counters on another target creature, and three -1/-1 counters on a third target creature',
    'put a +1/+1 counter on target creature and two +1/+1 counters on another target creature',
    'put a -1/-1 counter on target creature, a +1/+1 counter on another target creature, and a charge counter on a third target permanent',
  ],
  rejects: [
    'put a -1/-1 counter on target creature, two -1/-1 counters on target creature, and three -1/-1 counters on a third target creature',
    'put a -1/-1 counter on target creature, two -1/-1 counters on another target creature, and three -1/-1 counters on target creature',
    'put a -1/-1 counter on target creature, two -1/-1 counters on another target creature, and three -1/-1 counters on a second target creature',
    'put a -1/-1 counter on target creature, two -1/-1 counters on a third target creature',
    'put a -1/-1 counter on target creature and two -1/-1 counters on a third target creature',
    'put a -1/-1 counter on another target creature, two -1/-1 counters on another target creature',
    'put a -1/-1 counter on target creature, two -1/-1 counters on another target creature, and three -1/-1 counters on a third target creature and draw a card',
    'put a -1/-1 counter on target creature and two -1/-1 counters on another target creature, and three -1/-1 counters on a third target creature',
    'put a -1/-1 counter on target creature, two -1/-1 counters on another target creatures',
    'put a -1/-1 counter on up to one target creature and two -1/-1 counters on another target creature',
    'put a -1/-1 counter on target creature, two -1/-1 counters on another target creature, three -1/-1 counters on a third target creature, and four -1/-1 counters on a fourth target creature',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.add-counters-distinct-targets';
    type Item = readonly [readonly [IrAmount, IrCounterSpec], IrNoun];
    const oneTarget = (noun: IrNoun) =>
      noun.det === 'target' &&
      !noun.plural &&
      !noun.upTo &&
      noun.anyNumber !== true &&
      noun.filter.player === undefined &&
      noun.filter.anyTarget !== true;
    const counters = (): Parser<[IrAmount, IrCounterSpec]> =>
      map(
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
    const plain = satisfy(
      family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
      (n) => oneTarget(n) && !n.other,
    );
    const another = map(
      satisfy(
        family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
        (n) => oneTarget(n) && n.other,
      ),
      (n): IrNoun => ({ ...n, other: false, otherTarget: true, otherTargetAll: true }),
    );
    const third = map(
      sequence(
        literal('a third '),
        satisfy(
          family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
          (n) => oneTarget(n) && !n.other,
        ),
      ),
      ([, n]): IrNoun => ({ ...n, otherTarget: true, otherTargetAll: true }),
    );
    const first = sequence(literal('put '), counters(), plain)(ctx, pos);
    if (!first.ok) return first;
    const rest = choice(
      // Two items: "..., and two ... on another target creature".
      map(sequence(literal(' and '), counters(), another), ([, c, n]): readonly Item[] => [[c, n]]),
      // Three: ", two ... on another target creature, and three ... on a third target creature".
      map(
        sequence(literal(', '), counters(), another, literal(', and '), counters(), third),
        ([, c2, n2, , c3, n3]): readonly Item[] => [
          [c2, n2],
          [c3, n3],
        ],
      ),
    )(ctx, first.pos);
    if (!rest.ok) return rest;
    const span = { start: pos, end: rest.pos };
    const items: readonly Item[] = [[first.value[1], first.value[2]], ...rest.value];
    return {
      ok: true,
      value: items.map(([[count, counter], objects]) =>
        makeClause(id, 'addCounters', { count, counter, objects }, span),
      ),
      pos: rest.pos,
    };
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
  // Before the plain rule, which would read the first instruction and leave the rest of the sentence unread.
  EFFECT_ADD_COUNTERS_DISTINCT_TARGETS,
  // Before the plain rule, which would read the first half and leave " and a +1/+1 counter on ..." unread.
  EFFECT_ADD_COUNTERS_SELF_AND_OTHER,
  EFFECT_ADD_COUNTERS_OTHER_AND_SELF,
  EFFECT_ADD_COUNTERS_TWO_GROUPS,
  EFFECT_ADD_COUNTERS,
  EFFECT_DOUBLE_COUNTERS,
  EFFECT_DOUBLE_PLAYER_COUNTERS,
  EFFECT_ADD_COUNTERS_NUMBER_OF,
  EFFECT_ADD_COUNTERS_KINDS,
];
