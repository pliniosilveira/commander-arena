/**
 * Noun rules for objects the acting player picks among without targeting (CR 701.21a, 608.2d):
 * "~" itself, and "a creature", "another permanent", "two lands" as the object of a sacrifice.
 * Neither says where to look: the verb's own rules do (a sacrifice is of permanents you control).
 */
import {
  choice,
  fail,
  literal,
  map,
  optional,
  type Parser,
  pattern,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrComparison, IrFilter, IrNoun } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule, family, node, spanned } from '../registry';
import { graveyardPhrase, PLURAL_TYPE_UNION, permanentPhrase, withoutZone } from './phrases';

type Bare = Omit<IrNoun, 'span' | 'rule'>;

function bare(det: IrNoun['det'], filter: IrFilter, extra: Partial<Bare> = {}): Bare {
  return { kind: 'noun', det, filter, upTo: false, plural: false, other: false, ...extra };
}

/** `noun.self`: "~", the permanent or card the ability is on (CR 201.5). */
export const NOUN_SELF = defineRule<IrNoun>({
  id: 'noun.self',
  family: 'noun',
  leading: ['~'],
  cites: ['CR 201.5 (Name)'],
  examples: ['~'],
  rejects: ['~ enters', '~s', 'it', 'target creature'],
  parse: node<string, IrNoun>(
    'noun.self',
    map(literal('~'), (raw) => raw),
    (raw) => bare('self', { raw }),
  ),
});

/** A permanent phrase without a zone, and not "an opponent controls": you only have your own. */
function chosenPhrase(plural: boolean): Parser<IrFilter> {
  return satisfy(
    map(permanentPhrase(plural, 'all'), withoutZone),
    (filter) => filter.controller !== 'opponent',
  );
}

/**
 * `noun.a-permanent`: "a creature", "another permanent", "two lands": the acting player chooses
 * among the permanents that match (CR 608.2d), as in "sacrifice a creature" (CR 701.21). A count
 * is two or more (and may say "other": "two other creatures", D-485); "another" means any permanent but the source (CR 109.1). "Up to one" is an
 * optional resolving choice, not a target.
 */
export const NOUN_A_PERMANENT = defineRule<IrNoun>({
  id: 'noun.a-permanent',
  family: 'noun',
  // A count can be any number word or digit, so every position is tried.
  leading: [],
  cites: ['CR 701.21a (Sacrifice)', 'CR 608.2d (Resolving Spells and Abilities)'],
  examples: [
    'another permanent',
    'a creature',
    'a nontoken creature',
    'an artifact',
    'a nonland permanent',
    'two lands',
    'a Treasure',
    'a Dragon',
    'two Clues',
    'two other creatures',
    'three other artifacts',
  ],
  rejects: [
    'target creature',
    'a creature an opponent controls',
    'all creatures',
    'a Banana',
    'two target creatures',
    'one creature',
    'a card',
    'one other creature',
    'two other',
    'two others',
    'two other creatures an opponent controls',
    'two other target creatures',
  ],
  parse: node<Bare, IrNoun>(
    'noun.a-permanent',
    choice<Bare>(
      map(
        sequence(
          spanned(satisfy(quantity, (n) => n >= 2)),
          literal(' '),
          // D-485 (Priest of Forgotten Gods): "two other creatures": all but the source of the ability (CR 109.1).
          optional(
            map(literal('other '), () => true),
            false,
          ),
          chosenPhrase(true),
        ),
        ([count, , other, filter]) =>
          bare('a', filter, {
            count: { kind: 'number', value: count.value, span: count.span },
            plural: true,
            other,
          }),
      ),
      map(sequence(literal('another '), chosenPhrase(false)), ([, filter]) =>
        bare('a', filter, { other: true }),
      ),
      map(sequence(pattern(/an? /i), chosenPhrase(false)), ([, filter]) => bare('a', filter)),
    ),
    (b) => b,
  ),
});

/** `noun.up-to-one-permanent`: one optional resolving selection, distinct from ordinary `a creature`. */
export const NOUN_UP_TO_ONE_PERMANENT = defineRule<IrNoun>({
  id: 'noun.up-to-one-permanent',
  family: 'noun',
  leading: ['up'],
  cites: ['CR 608.2d (Resolving Spells and Abilities)'],
  examples: ['up to one creature'],
  rejects: ['up to two creatures', 'up to one target creature'],
  parse: node<Bare, IrNoun>(
    'noun.up-to-one-permanent',
    map(sequence(literal('up to one '), chosenPhrase(false)), ([, filter]) =>
      bare('a', filter, { upTo: true }),
    ),
    (b) => b,
  ),
});

