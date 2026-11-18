/**
 * Effect rules of group 1 of the Prismari deck (issue 87, D-630 to D-637): the tokens that are copies and the sentences about the tokens an instruction just made.
 *
 * - `effect.made-tokens-gain-keywords`, `effect.end-step-made-tokens`, `effect.leave-made-tokens`: "The token created this way gains haste.", "They gain haste.", "Sacrifice it at the
 *   beginning of the next end step.", "Exile them at the beginning of the next end step.", "sacrifice those tokens" (CR 603.7c, 400.7j): about the tokens the instruction before
 *   them made (`moved`), which the lowering checks (`ctx.tokensMade`); never about another object.
 * - `effect.create-of-those-tokens`: "create five of those tokens" (after "If ~ was kicked, ... instead"): more of the token the instruction before it made.
 * - `effect.copy-each-creature-token-attacking`: "for each creature token you control that entered this turn, create a tapped and attacking token that's a copy of that token" (CR 508.4).
 * - `effect.choose-any-number-target`, `effect.copy-each-of-them`: "Choose any number of target creatures you control. For each of them, create a token that's a copy of that
 *   creature, except it has haste." (CR 601.2c, 707.2, 707.9b).
 * - `effect.choose-token-you-control`, `effect.each-other-token-becomes-copy`: "Then you may choose a token you control. If you do, each other token you control becomes a copy of
 *   that token." (CR 707.2, 611.2a: a copy effect with no duration).
 * - `effect.becomes-copy-except-keyword`: "~ becomes a copy of up to one target nonlegendary creature you control until end of turn, except it has myriad." (CR 707.2, 707.9b).
 */
import { fail, literal, map, optional, type Parser, pattern, sequence } from '../../combinators';
import type { IrArg, IrDuration, IrNoun } from '../../ir/types';
import { positiveCount } from '../amount/index';
import { KEYWORD_WORDS } from '../keyword/list';
import { SIMPLE_KEYWORDS } from '../keyword/vocabulary';
import { defineRule, family, quietly, spanned } from '../registry';
import { type Clauses, makeClause, operands, single } from './operands';

const BOUNDARY = '(?![\\p{L}\\p{N}])';

/** Succeeds, reading nothing, when the text from here on is the end of the sentence (a period or the end of the text). */
const endsSentence = (ctx: { text: string }, pos: number): boolean =>
  /^(?:\.|$)/u.test(ctx.text.slice(pos));

/**
 * `effect.made-tokens-gain-keywords`: "The token created this way gains haste.", "They gain haste.", "Those tokens gain flying and haste." (CR 611.2a, 613.1f: no duration, so it
 * lasts as long as the token does). The subject is the tokens the instruction before made, not any other object (the lowering checks it). The singular has "gains" and the plural
 * "gain". A duration ("until end of turn") is `effect.gain-keyword`'s ("That token gains haste until end of turn.").
 */
