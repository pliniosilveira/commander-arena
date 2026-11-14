/**
 * Effect rules of the Vraska deck (stage P50, D-207): "remove all counters from it" (CR 122.1, 122.2).
 */
import { fail, literal, map, type Parser, pattern, sequence } from '../../combinators';
import type {
  IrAmount,
  IrClause,
  IrCondition,
  IrCounterSpec,
  IrDuration,
  IrNoun,
} from '../../ir/types';
import { permanentPhrase } from '../noun/phrases';
import { defineRule, family, quietly, spanned } from '../registry';
import { readQuotedAbility } from '../static/quoted';
import { flag } from './dragons';
import { gainParser } from './gain';
import { type Clauses, makeClause, operands, single } from './operands';
import { GAIN_SUBJECTS } from './pump';

/**
 * `effect.remove-all-counters`: "remove all counters from it", "remove all counters from target creature" (CR 122.1, 122.2: every counter of every kind comes off).
 * The engine's `removeAllCounters`. Not read: a kind of counter ("remove all +1/+1 counters"), "a counter", a number of counters, "each".
 */
export const EFFECT_REMOVE_ALL_COUNTERS = defineRule<Clauses>({
  id: 'effect.remove-all-counters',
  family: 'effect',
  leading: ['remove'],
  cites: ['CR 122.1 (Counters)', 'CR 122.2 (Counters)'],
  examples: [
    'remove all counters from it',
    'remove all counters from target creature',
    'remove all counters from ~',
    'Remove all counters from target permanent',
  ],
  rejects: [
    'remove all +1/+1 counters from it',
    'remove a counter from it',
    'remove two counters from it',
    'remove all counters',
    'remove all counters from',
    'remove all counters from each creature',
    'remove counters from it',
  ],
  parse: single(
    'effect.remove-all-counters',
    sequence(
      literal('remove all counters from '),
      operands(
        ['noun.self', 'noun.it', 'noun.target-permanent', 'noun.attached-permanent'],
        'effect.remove-all-counters',
      ),
    ),
    ([, objects]) => ({ verb: 'removeAllCounters', args: { objects } }),
  ),
});

/** "for as long as ~ remains on the battlefield" (CR 611.2b): the duration of an effect of an ability of a permanent, which ends as the permanent leaves. */
const WHILE_REMAINS: Parser<IrDuration> = map(
  spanned(literal('for as long as ~ remains on the battlefield')),
  ({ span }): IrDuration => ({
    kind: 'duration',
    scope: 'whileSelfRemains',
    span,
    rule: 'effect.gain-keyword-while-remains',
  }),
);

/**
 * `effect.gain-keyword-while-remains`: "target creature you control gains hexproof for as long as ~ remains on the battlefield" (stage P50, D-207, CR 611.2b,
 * 613.1f: a keyword the creature has while the permanent with the ability is on the battlefield; the Saga that leaves ends it). The subjects of
 * `effect.gain-keyword`. Not read: "until end of turn", "for as long as you control ~", a plural subject, another permanent that remains.
 */
export const EFFECT_GAIN_KEYWORD_WHILE_REMAINS = quietly(
  defineRule<Clauses>({
    id: 'effect.gain-keyword-while-remains',
    family: 'effect',
    leading: ['target', '~', 'it', 'that'],
    cites: [
      'CR 611.2b (Continuous Effects)',
      'CR 613.1f (Interaction of Continuous Effects)',
      'CR 702.11 (Hexproof)',
    ],
    examples: [
      'target creature you control gains hexproof for as long as ~ remains on the battlefield',
      'target creature gains flying for as long as ~ remains on the battlefield',
    ],
    rejects: [
      'target creature you control gains hexproof for as long as ~ remains',
      'target creature you control gains hexproof for as long as you control ~',
      'target creature you control gains hexproof until end of turn',
      'target creature you control gains hexproof for as long as ~ remains on the battlefield and draws a card',
      'target creatures you control gain hexproof for as long as ~ remains on the battlefield',
      'target creature you control gets +1/+1 for as long as ~ remains on the battlefield',
    ],
    parse: gainParser(
      'effect.gain-keyword-while-remains',
      GAIN_SUBJECTS,
      false,
      undefined,
      WHILE_REMAINS,
    ),
  }),
);