/** "Up to two creature cards from your graveyard": a resolving, optional choice (CR 608.2d). */
export const NOUN_UP_TO_GRAVEYARD_CARDS = defineRule<IrNoun>({
  id: 'noun.up-to-graveyard-cards',
  family: 'noun',
  leading: ['up'],
  cites: ['CR 404.1 (Graveyard)', 'CR 608.2d (Resolving Spells and Abilities)'],
  examples: ['up to two creature cards from your graveyard'],
  rejects: ['up to two target creature cards from your graveyard'],
  parse: node<Bare, IrNoun>(
    'noun.up-to-graveyard-cards',
    map(
      sequence(
        literal('up to '),
        spanned(satisfy(quantity, (n) => n >= 2)),
        literal(' '),
        graveyardPhrase(true),
      ),
      ([, count, , filter]) =>
        bare('a', filter, {
          count: { kind: 'number', value: count.value, span: count.span },
          plural: true,
          upTo: true,
        }),
    ),
    (b) => b,
  ),
});

/**
 * `noun.any-number-permanents`: "any number of other permanents", "any number of creatures you control" (CR 701.21a, 608.2d: the
 * player chooses among the permanents they control, and "any number" lets them choose none, some or all). The permanents are
 * plural, with "other" for all but the source (CR 109.1). Stage P30, D-135: the engine's `anyNumber` choice.
 */
export const NOUN_ANY_NUMBER_PERMANENTS = defineRule<IrNoun>({
  id: 'noun.any-number-permanents',
  family: 'noun',
  leading: ['any'],
  cites: [
    'CR 701.21a (Sacrifice)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 109.1 (Objects)',
  ],
  examples: [
    'any number of other permanents',
    'any number of permanents',
    'any number of creatures',
    'any number of other nonland permanents',
    'any number of other artifacts',
    'any number of Zombies',
  ],
  rejects: [
    'any number of other permanents an opponent controls',
    'any number of creature',
    'any number of',
    'any number of other',
    'any number of target creatures',
    'any number of cards',
    'a number of creatures',
    'any target',
  ],
  parse: node<{ filter: IrFilter; other: boolean }, IrNoun>(
    'noun.any-number-permanents',
    map(
      sequence(
        literal('any number of '),
        optional(
          map(literal('other '), () => true),
          false,
        ),
        chosenPhrase(true),
      ),
      ([, other, filter]) => ({ filter, other }),
    ),
    ({ filter, other }) => bare('a', filter, { plural: true, other, anyNumber: true }),
  ),
});

/**
 * `noun.one-or-more-permanents`: "one or more Treasures", "one or more other creatures" (CR 701.21a, 608.2d: the player chooses among the
 * permanents they control, and "one or more" lets them choose some or all, not none). Stage P41, D-188: the engine's `anyNumber` choice with
 * `atLeastOne`. The permanents are plural, with "other" for all but the source (CR 109.1).
 */
export const NOUN_ONE_OR_MORE_PERMANENTS = defineRule<IrNoun>({
  id: 'noun.one-or-more-permanents',
  family: 'noun',
  leading: ['one'],
  cites: [
    'CR 701.21a (Sacrifice)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 109.1 (Objects)',
  ],
  examples: [
    'one or more Treasures',
    'one or more other creatures',
    'one or more artifacts',
    'one or more other nonland permanents',
    'one or more Zombies',
  ],
  rejects: [
    'one or more Treasure',
    'one or more',
    'one or more other',
    'one or more Treasures an opponent controls',
    'one or more target creatures',
    'one or more cards',
    'one Treasure',
    'any number of Treasures',
    'two or more Treasures',
  ],
  parse: node<{ filter: IrFilter; other: boolean }, IrNoun>(
    'noun.one-or-more-permanents',
    map(
      sequence(
        literal('one or more '),
        optional(
          map(literal('other '), () => true),
          false,
        ),
        chosenPhrase(true),
      ),
      ([, other, filter]) => ({ filter, other }),
    ),
    ({ filter, other }) =>
      bare('a', filter, { plural: true, other, anyNumber: true, atLeastOne: true }),
  ),
});

