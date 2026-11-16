/**
 * Noun rules of group 2 of the Hylda deck (issue 42, D-1510 to D-1518): "all creatures target player controls" (Sleep, Tempest Caller), "those creatures" (Sleep, Send to Sleep, Icy
 * Blast, Cone of Cold) and "X target creatures" (Icy Blast).
 */
import { fail, literal, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule, node, spanned } from '../registry';
import { BOUNDARY, permanentPhrase } from './phrases';

type Bare = Omit<IrNoun, 'span' | 'rule'>;

/**
 * `noun.all-permanents-of-target-player`: "all creatures target player controls", "all creatures target opponent controls", "all nonland permanents target player controls" (CR 109.4,
 * 110.1, 115.1, 608.2c): every permanent of the kind that the player chosen as a target controls. The player is a target noun of its own, numbered with the other targets of the
 * text (the binding pass walks the controller of the filter); the engine's `controlledBy` of that target (`selector:controllerRef`), as `noun.each-permanent-of-player` reads
 * "each creature that player controls" for a player an earlier noun named. Which permanents it names is fixed as the effect resolves (CR 608.2c). Not read: "each", "other", a
 * singular, no controller words, "you control" or "your opponents control" (the plain `noun.all-permanents`), "target players", a controller said twice.
 */
export const NOUN_ALL_PERMANENTS_OF_TARGET_PLAYER = defineRule<IrNoun>({
  id: 'noun.all-permanents-of-target-player',
  family: 'noun',
  leading: ['all'],
  cites: [
    'CR 109.4 (Objects)',
    'CR 110.1 (Permanents)',
    'CR 115.1 (Targets)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'all creatures target player controls',
    'all creatures target opponent controls',
    'all nonland permanents target player controls',
    'all artifacts target opponent controls',
    'all creatures target player controls,',
  ],
  rejects: [
    'all creatures',
    'all creatures you control',
    'all creatures your opponents control',
    'all creature target player controls',
    'each creature target player controls',
    'all other creatures target player controls',
    'all creatures target players control',
    'all creatures target player',
    'all creatures that player controls',
    'all creatures you control target player controls',
    'all creatures an opponent controls',
    'all creatures target creature controls',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('all '),
      permanentPhrase(true, 'all'),
      spanned(pattern(new RegExp(` target (player|opponent) controls${BOUNDARY}`, 'iu'))),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, filter, suffix] = r.value;
    // A permanent phrase that already says who controls it ("all creatures you control target player controls") is not this phrase.
    if (filter.controller !== undefined) return fail(ctx, pos);
    // The player is a target noun: the words after the space of the suffix.
    const start = suffix.span.start + 1;
    const wanted = (suffix.value[1] ?? '').toLowerCase();
    const word = `target ${wanted}`;
    const player: IrNoun = {
      kind: 'noun',
      det: 'target',
      filter: { player: wanted === 'opponent' ? 'opponent' : 'any', raw: word },
      upTo: false,
      plural: false,
      other: false,
      span: { start, end: start + word.length },
      rule: 'noun.all-permanents-of-target-player',
    };
    const noun: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: { ...filter, controller: { noun: player }, raw: ctx.text.slice(pos, r.pos) },
      upTo: false,
      plural: true,
      other: false,
      span: { start: pos, end: r.pos },
      rule: 'noun.all-permanents-of-target-player',
    };
    return { ok: true, value: noun, pos: r.pos };
  },
});

/**
 * `noun.target-permanent-of-that-player`: "target creature that player controls", "target nonland permanent that player controls" (CR 115.1, 109.4, 603.2): a target chosen among the
 * permanents of "that player", the player the text already named. The words say it, as `noun.each-permanent-of-player` does for "each creature that player controls": the
 * controller of the filter is the pronoun, which the binding pass points at the most recent player of the text (in a trigger about a player, the player of the event). The lowering
 * names a target slot of that player only for the player of the event of the trigger (the engine's `controller: 'triggerPlayer'`); another player is not read. Not read: "each",
 * "target creatures", "that opponent controls" (read by the permanent phrase), "that player's creature", a controller said twice, "that players control", "target creature that
 * player".
 */
