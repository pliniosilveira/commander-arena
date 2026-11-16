/**
 * Effect rules of the Hylda deck, group 3 (issue 42): shuffling permanents into their owners' libraries, "tap or untap", and a player and the permanents they control gaining
 * hexproof.
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrDuration, IrKeywordArg, IrNoun } from '../../ir/types';
import { permanentPhrase } from '../noun/phrases';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, makeClause, operands, SELF_OR_PERMANENT_OPERANDS } from './operands';

/**
 * `effect.shuffle-into-libraries`: "shuffle ~ and target creature with a stun counter on it into their owners' libraries" (CR 701.24, 701.24c, 400.3, 108.3): each
 * object named is put into the library of its owner and every library that received one is shuffled. One object goes "into its owner's library", two or more "into their
 * owners' libraries". Not read: "your graveyard" in the list (the Niv-Mizzet rule), "into your library" (the owner, not the controller), a count the phrase does not
 * agree with, a position ("on top of").
 */
export const EFFECT_SHUFFLE_INTO_LIBRARIES = defineRule<Clauses>({
  id: 'effect.shuffle-into-libraries',
  family: 'effect',
  leading: ['shuffle'],
  cites: [
    'CR 701.24 (Shuffle)',
    'CR 701.24c (Shuffle)',
    'CR 108.3 (Owner and Controller)',
    'CR 903.9a (Commander)',
  ],
  examples: [
    "shuffle ~ and target creature with a stun counter on it into their owners' libraries",
    'shuffle ~ and target creature with a stun counter on it into their owners’ libraries',
    "shuffle target creature into its owner's library",
    "shuffle ~ into its owner's library",
    "shuffle ~ and target artifact into their owners' libraries",
  ],
  rejects: [
    "shuffle ~ and your graveyard into their owner's library",
    "shuffle ~ into their owners' libraries",
    "shuffle ~ and target creature into its owner's library",
    "shuffle target creature into their owners' libraries",
    'shuffle ~ and target creature into your library',
    "shuffle ~ and target creature into their owners' libraries.",
    'shuffle your library',
    "shuffle target creature into its owner's library and draw a card",
    "shuffle it into its owner's library",
    "shuffle ~ and target creature into the top of their owners' libraries",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      // Looked at first, so that a line that does not say so stops where it always did.
      pattern(/(?=shuffle [^.]*? into (?:its owner['’]s library|their owners['’] libraries)(?![\p{L}\p{N}]))/iu),
      literal('shuffle '),
      operands(SELF_OR_PERMANENT_OPERANDS, 'effect.shuffle-into-libraries'),
      pattern(/ into (its owner['’]s library|their owners['’] libraries)(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, , objects, tail] = r.value;
    // One object goes into "its owner's library", two or more into "their owners' libraries".
    const many = objects.kind === 'nounList';
    const plural = /libraries/iu.test(tail[1] ?? '');
    if (many !== plural) return fail(ctx, pos);
    const clause = makeClause(
      'effect.shuffle-into-libraries',
      'shuffleIntoLibraries',
      { objects },
      { start: pos, end: r.pos },
    );
    return { ok: true, value: [clause], pos: r.pos };
  },
});

/**
 * `effect.tap-or-untap`: "tap or untap target creature" and "you may tap or untap target creature" (CR 701.26a, 701.26b, 608.2d): the controller chooses, as the effect
 * resolves, to tap the permanent or to untap it, and with "you may" also to do neither. One permanent of a target phrase or `~`. Not read: "tap or untap" of a list or of a
 * group ("tap or untap each creature"), "you may" in the middle, "untap or tap", a different pair of verbs.
 */
export const EFFECT_TAP_OR_UNTAP = defineRule<Clauses>({
  id: 'effect.tap-or-untap',
  family: 'effect',
  leading: ['tap', 'you'],
  cites: ['CR 701.26a (Tap and Untap)', 'CR 701.26b (Tap and Untap)', 'CR 608.2d (Resolving Spells and Abilities)'],
  examples: [
    'tap or untap target creature',
    'you may tap or untap target creature',
    'You may tap or untap target creature',
    'tap or untap target permanent',
    'you may tap or untap target artifact',
    'tap or untap ~',
  ],
  rejects: [
    'tap or untap each creature',
    'tap or untap target creature and target land',
    'untap or tap target creature',
    'you may tap or untap',
    'tap or untap target creature.',
    'you may tap target creature',
    'you may tap or untap it',
    'tap or untap two target creatures',
    'tap or tap target creature',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      // One pattern, so that "you may draw a card" and the like stop where they always did.
      pattern(/(you may )?tap or untap (?=[~t])/iu),
      operands(['noun.self', 'noun.target-permanent'], 'effect.tap-or-untap'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [head, objects] = r.value;
    const may = head[1];
    // One permanent: "two target creatures" and "up to one" are other instructions.
    if (objects.kind !== 'noun' || objects.plural || objects.upTo || objects.count !== undefined) {
      return fail(ctx, pos);
    }
    const span = { start: pos, end: r.pos };
    const clause = makeClause(
      'effect.tap-or-untap',
      'tapOrUntap',
      {
        objects,
        optional: { kind: 'flag', value: may !== undefined, span, rule: 'effect.tap-or-untap' },
      },
      span,
    );
    return { ok: true, value: [clause], pos: r.pos };
  },
});

/**
 * `effect.you-and-permanents-gain-hexproof`: "You and permanents you control gain hexproof until end of turn" (CR 702.11b, 611.2, 611.2c, 514.2): the player has hexproof for
 * the turn and so does each permanent of the kind the controller has as the effect begins. Two clauses, the engine's `grantPlayerHexproof` of "you" and the `grantKeyword`
 * of the group. Only "you control" with one kind of permanent and hexproof; not read: another keyword, "you and target creature", "your opponents", "gains" (the subject is
 * plural), no duration.
 */
export const EFFECT_YOU_AND_PERMANENTS_GAIN_HEXPROOF = defineRule<Clauses>({
  id: 'effect.you-and-permanents-gain-hexproof',
  family: 'effect',
  leading: ['you'],
  cites: [
    'CR 702.11b (Hexproof)',
    'CR 611.2c (Continuous Effects)',
    'CR 514.2 (Cleanup Step)',
    'CR 613.1f (Interaction of Continuous Effects)',
  ],
  examples: [
    'you and permanents you control gain hexproof until end of turn',
    'You and permanents you control gain hexproof until end of turn',
    'you and creatures you control gain hexproof until end of turn',
    'you and nonland permanents you control gain hexproof until end of turn',
  ],
  rejects: [
    'you and permanents you control gain hexproof',
    'you and permanents you control gain shroud until end of turn',
    'you and permanents you control gain hexproof and indestructible until end of turn',
    'you and permanents your opponents control gain hexproof until end of turn',
    'you and permanents gain hexproof until end of turn',
    'you and permanent you control gains hexproof until end of turn',
    'you and target creature gain hexproof until end of turn',
    'you gain hexproof until end of turn',
    'permanents you control gain hexproof until end of turn',
    'you and permanents you control gain hexproof until end of turn.',
    'you and artifacts and creatures you control gain hexproof until end of turn',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      // Looked at first, so that "you and ..." of another instruction stops where it always did.
      pattern(/(?=you and [^.,]*? gain hexproof(?![\p{L}\p{N}]))/iu),
      literal('you and '),
      spanned(permanentPhrase(true, 'all')),
      spanned(pattern(/ gain hexproof(?![\p{L}\p{N}])/iu)),
      literal(' '),
      family<IrDuration>('duration'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, , group, gains, , duration] = r.value;
    const filter = group.value;
    if (filter.anyOf !== undefined || filter.controller !== 'you') return fail(ctx, pos);
    const rule = 'effect.you-and-permanents-gain-hexproof';
    const you: IrNoun = {
      kind: 'noun',
      det: 'you',
      filter: { raw: 'you' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos + 3 },
      rule,
    };
    const permanents: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter,
      upTo: false,
      plural: true,
      other: false,
      span: group.span,
      rule,
    };
    const keyword: IrKeywordArg = { kind: 'keywordName', name: 'hexproof', span: gains.span, rule };
    const span = { start: pos, end: r.pos };
    const player = makeClause(rule, 'grantPlayerHexproof', { player: you }, span);
    const grant = makeClause(rule, 'grantKeyword', { objects: permanents, keyword }, span);
    return {
      ok: true,
      value: [
        { ...player, duration, connector: 'and' },
        { ...grant, duration },
      ],
      pos: r.pos,
    };
  },
});

export const HYLDA_G3_EFFECT_RULES = [
  EFFECT_SHUFFLE_INTO_LIBRARIES,
  EFFECT_TAP_OR_UNTAP,
  EFFECT_YOU_AND_PERMANENTS_GAIN_HEXPROOF,
];