export const EFFECT_MADE_TOKENS_GAIN_KEYWORDS = defineRule<Clauses>({
  id: 'effect.made-tokens-gain-keywords',
  family: 'effect',
  leading: ['the', 'they', 'those'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 702.10 (Haste)',
  ],
  examples: [
    'the token created this way gains haste',
    'The token created this way gains haste',
    'they gain haste',
    'They gain haste',
    'those tokens gain haste',
    'they gain flying and haste',
    // Prismari deck, group 2 (D-639, CR 611.2a, 514.2): the keyword until end of turn, for the tokens that were just made.
    'they gain haste until end of turn',
    'They gain haste until end of turn',
    'those tokens gain flying and haste until end of turn',
    'the token created this way gains haste until end of turn',
  ],
  rejects: [
    'they gains haste',
    'the token created this way gain haste',
    'those tokens gains haste',
    'the tokens created this way gain haste',
    'they gain haste until your next turn',
    'they gain haste until end of turn and draw a card',
    'they gain haste until the end of turn',
    'they gain',
    'they gain banana',
    'they gain haste and draw a card',
    'it gains haste',
    'those token gain haste',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.made-tokens-gain-keywords';
    const head = pattern(/(?:the token created this way (gains)|(?:they|those tokens) (gain)) /iu)(
      ctx,
      pos,
    );
    if (!head.ok) return head;
    const gains = spanned(KEYWORD_WORDS)(ctx, head.pos);
    if (!gains.ok) return gains;
    // D-639 (CR 611.2a): "... until end of turn": the keyword ends with the turn (the lowering gives the engine's `untilEndOfTurn`), where it was for good without it.
    const until = optional(
      sequence(
        literal(' '),
        family<IrDuration>('duration', { only: ['duration.until-end-of-turn'] }),
      ),
      null,
    )(ctx, gains.pos);
    if (!until.ok) return until;
    const end = until.value === null ? gains.pos : until.pos;
    if (!endsSentence(ctx, end)) return fail(ctx, pos);
    const duration = until.value === null ? undefined : until.value[1];
    const words = gains.value.value;
    const clauses = words.map((name, i): Clauses[number] => {
      const keyword: IrArg = { kind: 'keywordName', name, span: gains.value.span, rule: id };
      const clause = makeClause(id, 'grantKeywordToMade', { keyword }, gains.value.span);
      const timed = duration === undefined ? clause : { ...clause, duration };
      return i < words.length - 1 ? { ...timed, connector: 'and' } : timed;
    });
    return { ok: true, value: clauses, pos: end };
  },
});

/**
 * `effect.end-step-made-tokens`: "Sacrifice it at the beginning of the next end step.", "Exile them at the beginning of the next end step.", "Exile those tokens at the beginning of the
 * next end step." (CR 603.7, 603.7c: one delayed triggered ability about the tokens the instruction before made, and no others; a token that has left does nothing). The engine's
 * `delayedTrigger` of a `sacrifice` or an `exile` of `moved`. "Exile it" is `effect.exile-at-end-step`'s (Whip of Erebos: the permanent a return put onto the battlefield). Not read:
 * "your next end step", another object, another verb.
 */