/** "for as long as you control ~" (CR 611.2b, stage P68, D-229): the duration of an effect of an ability of a permanent, which ends as it leaves or changes controller. */
const WHILE_CONTROLLING: Parser<IrDuration> = map(
  spanned(literal('for as long as you control ~')),
  ({ span }): IrDuration => ({
    kind: 'duration',
    scope: 'whileYouControlSelf',
    span,
    rule: 'effect.gain-keyword-while-controlling',
  }),
);

/**
 * `effect.gain-keyword-while-controlling`: "another target legendary permanent you control gains indestructible for as long as you control ~" (stage P68, D-229,
 * CR 611.2b, 613.1f: the keyword lasts while the permanent with the ability is on the battlefield under your control). The subjects of `effect.gain-keyword`.
 * Not read: "until end of turn", "for as long as ~ remains on the battlefield", a plural subject, another permanent that you control.
 */
export const EFFECT_GAIN_KEYWORD_WHILE_CONTROLLING = quietly(
  defineRule<Clauses>({
    id: 'effect.gain-keyword-while-controlling',
    family: 'effect',
    leading: ['target', '~', 'it', 'that', 'another'],
    cites: [
      'CR 611.2b (Continuous Effects)',
      'CR 613.1f (Interaction of Continuous Effects)',
      'CR 702.12 (Indestructible)',
    ],
    examples: [
      'target creature you control gains indestructible for as long as you control ~',
      'another target legendary permanent you control gains indestructible for as long as you control ~',
    ],
    rejects: [
      'target creature you control gains indestructible for as long as you control',
      'target creature you control gains indestructible for as long as ~ remains on the battlefield',
      'target creature you control gains indestructible until end of turn',
      'target creature you control gains indestructible for as long as you control ~ and draws a card',
      'target creatures you control gain indestructible for as long as you control ~',
      'target creature you control gets +1/+1 for as long as you control ~',
      'target creature you control gains indestructible for as long as you control a Dragon',
    ],
    parse: gainParser(
      'effect.gain-keyword-while-controlling',
      GAIN_SUBJECTS,
      false,
      undefined,
      WHILE_CONTROLLING,
    ),
  }),
);

/**
 * `effect.put-exiled-with`: "put a card exiled with ~ into its owner's graveyard" (stage P50, D-207, CR 607.2a, 406.3, 400.3): the controller chooses one of the
 * cards the permanent exiled with its linked ability that are still in exile, and it goes to its owner's graveyard. The engine's `moveToZone` of a choice
 * among the linked exile. Not read: "all cards", a number, another zone, a card exiled with another permanent.
 */
export const EFFECT_PUT_EXILED_WITH = defineRule<Clauses>({
  id: 'effect.put-exiled-with',
  family: 'effect',
  leading: ['put'],
  cites: ['CR 607.2a (Linked Abilities)', 'CR 406.3 (Exile)', 'CR 400.3 (General)'],
  examples: ["put a card exiled with ~ into its owner's graveyard"],
  rejects: [
    "put all cards exiled with ~ into their owners' graveyards",
    "put a card exiled with ~ into its owner's hand",
    'put a card exiled with ~ into your graveyard',
    "put two cards exiled with ~ into its owner's graveyard",
    'put a card exiled with ~ onto the battlefield',
    "put a card exiled with this card into its owner's graveyard",
    'put a card exiled with ~',
  ],
  parse: single(
    'effect.put-exiled-with',
    literal("put a card exiled with ~ into its owner's graveyard"),
    () => ({ verb: 'putExiledWith', args: {} }),
  ),
});

/**
 * `effect.choose-target`: "choose target commander that entered this turn" (group 4 of the Vraska deck, CR 115.1, 601.2c, 602.2b: the target is chosen as the
 * ability is put on the stack; the words only name it for the sentences after, which say "it"). The engine's target of the ability, with no effect of its own.
 * Not read: "choose" without a target, a number of targets, a player, "choose one".
 */