/**
 * `noun.a-greatest-permanent`: "a creature with the greatest power among creatures they control" (CR 701.21a, 608.2d: the player who
 * sacrifices chooses; CR 208.1 power; CR 202.3 mana value): among the permanents of that kind that the player controls, only those
 * with the greatest value of the stat, which the player chooses among when several tie. The kind is said twice and must be the same:
 * "a creature ... among creatures they control". Stage P30, D-135: the engine's `greatest` choice.
 */
export const NOUN_A_GREATEST_PERMANENT = defineRule<IrNoun>({
  id: 'noun.a-greatest-permanent',
  family: 'noun',
  leading: ['a', 'an'],
  cites: [
    'CR 701.21a (Sacrifice)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 208.1 (Power/Toughness)',
    'CR 202.3 (Mana Value)',
  ],
  examples: [
    'a creature with the greatest power among creatures they control',
    'a creature with the greatest toughness among creatures they control',
    'a permanent with the greatest mana value among permanents they control',
    'an artifact with the greatest mana value among artifacts they control',
    'a nonland permanent with the greatest mana value among nonland permanents they control',
  ],
  rejects: [
    'a creature with the greatest power among creatures you control',
    'a creature with the greatest power among artifacts they control',
    'a creature with the greatest power among creatures',
    'a creature with the greatest power among creature they control',
    'a creature with the least power among creatures they control',
    'a creature with the greatest power',
    'a creature with the greatest loyalty among creatures they control',
    'creatures with the greatest power among creatures they control',
    'a creature an opponent controls with the greatest power among creatures they control',
  ],
  parse: node<{ filter: IrFilter; greatest: 'power' | 'toughness' | 'manaValue' }, IrNoun>(
    'noun.a-greatest-permanent',
    (ctx, pos) => {
      const head = sequence(
        pattern(/an? /i),
        satisfy(
          map(permanentPhrase(false, 'all'), withoutZone),
          (filter) => filter.controller === undefined,
        ),
        pattern(/ with the greatest (power|toughness|mana value) among /i),
        satisfy(
          map(permanentPhrase(true, 'all'), withoutZone),
          (filter) => filter.controller === undefined,
        ),
        literal(' they control'),
      )(ctx, pos);
      if (!head.ok) return head;
      const [, once, word, among] = head.value;
      // The same kind of permanent, once in the singular and once in the plural.
      const kind = (filter: IrFilter) => JSON.stringify({ ...filter, raw: '' });
      if (kind(once) !== kind(among)) return fail(ctx, pos);
      const stat = (word[1] ?? '').toLowerCase();
      const greatest =
        stat === 'power' ? 'power' : stat === 'toughness' ? 'toughness' : 'manaValue';
      return { ok: true, value: { filter: once, greatest }, pos: head.pos };
    },
    ({ filter, greatest }) => bare('a', filter, { greatest }),
  ),
});

/**
 * " that are one or more colors", " that are two or more colors", " that are exactly one color" (stage P31, CR 105.1, 105.2): how many
 * colors each of the permanents has, compared with a whole number (CR 105.2c: a colorless object has none).
 */
const COLOR_COUNT_SUFFIX: Parser<IrComparison> = choice(
  map(
    sequence(
      literal(' that are '),
      satisfy(quantity, (n) => n >= 1),
      pattern(/ or more colors(?![\p{L}\p{N}])/iu),
    ),
    ([, value]): IrComparison => ({ cmp: 'atLeast', value }),
  ),
  map(
    sequence(
      literal(' that are exactly '),
      satisfy(quantity, (n) => n >= 1),
      pattern(/ colors?(?![\p{L}\p{N}])/iu),
    ),
    ([, value]): IrComparison => ({ cmp: 'equal', value }),
  ),
);

/**
 * `noun.all-they-control`: "all permanents they control that are one or more colors", "all creatures they control", "all artifacts and
 * enchantments they control" (stage P31, D-140, CR 701.21a): every permanent of the kind that each player the sentence names controls,
 * as the object of "each player sacrifices": nobody chooses, each permanent goes with its own controller. The kind names no controller
 * of its own ("they" is the player), and a color count may follow (CR 105.2).
 */