export const EFFECT_END_STEP_MADE_TOKENS = defineRule<Clauses>({
  id: 'effect.end-step-made-tokens',
  family: 'effect',
  leading: ['sacrifice', 'exile'],
  cites: [
    'CR 603.7 (Delayed Triggered Abilities)',
    'CR 603.7c (Delayed Triggered Abilities)',
    'CR 701.21a (Sacrifice)',
  ],
  examples: [
    'sacrifice it at the beginning of the next end step',
    'Sacrifice it at the beginning of the next end step',
    'sacrifice them at the beginning of the next end step',
    'sacrifice those tokens at the beginning of the next end step',
    'exile them at the beginning of the next end step',
    'Exile them at the beginning of the next end step',
    'exile those tokens at the beginning of the next end step',
    // Prismari deck, group 2 (Manaform Hellkite): the one token the instruction before made.
    'exile that token at the beginning of the next end step',
    'Exile that token at the beginning of the next end step',
  ],
  rejects: [
    'exile it at the beginning of the next end step',
    'exile that tokens at the beginning of the next end step',
    'exile that creature at the beginning of the next end step',
    'sacrifice that token at the beginning of the next end step',
    'sacrifice it at the beginning of your next end step',
    'sacrifice it at the beginning of the next end',
    'sacrifice them at the beginning of the next end step and draw a card',
    'exile those tokens',
    'sacrifice target creature at the beginning of the next end step',
    'sacrifice ~ at the beginning of the next end step',
    'exile those token at the beginning of the next end step',
    'destroy them at the beginning of the next end step',
    'sacrifice those creatures at the beginning of the next end step',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.end-step-made-tokens';
    const r = spanned(
      pattern(
        new RegExp(
          `(sacrifice (?:it|them|those tokens)|exile (?:them|those tokens|that token)) at the beginning of the next end step${BOUNDARY}`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    if (!endsSentence(ctx, r.pos)) return fail(ctx, pos);
    const verb = (r.value.value[1] ?? '').toLowerCase().startsWith('sacrifice')
      ? 'sacrificeAtEndStepMade'
      : 'exileAtEndStepMade';
    return { ok: true, value: [makeClause(id, verb, {}, r.value.span)], pos: r.pos };
  },
});

/**
 * `effect.leave-made-tokens`: "sacrifice those tokens", "exile those tokens" (CR 701.21a, 406.1): the tokens the instruction before made, as the instruction of a delayed
 * sentence ("At the beginning of the next end step, sacrifice those tokens."). The engine's `sacrifice` or `exile` of `moved`. Not read: "it", "them", another object.
 */
export const EFFECT_LEAVE_MADE_TOKENS = defineRule<Clauses>({
  id: 'effect.leave-made-tokens',
  family: 'effect',
  leading: ['sacrifice', 'exile'],
  cites: [
    'CR 701.21a (Sacrifice)',
    'CR 603.7c (Delayed Triggered Abilities)',
    'CR 400.7j (General)',
  ],
  examples: ['sacrifice those tokens', 'exile those tokens'],
  rejects: [
    'sacrifice those token',
    'sacrifice these tokens',
    'sacrifice those creatures',
    'sacrifice those tokens and draw a card',
    'destroy those tokens',
    'sacrifice ~',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.leave-made-tokens';
    const r = spanned(pattern(new RegExp(`(sacrifice|exile) those tokens${BOUNDARY}`, 'iu')))(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    // Not "... at the beginning of the next end step": that is `effect.end-step-made-tokens`.
    if (/^ at the beginning/iu.test(ctx.text.slice(r.pos))) return fail(ctx, pos);
    const verb =
      (r.value.value[1] ?? '').toLowerCase() === 'sacrifice'
        ? 'sacrificeMadeTokens'
        : 'exileMadeTokens';
    return { ok: true, value: [makeClause(id, verb, {}, r.value.span)], pos: r.pos };
  },
});

/**
 * `effect.create-of-those-tokens`: "create five of those tokens" (CR 111.4, 608.2c), as the replacement of "If this spell was kicked, create five of those tokens instead": more
 * tokens of the kind the instruction before it made. The lowering reads that instruction (`ctx.lastToken`) and makes the engine's `createToken` of the same copy, that many.
 * Not read: "a", "one", a count of X, "of these tokens", "of that token".
 */
export const EFFECT_CREATE_OF_THOSE_TOKENS = defineRule<Clauses>({
  id: 'effect.create-of-those-tokens',
  family: 'effect',
  leading: ['create'],
  cites: [
    'CR 111.4 (Tokens)',
    'CR 707.2 (Copying Objects)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'create five of those tokens',
    'create two of those tokens',
    'create 3 of those tokens',
  ],
  rejects: [
    'create a of those tokens',
    'create one of those tokens',
    'create five of those token',
    'create five of these tokens',
    'create X of those tokens',
    'create five of those tokens and draw a card',
    'create of those tokens',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.create-of-those-tokens';
    const r = sequence(
      literal('create '),
      spanned(positiveCount),
      pattern(new RegExp(` of those tokens${BOUNDARY}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, count] = r.value;
    if (count.value < 2) return fail(ctx, pos);
    const amount: IrArg = { kind: 'number', value: count.value, span: count.span };
    return {
      ok: true,
      value: [makeClause(id, 'createOfThose', { count: amount }, { start: pos, end: r.pos })],
      pos: r.pos,
    };
  },
});

/**
 * `effect.copy-each-creature-token-attacking`: "for each creature token you control that entered this turn, create a tapped and attacking token that's a copy of that token" (CR 707.2,
 * 111.4, 508.4: the copies are put onto the battlefield attacking, so they were never declared as attackers). The engine's `createCopies` of the group with `tapped`, and
 * `enterAttacking` of the copies. Not read: another group than the creature tokens you control, no "entered this turn", "attacking" alone.
 */
export const EFFECT_COPY_EACH_CREATURE_TOKEN_ATTACKING = defineRule<Clauses>({
  id: 'effect.copy-each-creature-token-attacking',
  family: 'effect',
  leading: ['for'],
  cites: [
    'CR 707.2 (Copying Objects)',
    'CR 111.4 (Tokens)',
    'CR 508.4 (Declare Attackers Step)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'for each creature token you control that entered this turn, create a tapped and attacking token that’s a copy of that token',
    "for each creature token you control that entered this turn, create a tapped and attacking token that's a copy of that token",
  ],
  rejects: [
    'for each creature token you control that entered this turn, create a token that’s a copy of that token',
    'for each creature token you control, create a tapped and attacking token that’s a copy of that token',
    'for each creature you control that entered this turn, create a tapped and attacking token that’s a copy of that creature',
    'for each creature token you control that entered this turn, create a tapped token that’s a copy of that token',
    'for each creature token you control that entered this turn, create a tapped and attacking token that’s a copy of it',
    'for each creature token an opponent controls that entered this turn, create a tapped and attacking token that’s a copy of that token',
    'for each creature token you control that entered this turn, create a tapped and attacking token that’s a copy of that token, except it has haste',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.copy-each-creature-token-attacking';
    const r = spanned(
      pattern(
        new RegExp(
          `for each creature token you control that entered this turn, create a tapped and attacking token that['’]s a copy of that token${BOUNDARY}`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    if (!endsSentence(ctx, r.pos)) return fail(ctx, pos);
    const objects: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: {
        types: ['creature'],
        token: true,
        controller: 'you',
        enteredThisTurn: true,
        raw: 'creature token you control that entered this turn',
      },
      upTo: false,
      plural: false,
      other: false,
      span: r.value.span,
      rule: id,
    };
    return {
      ok: true,
      value: [makeClause(id, 'createCopiesAttacking', { objects }, r.value.span)],
      pos: r.pos,
    };
  },
});

/**
 * `effect.choose-any-number-target`: "Choose any number of target creatures you control." (CR 115.1, 601.2c, 601.2d): only the choice of the targets, which the sentence after it reads
 * as "them"; it makes no effect of its own (the lowering adds the slot of any number of targets, as `effect.choose-target` does for one).
 */
export const EFFECT_CHOOSE_ANY_NUMBER_TARGET = defineRule<Clauses>({
  id: 'effect.choose-any-number-target',
  family: 'effect',
  leading: ['choose'],
  cites: ['CR 115.1 (Targets)', 'CR 601.2c (Casting Spells)', 'CR 601.2d (Casting Spells)'],
  examples: [
    'choose any number of target creatures you control',
    'choose any number of target creatures',
    'choose any number of other target creatures you control',
  ],
  rejects: [
    'choose any number of creatures you control',
    'choose any number of target',
    'choose up to two target creatures you control',
    'choose target creature you control',
    'choose any number of target creatures you control and draw a card',
    'choose any number of targets',
  ],
  parse: single(
    'effect.choose-any-number-target',
    sequence(
      literal('choose '),
      operands(['noun.any-number-targets'], 'effect.choose-any-number-target', {
        accept: (noun) => noun.det === 'target' && noun.anyNumber === true,
        locate: (noun) => noun.span.start,
      }),
    ),
    ([, what]) => ({ verb: 'chooseTarget', args: { what } }),
  ),
});

/**
 * `effect.copy-each-of-them`: "For each of them, create a token that's a copy of that creature, except it has haste." (CR 707.2, 707.9b, 111.4: a token for each target the sentence before
 * chose, with the copiable values of that permanent and haste as part of them). "Them" is the targets of that sentence (the binding pass). The engine's `createCopies` of the targets
 * with the keyword haste as an ability. Not read: another exception, none, a keyword besides haste, "it" for the permanent.
 */
export const EFFECT_COPY_EACH_OF_THEM = defineRule<Clauses>({
  id: 'effect.copy-each-of-them',
  family: 'effect',
  leading: ['for'],
  cites: [
    'CR 707.2 (Copying Objects)',
    'CR 707.9b (Copying Objects)',
    'CR 111.4 (Tokens)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'for each of them, create a token that’s a copy of that creature, except it has haste',
    "for each of them, create a token that's a copy of that creature, except it has haste",
  ],
  rejects: [
    'for each of them, create a token that’s a copy of that creature',
    'for each of them, create a token that’s a copy of that creature, except it has flying',
    'for each of them, create a token that’s a copy of it, except it has haste',
    'for each creature, create a token that’s a copy of that creature, except it has haste',
    'for each of them, create a tapped token that’s a copy of that creature, except it has haste',
    'for each of them, create a token that’s a copy of that creature, except it has haste and flying',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.copy-each-of-them';
    const r = sequence(
      literal('for '),
      family<IrNoun>('noun', { only: ['noun.each-of-them'] }),
      spanned(
        pattern(
          new RegExp(
            `, create a token that['’]s a copy of that (?:creature|permanent), except it has haste${BOUNDARY}`,
            'iu',
          ),
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    if (!endsSentence(ctx, r.pos)) return fail(ctx, pos);
    const [, objects, tail] = r.value;
    return {
      ok: true,
      value: [
        makeClause(id, 'createCopiesOfThem', { objects }, { start: pos, end: tail.span.end }),
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.choose-token-you-control`: "choose a token you control" (CR 608.2d), the offer of "Then you may choose a token you control. If you do, ..." (the sentence makes it optional).
 * The engine's `chooseObjects` of one token the controller controls, which `effect.each-other-token-becomes-copy` reads as "that token". Not read: "target", a number, another group.
 */
export const EFFECT_CHOOSE_TOKEN_YOU_CONTROL = defineRule<Clauses>({
  id: 'effect.choose-token-you-control',
  family: 'effect',
  leading: ['choose'],
  cites: ['CR 608.2d (Resolving Spells and Abilities)', 'CR 111.1 (Tokens)'],
  examples: ['choose a token you control'],
  rejects: [
    'choose target token you control',
    'choose a token',
    'choose two tokens you control',
    'choose a token an opponent controls',
    'choose a creature token you control',
    'choose a token you control and draw a card',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.choose-token-you-control';
    const r = spanned(pattern(new RegExp(`choose a token you control${BOUNDARY}`, 'iu')))(ctx, pos);
    if (!r.ok) return r;
    if (!endsSentence(ctx, r.pos)) return fail(ctx, pos);
    return {
      ok: true,
      value: [makeClause(id, 'chooseTokenYouControl', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

/**
 * `effect.each-other-token-becomes-copy`: "each other token you control becomes a copy of that token" (CR 707.2, 613.2a, 611.2a: a layer 1 effect with no duration, so for as long as the
 * tokens stay on the battlefield; "that token" is the token chosen by the instruction before it). The engine's `becomeCopy` of each token the controller controls except the one
 * chosen, with the duration `permanent`. Not read: a duration, an exception, "each token", "target".
 */
export const EFFECT_EACH_OTHER_TOKEN_BECOMES_COPY = defineRule<Clauses>({
  id: 'effect.each-other-token-becomes-copy',
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 707.2 (Copying Objects)',
    'CR 613.2a (Interaction of Continuous Effects)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: ['each other token you control becomes a copy of that token'],
  rejects: [
    'each token you control becomes a copy of that token',
    'each other token you control becomes a copy of that token until end of turn',
    'each other token becomes a copy of that token',
    'each other token you control become a copy of that token',
    'each other creature you control becomes a copy of that token',
    'each other token you control becomes a copy of that creature',
    'each other token you control becomes a copy of that token, except it has haste',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.each-other-token-becomes-copy';
    const r = spanned(
      pattern(
        new RegExp(`each other token you control becomes a copy of that token${BOUNDARY}`, 'iu'),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    if (!endsSentence(ctx, r.pos)) return fail(ctx, pos);
    return {
      ok: true,
      value: [makeClause(id, 'eachOtherTokenBecomesCopy', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

/**
 * A keyword the card prints with no parameter ("myriad", "haste"): the exception of a copy gives it as an ability of the copy (CR 707.9b), a printed ability among the copiable values,
 * so it need not be one an effect can grant (myriad cannot be granted). The words of `SIMPLE_KEYWORDS`, the longest first.
 */
const PRINTED_KEYWORD: Parser<string[]> = map(
  pattern(
    new RegExp(
      `(${SIMPLE_KEYWORDS.map(([word]) => word.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'))
        .sort((a, b) => b.length - a.length)
        .join('|')})(?![\\p{L}\\p{N}])`,
      'iu',
    ),
  ),
  (m) => [(m[1] ?? '').toLowerCase()],
);

/**
 * `effect.becomes-copy-except-keyword`: "~ becomes a copy of up to one target nonlegendary creature you control until end of turn, except it has myriad." (CR 707.2, 707.9b, 611.2a,
 * 613.2a: this permanent gets the copiable values of the target as they are when the instruction runs, with the keyword as an ability of the copy; "up to one" lets it choose none).
 * The engine's `becomeCopy` with `abilities`. Not read: another subject, a duration other than until end of turn, none, an exception besides a keyword, a keyword the engine cannot
 * print, "any" for the copied.
 */
export const EFFECT_BECOMES_COPY_EXCEPT_KEYWORD = defineRule<Clauses>({
  id: 'effect.becomes-copy-except-keyword',
  family: 'effect',
  leading: ['~'],
  cites: [
    'CR 707.2 (Copying Objects)',
    'CR 707.9b (Copying Objects)',
    'CR 611.2a (Continuous Effects)',
    'CR 613.2a (Interaction of Continuous Effects)',
  ],
  examples: [
    '~ becomes a copy of up to one target nonlegendary creature you control until end of turn, except it has myriad',
    '~ becomes a copy of target creature you control until end of turn, except it has haste',
  ],
  rejects: [
    '~ becomes a copy of up to one target nonlegendary creature you control until end of turn',
    '~ becomes a copy of up to one target nonlegendary creature you control, except it has myriad',
    '~ becomes a copy of up to one target nonlegendary creature you control until your next turn, except it has myriad',
    '~ becomes a copy of any creature until end of turn, except it has myriad',
    '~ becomes a copy of up to one target nonlegendary creature you control until end of turn, except its name is ~',
    '~ becomes a copy of up to one target nonlegendary creature you control until end of turn, except it has banana',
    '~ become a copy of up to one target nonlegendary creature you control until end of turn, except it has myriad',
    'it becomes a copy of up to one target nonlegendary creature you control until end of turn, except it has myriad',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.becomes-copy-except-keyword';
    const r = sequence(
      family<IrNoun>('noun', { only: ['noun.self'] }),
      literal(' becomes a copy of '),
      family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
      literal(' '),
      family<IrDuration>('duration'),
      literal(', except it has '),
      spanned(PRINTED_KEYWORD),
    )(ctx, pos);
    if (!r.ok) return r;
    const [objects, , of, , duration, , keywords] = r.value;
    if (duration.scope !== 'untilEndOfTurn' || of.det !== 'target') return fail(ctx, pos);
    const [only, ...more] = keywords.value;
    if (only === undefined || more.length > 0) return fail(ctx, pos);
    const keyword: IrArg = { kind: 'keywordName', name: only, span: keywords.span, rule: id };
    const clause = makeClause(
      id,
      'becomeCopyExcept',
      { objects, of, keyword },
      { start: pos, end: r.pos },
    );
    return { ok: true, value: [{ ...clause, duration }], pos: r.pos };
  },
});

/** Quiet: a line these rules do not read stops where it always did. */
export const PRISMARI_G1_EFFECT_RULES = [
  quietly(EFFECT_MADE_TOKENS_GAIN_KEYWORDS),
  quietly(EFFECT_END_STEP_MADE_TOKENS),
  quietly(EFFECT_LEAVE_MADE_TOKENS),
  quietly(EFFECT_CREATE_OF_THOSE_TOKENS),
  quietly(EFFECT_COPY_EACH_CREATURE_TOKEN_ATTACKING),
  quietly(EFFECT_CHOOSE_ANY_NUMBER_TARGET),
  quietly(EFFECT_COPY_EACH_OF_THEM),
  quietly(EFFECT_CHOOSE_TOKEN_YOU_CONTROL),
  quietly(EFFECT_EACH_OTHER_TOKEN_BECOMES_COPY),
  quietly(EFFECT_BECOMES_COPY_EXCEPT_KEYWORD),
];