export const EFFECT_CHOOSE_TARGET = defineRule<Clauses>({
  id: 'effect.choose-target',
  family: 'effect',
  leading: ['choose'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 601.2c (Casting Spells)',
    'CR 602.2b (Activating Activated Abilities)',
  ],
  examples: [
    'choose target commander that entered this turn',
    'choose target creature',
    'choose target permanent',
  ],
  rejects: [
    'choose',
    'choose a creature',
    'choose target',
    'choose two target creatures',
    'choose target player',
    'choose one',
    'choose target creature and draw a card',
    'choose up to one target creature',
  ],
  parse: single(
    'effect.choose-target',
    sequence(
      literal('choose '),
      operands(['noun.target-commander', 'noun.target-permanent'], 'effect.choose-target', {
        // One target, not "two target creatures" or "up to one target creature": the sentences after say "it".
        accept: (noun) =>
          !noun.plural && !noun.upTo && noun.count === undefined && noun.anyNumber === undefined,
        locate: (noun) => noun.span.start,
      }),
    ),
    ([, what]) => ({ verb: 'chooseTarget', args: { what } }),
  ),
});

/** "a +1/+1 counter on it if it's a creature", with or without the "put": one instruction that runs only when the object is of that kind (CR 608.2c). */
function countersIfIt(id: string, put: boolean): Parser<IrClause> {
  return (ctx, pos) => {
    const r = sequence(
      put ? literal('put ') : (_ctx, at) => ({ ok: true as const, value: '', pos: at }),
      family<IrAmount>('amount', { only: ['amount.number', 'amount.article'] }),
      literal(' '),
      map(
        spanned(pattern(/[+-]\d+\/[+-]\d+|[a-z]+/i)),
        ({ value, span }): IrCounterSpec => ({
          kind: 'counterSpec',
          name: value[0].toLowerCase(),
          span,
          rule: id,
        }),
      ),
      pattern(/ counters? on /i),
      operands(['noun.it'], id),
      literal(' if '),
      family<IrCondition>('condition', { only: ['condition.it-matches'] }),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, count, , counter, , objects, , condition] = r.value;
    return {
      ok: true,
      value: {
        ...makeClause(id, 'addCounters', { count, counter, objects }, { start: pos, end: r.pos }),
        condition,
      },
      pos: r.pos,
    };
  };
}

/**
 * `effect.counters-if-it-is`: "put a +1/+1 counter on it if it's a creature and a loyalty counter on it if it's a planeswalker" (group 4 of the Vraska deck,
 * CR 122.1, 608.2c: each counter is put on the object only if it is of the kind the words after it say, as the instruction comes up, so an object of both
 * kinds gets both). One or two instructions, each with its own test of the object ("it", a target of the sentence before). The engine's `conditional` of
 * `addCounters`. Not read: a test without "it's a", "it" that is not an object, a third instruction, counters of a number.
 */
export const EFFECT_COUNTERS_IF_IT_IS = defineRule<Clauses>({
  id: 'effect.counters-if-it-is',
  family: 'effect',
  leading: ['put'],
  cites: [
    'CR 122.1 (Counters)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 205.2 (Card Types)',
  ],
  examples: [
    "put a +1/+1 counter on it if it's a creature and a loyalty counter on it if it's a planeswalker",
    "put a +1/+1 counter on it if it's a creature",
    "put a loyalty counter on it if it's a planeswalker",
    'put a +1/+1 counter on it if it’s a creature and a loyalty counter on it if it’s a planeswalker',
  ],
  rejects: [
    'put a +1/+1 counter on it',
    "put a +1/+1 counter on it if it's a creature and",
    "put a +1/+1 counter on it if it's a creature and a loyalty counter on it",
    "put a +1/+1 counter on ~ if it's a creature",
    "put a +1/+1 counter on it if it's tapped",
    "put a +1/+1 counter on it if it's a creature and a loyalty counter on it if it's a planeswalker and a charge counter on it if it's an artifact",
    "put a +1/+1 counter on it if it's a creature, then draw a card",
    "put X +1/+1 counters on it if it's a creature",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.counters-if-it-is';
    const first = countersIfIt(id, true)(ctx, pos);
    if (!first.ok) return first;
    const more = sequence(literal(' and '), countersIfIt(id, false))(ctx, first.pos);
    if (!more.ok) return { ok: true, value: [first.value], pos: first.pos };
    return {
      ok: true,
      value: [{ ...first.value, connector: 'and' as const }, more.value[1]],
      pos: more.pos,
    };
  },
});