export const NOUN_TARGET_PERMANENT_OF_THAT_PLAYER = defineRule<IrNoun>({
  id: 'noun.target-permanent-of-that-player',
  family: 'noun',
  leading: ['target'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 109.4 (Objects)',
    'CR 603.2 (Handling Triggered Abilities)',
    'CR 102.1 (Players)',
  ],
  examples: [
    'target creature that player controls',
    'target nonland permanent that player controls',
    'target artifact that player controls',
    'target creature that player controls,',
  ],
  rejects: [
    'target creature',
    'target creatures that player controls',
    'each creature that player controls',
    'target creature that opponent controls',
    'target creature that players control',
    'target creature that player',
    'target creature you control that player controls',
    'target creature an opponent controls that player controls',
    "target creature that player's",
    'target card that player controls',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('target '),
      permanentPhrase(false, 'all'),
      spanned(pattern(new RegExp(` that player controls${BOUNDARY}`, 'iu'))),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, filter, suffix] = r.value;
    if (filter.controller !== undefined) return fail(ctx, pos);
    const start = suffix.span.start + 1;
    const player: IrNoun = {
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: 'that player' },
      upTo: false,
      plural: false,
      other: false,
      span: { start, end: start + 'that player'.length },
      rule: 'noun.target-permanent-of-that-player',
    };
    const noun: IrNoun = {
      kind: 'noun',
      det: 'target',
      filter: { ...filter, controller: { noun: player }, raw: ctx.text.slice(pos, r.pos) },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: r.pos },
      rule: 'noun.target-permanent-of-that-player',
    };
    return { ok: true, value: noun, pos: r.pos };
  },
});

/**
 * `noun.those-creatures`: "those creatures", "those permanents" (CR 608.2c, 109.1): the group an earlier instruction of the text named, as "that creature" is the one. Like every
 * pronoun it says nothing about the objects: the binding pass makes it the most recent plural noun of the text (the targets of the sentence before, or the group it tapped), and a
 * text with none is an unbound reference. Not read: "those" alone, "those cards", "those players", "those creature", "that creatures", "them" (`noun.each-of-them` and the others).
 */
export const NOUN_THOSE_CREATURES = defineRule<IrNoun>({
  id: 'noun.those-creatures',
  family: 'noun',
  leading: ['those'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)', 'CR 109.1 (Objects)'],
  examples: ['those creatures', 'Those creatures', 'those permanents', 'those lands'],
  rejects: [
    'those',
    'those cards',
    'those players',
    'those creature',
    'that creatures',
    'those creatures you control',
    "those creatures'",
    'those tokens',
    'them',
    'these creatures',
  ],
  parse: node<RegExpExecArray, IrNoun>(
    'noun.those-creatures',
    pattern(new RegExp(`those (?:creatures|permanents|lands|artifacts)${BOUNDARY}(?!['’])`, 'iu')),
    (m): Bare => ({
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: m[0] },
      upTo: false,
      plural: true,
      other: false,
    }),
  ),
});

/**
 * `noun.x-target-creatures`: "X target creatures", "X target creatures you control" (CR 107.3a, 601.2b-c, 115.1): as many targets as the X announced for the spell (the engine's
 * `countX`, as `noun.x-target-graveyard-cards` reads "X target creature cards from your graveyard"). Its own rule, so the phrase "X target ..." is read only where an effect asks for
 * this noun by its id (`effect.tap`); the lowering reads the X as `countX` and only in the text of a spell. Not read: "X target creature", "up to X target creatures", "X creatures",
 * "Y target creatures", "{X} target creatures", "X target creature cards".
 */
export const NOUN_X_TARGET_CREATURES = defineRule<IrNoun>({
  id: 'noun.x-target-creatures',
  family: 'noun',
  leading: ['x'],
  cites: [
    'CR 107.3a (Numbers and Symbols)',
    'CR 601.2b (Casting Spells)',
    'CR 601.2c (Casting Spells)',
    'CR 115.1 (Targets)',
  ],
  examples: [
    'X target creatures',
    'x target creatures',
    'X target creatures you control',
    'X target creatures your opponents control',
  ],
  rejects: [
    'X target creature',
    'up to X target creatures',
    'X creatures',
    'Y target creatures',
    '{X} target creatures',
    'X target creature cards',
    'two target creatures',
    'X target creatures or planeswalkers',
  ],
  parse: node<{ count: { span: { start: number; end: number } }; filter: IrFilter }, IrNoun>(
    'noun.x-target-creatures',
    map(
      sequence(
        spanned(literal('X')),
        literal(' target '),
        satisfy(
          permanentPhrase(true, 'all'),
          (filter) =>
            filter.anyOf === undefined && filter.types?.length === 1 && filter.types[0] === 'creature',
        ),
      ),
      ([count, , filter]) => ({ count, filter }),
    ),
    ({ count, filter }): Bare => ({
      kind: 'noun',
      det: 'target',
      filter,
      count: { kind: 'x', span: count.span },
      upTo: false,
      plural: true,
      other: false,
    }),
  ),
});

/** Before `noun.all-permanents`, whose phrase ("all creatures") is the first words of the first. */
export const HYLDA_G2_EARLY_NOUN_RULES = [NOUN_ALL_PERMANENTS_OF_TARGET_PLAYER];
/** Before `noun.target-permanent`, whose phrase ("target creature") is the first words of the first. */
export const HYLDA_G2_TARGET_NOUN_RULES = [NOUN_TARGET_PERMANENT_OF_THAT_PLAYER];
export const HYLDA_G2_NOUN_RULES = [NOUN_THOSE_CREATURES, NOUN_X_TARGET_CREATURES];