export const NOUN_ALL_THEY_CONTROL = defineRule<IrNoun>({
  id: 'noun.all-they-control',
  family: 'noun',
  leading: ['all'],
  cites: ['CR 701.21a (Sacrifice)', 'CR 105.2 (Color)', 'CR 110.1 (Permanents)'],
  examples: [
    'all permanents they control that are one or more colors',
    'all permanents they control that are two or more colors',
    'all permanents they control that are exactly one color',
    'all creatures they control',
    'all artifacts and enchantments they control',
  ],
  rejects: [
    'all creatures you control they control',
    'all permanents they control that are zero or more colors',
    'all permanents they control that are one or more color',
    'all creatures',
    'all permanent they control',
  ],
  parse: node<IrFilter, IrNoun>(
    'noun.all-they-control',
    (ctx, pos) => {
      const r = sequence(
        literal('all '),
        satisfy(
          choice(PLURAL_TYPE_UNION, permanentPhrase(true, 'all')),
          (filter) =>
            filter.controller === undefined &&
            !(filter.notTypes?.includes('land') && filter.raw === 'nonland permanents'),
        ),
        literal(' they control'),
        optional(COLOR_COUNT_SUFFIX, undefined),
      )(ctx, pos);
      if (!r.ok) return r;
      const [, filter, , colorCount] = r.value;
      if (colorCount !== undefined && filter.colorCount !== undefined) return fail(ctx, pos);
      const raw = ctx.text.slice(pos, r.pos);
      return {
        ok: true,
        value: { ...filter, ...(colorCount === undefined ? {} : { colorCount }), raw },
        pos: r.pos,
      };
    },
    (filter) => bare('each', filter, { plural: true }),
  ),
});

/** The nonland phasing instruction binds its singular "they" to the earlier chosen player. */
export const NOUN_ALL_NONLAND_THEY_CONTROL = defineRule<IrNoun>({
  id: 'noun.all-nonland-they-control',
  family: 'noun',
  leading: ['all'],
  cites: ['CR 109.4 (Objects)', 'CR 110.1 (Permanents)', 'CR 702.26 (Phasing)'],
  examples: ['all nonland permanents they control'],
  rejects: ['all lands they control', 'all nonland permanent they control'],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('all nonland permanents '),
      family<IrNoun>('noun', { only: ['noun.they'] }),
      literal(' control'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, player] = r.value;
    return {
      ok: true,
      value: {
        kind: 'noun',
        det: 'each',
        filter: {
          notTypes: ['land'],
          zone: 'battlefield',
          controller: { noun: player },
          raw: ctx.text.slice(pos, r.pos),
        },
        upTo: false,
        plural: true,
        other: false,
        span: { start: pos, end: r.pos },
        rule: 'noun.all-nonland-they-control',
      },
      pos: r.pos,
    };
  },
});

/**
 * `noun.each-permanent-they-control`: "each creature they control", "each artifact they control" (CR 109.4, 110.1, 608.2c): every permanent of the kind that the player the
 * sentence names controls ("they" is the last player the text names, as for `noun.all-nonland-they-control`; the engine's `controlledBy` of that player). Not read: "all", "other",
 * a plural, a controller said twice ("each creature you control they control").
 */
export const NOUN_EACH_PERMANENT_THEY_CONTROL = defineRule<IrNoun>({
  id: 'noun.each-permanent-they-control',
  family: 'noun',
  leading: ['each'],
  cites: [
    'CR 109.4 (Objects)',
    'CR 110.1 (Permanents)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: ['each creature they control', 'each artifact they control'],
  rejects: [
    'each creature',
    'each creature you control',
    'each creatures they control',
    'all creatures they control',
    'each other creature they control',
    'each creature you control they control',
    'each creature that player controls',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('each '),
      permanentPhrase(false, 'all'),
      literal(' '),
      family<IrNoun>('noun', { only: ['noun.they'] }),
      literal(' control'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, filter, , player] = r.value;
    if (filter.controller !== undefined) return fail(ctx, pos);
    return {
      ok: true,
      value: {
        kind: 'noun',
        det: 'each',
        filter: { ...filter, controller: { noun: player }, raw: ctx.text.slice(pos, r.pos) },
        upTo: false,
        plural: false,
        other: false,
        span: { start: pos, end: r.pos },
        rule: 'noun.each-permanent-they-control',
      },
      pos: r.pos,
    };
  },
});

export const CHOOSE_NOUN_RULES = [
  NOUN_SELF,
  NOUN_A_GREATEST_PERMANENT,
  NOUN_A_PERMANENT,
  NOUN_ANY_NUMBER_PERMANENTS,
  NOUN_ONE_OR_MORE_PERMANENTS,
  NOUN_ALL_NONLAND_THEY_CONTROL,
  NOUN_ALL_THEY_CONTROL,
  NOUN_EACH_PERMANENT_THEY_CONTROL,
];