/**
 * `effect.connive`: "up to one target creature you control connives", "~ connives", "it connives" (CR 701.50a: the controller of the permanent draws a card, then discards
 * a card, and puts a +1/+1 counter on it if the card discarded is a nonland card; stage P51, D-209). The engine's `connive`. Not read: "connive 2", "connives" alone, a
 * player as the subject, "each creature you control connives", "connives, then ...".
 */
export const EFFECT_CONNIVE = defineRule<Clauses>({
  id: 'effect.connive',
  family: 'effect',
  leading: ['up', 'target', '~', 'it', 'that'],
  cites: ['CR 701.50a (Connive)', 'CR 701.50f (Connive)', 'CR 121.1 (Drawing a Card)'],
  examples: [
    'up to one target creature you control connives',
    'target creature you control connives',
    '~ connives',
    'it connives',
  ],
  rejects: [
    'connives',
    'target creature you control connive',
    'up to one target creature you control connives 2',
    'each creature you control connives',
    'target player connives',
    'target creature you control connives and draws a card',
    'you connive',
  ],
  parse: single(
    'effect.connive',
    sequence(
      operands(['noun.self', 'noun.it', 'noun.target-permanent'], 'effect.connive'),
      pattern(/ connives(?![\p{L}\p{N}])/iu),
    ),
    ([objects]) => ({ verb: 'connive', args: { objects } }),
  ),
});

/**
 * `effect.become-copy`: "have ~ become a copy of another target creature you control until end of turn, except its name is ~" (stage P53, D-212, CR 707.2, 707.9a,
 * 611.2a, 613.2a: this permanent gets the copiable values of the target as they are when the instruction runs, keeps its own name, for the turn). The text after
 * "you may" of the sentence; the engine's `becomeCopy` with `keepName`. Not read: a copy of "any creature", "until your next turn", an exception besides the name, a
 * subject that is not this permanent.
 */
export const EFFECT_BECOME_COPY = defineRule<Clauses>({
  id: 'effect.become-copy',
  family: 'effect',
  leading: ['have'],
  cites: [
    'CR 707.2 (Copying Objects)',
    'CR 707.9a (Copying Objects)',
    'CR 613.2a (Interaction of Continuous Effects)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: [
    'have ~ become a copy of another target creature you control until end of turn, except its name is ~',
    'have ~ become a copy of target creature until end of turn, except its name is ~',
  ],
  rejects: [
    'have ~ become a copy of another target creature you control until end of turn',
    'have ~ become a copy of another target creature you control, except its name is ~',
    'have ~ become a copy of another target creature you control until your next turn, except its name is ~',
    'have ~ become a copy of another target creature you control until end of turn, except it has haste',
    'have ~ become a copy of another target creature you control until end of turn, except its name is Bob',
    'have it become a copy of another target creature you control until end of turn, except its name is ~',
    'have ~ become a copy of any creature until end of turn, except its name is ~',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.become-copy';
    const r = sequence(
      literal('have '),
      family<IrNoun>('noun', { only: ['noun.self'] }),
      literal(' become a copy of '),
      family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
      literal(' '),
      family<IrDuration>('duration'),
      spanned(literal(', except its name is ~')),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, objects, , of, , duration, except] = r.value;
    if (duration.scope !== 'untilEndOfTurn' || of.det !== 'target') return fail(ctx, pos);
    const clause = makeClause(
      id,
      'becomeCopy',
      { objects, of, keepName: flag(id, true, except.span) },
      { start: pos, end: r.pos },
    );
    return { ok: true, value: [{ ...clause, duration }], pos: r.pos };
  },
});

/**
 * `effect.target-becomes-copy`: "target artifact you control becomes a copy of another target artifact or creature you control until end of turn, except it's an
 * artifact in addition to its other types" (stage P64, D-217, CR 707.2, 707.9b, 611.2a, 613.2a): the first target gets the copiable values of the second as they are
 * when the instruction runs, with the exception that it is also an artifact. The engine's `becomeCopy` with `addTypes`. Not read: another exception, a duration other
 * than until end of turn, "any" for the copied, a second target that is not "another", the exception without its object.
 */
