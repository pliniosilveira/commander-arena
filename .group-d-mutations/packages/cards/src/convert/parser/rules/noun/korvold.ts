/**
 * Noun rules of stage P35 (D-176): "that creature", the object an earlier sentence (or, in a spell, an earlier line) named. Stage P37 (D-180):
 * "target player or planeswalker" and "each creature that player controls".
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, node, spanned } from '../registry';
import { BOUNDARY, permanentPhrase } from './phrases';

type Bare = Omit<IrNoun, 'span' | 'rule'>;

/**
 * `noun.that-object`: "that creature", "that permanent", "that land", "that artifact", "that enchantment" (CR 608.2c, 109.1): the one object
 * an earlier instruction named. Like every pronoun it says nothing about the object: the binding pass makes it the most recent singular noun
 * of that kind, a target of the line before in a spell, and a text with none is an unbound reference. "That card", "that player" and "that
 * creature's controller" are other nouns.
 */
export const NOUN_THAT_OBJECT = defineRule<IrNoun>({
  id: 'noun.that-object',
  family: 'noun',
  leading: ['that'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)', 'CR 109.1 (Objects)'],
  examples: ['that creature', 'That creature', 'that permanent', 'that land', 'that artifact'],
  rejects: [
    'that',
    'that creatures',
    'that card',
    'that creature card',
    'that player',
    "that creature's controller",
    'those creatures',
    'that spell',
    'that creature or that land',
    'that token',
    'that tokens',
    "that token's controller",
  ],
  parse: node<RegExpExecArray, IrNoun>(
    'noun.that-object',
    pattern(
      new RegExp(`that (?:creature|permanent|land|artifact|enchantment)${BOUNDARY}(?!['’])`, 'iu'),
    ),
    (m): Bare => ({
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: m[0] },
      upTo: false,
      plural: false,
      other: false,
    }),
  ),
});

/**
 * `noun.player-or-planeswalker`: "target player or planeswalker", "target opponent or planeswalker" (CR 115.1, 306.1, 120.2: damage may go to a
 * player or a planeswalker): read as a target player (the engine's `player` target, `any` or `opponent`), with the words "or planeswalker" kept in
 * the filter (`orPlaneswalker`), which the engine's target `playerOrObject` reads (stage P47, D-200: a player or a planeswalker, the planeswalker being
 * a real permanent now). Only the recipient of damage names it (`DAMAGE_RECIPIENTS`).
 */
export const NOUN_PLAYER_OR_PLANESWALKER = defineRule<IrNoun>({
  id: 'noun.player-or-planeswalker',
  family: 'noun',
  leading: ['target'],
  cites: ['CR 115.1 (Targets)', 'CR 306.1 (Planeswalkers)', 'CR 120.2 (Damage)'],
  examples: ['target player or planeswalker', 'target opponent or planeswalker'],
  rejects: [
    'target player',
    'target creature or planeswalker',
    'target player or planeswalkers',
    'target players or planeswalker',
    'target player or planeswalker or',
    'target opponent or creature',
    'any target',
    'target player and planeswalker',
  ],
  parse: node<RegExpExecArray, IrNoun>(
    'noun.player-or-planeswalker',
    pattern(new RegExp(`target (player|opponent) or planeswalker${BOUNDARY}`, 'iu')),
    (m): Bare => ({
      kind: 'noun',
      det: 'target',
      filter: {
        player: (m[1] ?? '').toLowerCase() === 'opponent' ? 'opponent' : 'any',
        orPlaneswalker: true,
        raw: m[0],
      },
      upTo: false,
      plural: false,
      other: false,
    }),
  ),
});

/**
 * `noun.each-permanent-of-player`: "each creature that player controls", "each creature that player or that planeswalker's controller controls"
 * (CR 109.4, 110.1, 608.2c): every permanent of the kind that a player the text named controls, the player being "that player" (the binding pass
 * makes it the target an earlier noun of the text named: the engine's `controlledBy`). "Or that planeswalker's controller" says the same of the
 * player when the target was a planeswalker, which the player-or-planeswalker target only ever is as a player (`noun.player-or-planeswalker`).
 * Read as one noun with the kind of permanent; "each other" and a controller the words name ("an opponent controls") are other nouns.
 */
export const NOUN_EACH_PERMANENT_OF_PLAYER = defineRule<IrNoun>({
  id: 'noun.each-permanent-of-player',
  family: 'noun',
  leading: ['each'],
  cites: [
    'CR 109.4 (Objects)',
    'CR 110.1 (Permanents)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'each creature that player controls',
    "each creature that player or that planeswalker's controller controls",
    'each creature that player or that planeswalker’s controller controls',
    'each artifact that player controls',
    'each nonland permanent that player controls',
  ],
  rejects: [
    'each creature',
    'each creature you control',
    'each creature that opponent controls',
    'each creature that players control',
    'each creature that player controls or',
    "each creature that planeswalker's controller controls",
    'each other creature that player controls',
    'all creatures that player controls',
    'each creature that player',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('each '),
      permanentPhrase(false, 'all'),
      spanned(
        pattern(
          new RegExp(
            ` that player(?: or that planeswalker['’]s controller)? controls${BOUNDARY}`,
            'iu',
          ),
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, filter, suffix] = r.value;
    // The player is named by "that player" (the first words of the suffix, after the space).
    const start = suffix.span.start + 1;
    const player: IrNoun = {
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: 'that player' },
      upTo: false,
      plural: false,
      other: false,
      span: { start, end: start + 'that player'.length },
      rule: 'noun.each-permanent-of-player',
    };
    // A permanent phrase that already says who controls it ("each creature you control that player controls") is not this phrase.
    if (filter.controller !== undefined)
      return { ok: false, pos, expected: ['no controller'] } as never;
    const noun: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: {
        ...filter,
        controller: {
          noun: player,
          // "that player or that planeswalker's controller controls" (stage P47, D-200): the controller of a planeswalker target too.
          ...(/ or that planeswalker/i.test(suffix.value[0])
            ? { orPlaneswalkerController: true as const }
            : {}),
        },
        raw: ctx.text.slice(pos, r.pos),
      },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: r.pos },
      rule: 'noun.each-permanent-of-player',
    };
    return { ok: true, value: noun, pos: r.pos };
  },
});

export const KORVOLD_NOUN_RULES = [NOUN_THAT_OBJECT];
/** Before `noun.player` and `noun.each-permanent`, whose phrases are the first words of these. */
export const KORVOLD_EARLY_NOUN_RULES = [
  NOUN_PLAYER_OR_PLANESWALKER,
  NOUN_EACH_PERMANENT_OF_PLAYER,
];