export const EFFECT_TARGET_BECOMES_COPY = quietly(
  defineRule<Clauses>({
    id: 'effect.target-becomes-copy',
    family: 'effect',
    leading: ['target'],
    cites: [
      'CR 707.2 (Copying Objects)',
      'CR 707.9b (Copying Objects)',
      'CR 613.2a (Interaction of Continuous Effects)',
      'CR 611.2a (Continuous Effects)',
    ],
    examples: [
      "target artifact you control becomes a copy of another target artifact or creature you control until end of turn, except it's an artifact in addition to its other types",
      'target artifact you control becomes a copy of another target creature you control until end of turn, except it’s an artifact in addition to its other types',
    ],
    rejects: [
      'target artifact you control becomes a copy of another target artifact or creature you control until end of turn',
      "target artifact you control becomes a copy of another target artifact or creature you control, except it's an artifact in addition to its other types",
      "target artifact you control becomes a copy of another target artifact or creature you control until your next turn, except it's an artifact in addition to its other types",
      "target artifact you control becomes a copy of target artifact or creature you control until end of turn, except it's an artifact in addition to its other types",
      "target artifact you control becomes a copy of another target artifact or creature you control until end of turn, except it's a creature in addition to its other types",
      'target artifact you control becomes a copy of another target artifact or creature you control until end of turn, except its name is ~',
      "target artifact you control become a copy of another target artifact or creature you control until end of turn, except it's an artifact in addition to its other types",
    ],
    parse: (ctx, pos) => {
      const id = 'effect.target-becomes-copy';
      const r = sequence(
        family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
        literal(' becomes a copy of '),
        family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
        literal(' '),
        family<IrDuration>('duration'),
        spanned(
          pattern(/, except it['’]s an artifact in addition to its other types(?![\p{L}\p{N}])/iu),
        ),
      )(ctx, pos);
      if (!r.ok) return r;
      const [objects, , of, , duration, except] = r.value;
      if (
        duration.scope !== 'untilEndOfTurn' ||
        of.det !== 'target' ||
        !of.other ||
        objects.det !== 'target' ||
        objects.other
      ) {
        return fail(ctx, pos);
      }
      const clause = makeClause(
        id,
        'becomeCopy',
        { objects, of: { ...of, otherTarget: true }, addArtifact: flag(id, true, except.span) },
        { start: pos, end: r.pos },
      );
      return { ok: true, value: [{ ...clause, duration }], pos: r.pos };
    },
  }),
);

/**
 * `effect.gain-each-of-two`: "~ and that creature each get +2/+0 and gain haste until end of turn and attack this turn if able" (stage P53, D-212, CR 611.2a, 613.4c,
 * 702.10, 508.1d: the same pump, keywords and requirement of two permanents the text names). The subject is a list of nouns followed by "each", read as the plural
 * subject of `effect.gain-keyword`; the clauses are those of one sentence about each. Not read: one subject, three subjects, a subject without "each", the singular verb.
 */
export const EFFECT_GAIN_EACH_OF_TWO = defineRule<Clauses>({
  id: 'effect.gain-each-of-two',
  family: 'effect',
  leading: ['~', 'target', 'another', 'it', 'that'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 613.4c (Interaction of Continuous Effects)',
    'CR 702.10 (Haste)',
    'CR 508.1d (Declare Attackers Step)',
  ],
  examples: [
    '~ and that creature each get +2/+0 and gain haste until end of turn and attack this turn if able',
    '~ and target creature each gain haste until end of turn',
    '~ and that creature each get +1/+1 and gain flying until end of turn',
  ],
  rejects: [
    '~ and that creature get +2/+0 until end of turn',
    '~ each get +2/+0 until end of turn',
    '~ and that creature each gets +2/+0 until end of turn',
    '~ and that creature each get +2/+0',
    '~ and that creature each get +2/+0 until end of turn',
    '~ and that creature each get +2/+0 until your next turn',
    '~, that creature and target creature each get +2/+0 until end of turn',
    '~ and that creature each get +2/+0 until end of turn and draw a card',
  ],
  parse: gainParser(
    'effect.gain-each-of-two',
    [],
    true,
    () => true,
    undefined,
    (ctx, pos) => {
      const r = sequence(
        operands(
          ['noun.self', 'noun.it', 'noun.that-object', 'noun.target-permanent'],
          'effect.gain-each-of-two',
        ),
        literal(' each'),
      )(ctx, pos);
      if (!r.ok) return r;
      const [subject] = r.value;
      // Two nouns exactly.
      return subject.kind === 'nounList' && subject.items.length === 2
        ? { ok: true, value: subject, pos: r.pos }
        : fail(ctx, pos);
    },
  ),
});

/**
 * `effect.copy-each`: "for each creature target player controls, create a token that's a copy of that creature, except it has haste and "At the beginning of the end step,
 * if you don't control a planeswalker, sacrifice this creature."" (stage P55, D-213, CR 707.2, 707.9b, 111.4: a token for each permanent of the group, with its copiable
 * values and the exceptions: a keyword, and an ability in quotes). The engine's `createCopies`. Not read: another exception, a keyword besides haste, a group that is not
 * "that a player controls", copies of "each" without the exceptions (`effect.create-token` and its copy rules read the single token).
 */
export const EFFECT_COPY_EACH = defineRule<Clauses>({
  id: 'effect.copy-each',
  family: 'effect',
  leading: ['for'],
  cites: [
    'CR 707.2 (Copying Objects)',
    'CR 707.9b (Copying Objects)',
    'CR 111.4 (Tokens)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'for each creature target player controls, create a token that’s a copy of that creature, except it has haste and "At the beginning of the end step, if you don’t control a planeswalker, sacrifice ~."',
    'for each artifact target player controls, create a token that’s a copy of that artifact, except it has haste and "At the beginning of the end step, sacrifice ~."',
  ],
  rejects: [
    'for each creature target player controls, create a token that’s a copy of that creature',
    'for each creature target player controls, create a token that’s a copy of that creature, except it has haste',
    'for each creature target player controls, create a token that’s a copy of that creature, except it has flying and "At the beginning of the end step, sacrifice ~."',
    'for each creature you control, create a token that’s a copy of that creature, except it has haste and "At the beginning of the end step, sacrifice ~."',
    'for each creature target player controls, create a token that’s a copy of it, except it has haste and "At the beginning of the end step, sacrifice ~."',
    'for each creature target player controls, create a token that’s a copy of that creature, except it has haste and "At the beginning of the end step, sacrifice ~." Draw a card',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.copy-each';
    // Looked at first, so that another sentence that starts with "for each" stops where it always did.
    const ahead = pattern(
      /(?=for each [a-z]+ target (?:player|opponent) controls, create a token)/iu,
    )(ctx, pos);
    if (!ahead.ok) return ahead;
    const head = sequence(
      literal('for each '),
      permanentPhrase(false, 'all'),
      literal(' '),
      family<IrNoun>('noun', { only: ['noun.player'] }),
      pattern(
        / controls, create a token that['’]s a copy of that [a-z]+, except it has haste and /iu,
      ),
    )(ctx, pos);
    if (!head.ok) return head;
    const [, filter, , player] = head.value;
    if (filter.controller !== undefined || player.det !== 'target') return fail(ctx, pos);
    const quoted = readQuotedAbility(ctx, head.pos, { mana: false });
    if (!quoted.ok) return quoted;
    const objects: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: { ...filter, controller: { noun: player }, raw: ctx.text.slice(pos + 9, head.pos) },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: head.pos },
      rule: id,
    };
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'createCopies',
          { objects, quoted: quoted.value },
          { start: pos, end: quoted.pos },
        ),
      ],
      pos: quoted.pos,
    };
  },
});

export const VRASKA_EFFECT_RULES = [
  EFFECT_REMOVE_ALL_COUNTERS,
  EFFECT_GAIN_KEYWORD_WHILE_REMAINS,
  EFFECT_GAIN_KEYWORD_WHILE_CONTROLLING,
  EFFECT_PUT_EXILED_WITH,
  quietly(EFFECT_CHOOSE_TARGET),
  quietly(EFFECT_COUNTERS_IF_IT_IS),
  EFFECT_CONNIVE,
  EFFECT_BECOME_COPY,
  EFFECT_TARGET_BECOMES_COPY,
  EFFECT_GAIN_EACH_OF_TWO,
  EFFECT_COPY_EACH,
];
