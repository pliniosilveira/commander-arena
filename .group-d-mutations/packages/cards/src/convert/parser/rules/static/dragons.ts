/**
 * Static ability rules of stage P34 (D-151, D-152): what the engine's Dragons slice reads. Mana that does not empty as steps and phases end (CR
 * 500.5), casting spells from the top of the library (CR 601.3, 401.5) and what a permanent is while a condition holds ("~ is a Dragon with base
 * power and toughness 4/4, flying, and "{R}: ..."", CR 613.1d, 613.4b, 613.1f), which `static.conditional-prefix` reads as one of its statements.
 */
import {
  choice,
  fail,
  literal,
  map,
  optional,
  type Parser,
  pattern,
  quiet,
  sequence,
} from '../../combinators';
import type { IrFilter, IrNoun, IrStatic, IrStaticEffect } from '../../ir/types';
import { BASE_PT, CREATURE_TYPE_LIST } from '../effect/becomes';
import { KEYWORD_WORDS } from '../keyword/list';
import { CARD_TYPES, comparisonSuffix, typeWords, withComparison } from '../noun/phrases';
import { defineRule, family, quietly } from '../registry';
import type { StaticUnit } from './grants';
import { QUOTED_ABILITY } from './quoted';

const COLOR_LETTERS: Readonly<Record<string, string>> = {
  white: 'W',
  blue: 'U',
  black: 'B',
  red: 'R',
  green: 'G',
  colorless: 'C',
};

function youNoun(rule: string, pos: number): IrNoun {
  return {
    kind: 'noun',
    det: 'you',
    filter: { raw: 'You' },
    upTo: false,
    plural: false,
    other: false,
    span: { start: pos, end: pos + 3 },
    rule,
  };
}

/**
 * `static.unspent-mana`: "You don't lose unspent red mana as steps and phases end." (CR 500.5, 106.4: mana empties from a player's pool as each
 * step and phase ends; this ability keeps the mana of the color it names). One color word, or none for mana of every color.
 */
export const STATIC_UNSPENT_MANA = defineRule<IrStatic>({
  id: 'static.unspent-mana',
  family: 'static',
  leading: ['you'],
  cites: [
    'CR 500.5 (Beginning of Turn)',
    'CR 106.4 (Mana)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    "You don't lose unspent red mana as steps and phases end.",
    'You don’t lose unspent green mana as steps and phases end.',
    "You don't lose unspent mana as steps and phases end.",
    "You don't lose unspent colorless mana as steps and phases end.",
  ],
  rejects: [
    "You don't lose unspent red mana as steps and phases end",
    "You don't lose unspent red mana as steps end.",
    "You don't lose unspent red and green mana as steps and phases end.",
    "You don't lose unspent red mana as phases end.",
    "You don't lose red mana as steps and phases end.",
    "You don't lose unspent red mana as steps and phases end and you gain 1 life.",
    "Each player doesn't lose unspent red mana as steps and phases end.",
    "You don't lose unspent red mana as steps and phases end until end of turn.",
    'You lose unspent red mana as steps and phases end.',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /you don['’]t lose unspent (?:(white|blue|black|red|green|colorless) )?mana as steps and phases end\./iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const word = (r.value[1] ?? '').toLowerCase();
    const colors = word === '' ? ['W', 'U', 'B', 'R', 'G', 'C'] : [COLOR_LETTERS[word] ?? ''];
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: youNoun('static.unspent-mana', pos),
        effects: [{ kind: 'unspentManaStays', colors }],
        span: { start: pos, end: r.pos },
        rule: 'static.unspent-mana',
      },
      pos: r.pos,
    };
  },
});

/**
 * `static.cast-from-top`: "You may cast creature spells with power 4 or greater from the top of your library. If you cast a creature spell this
 * way, it gains haste until end of turn." (CR 601.3, 401.5, 702.10: the player may cast the top card of their library when it is a spell of the
 * kind, at the timing of its type and for its ordinary cost). The kind is the card types and the comparisons of a card ("with power 4 or greater",
 * "with mana value 3 or less"); the second sentence is only said of creature spells. It does not let the player look at the card, which is the
 * ability "You may look at the top card of your library any time." by itself.
 */
export const STATIC_CAST_FROM_TOP = defineRule<IrStatic>({
  id: 'static.cast-from-top',
  family: 'static',
  leading: ['you'],
  cites: [
    'CR 601.3 (Casting Spells)',
    'CR 401.5 (Library)',
    'CR 702.10 (Haste)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    'You may cast creature spells with power 4 or greater from the top of your library. If you cast a creature spell this way, it gains haste until end of turn.',
    'You may cast creature spells from the top of your library.',
    'You may cast artifact spells with mana value 3 or less from the top of your library.',
    'You may cast spells from the top of your library.',
  ],
  rejects: [
    'You may cast creature spells from the top of your library',
    'You may cast creature spells from the top of your graveyard.',
    'You may cast creature spells from the top of an opponent’s library.',
    'You may cast creature spells with power 4 or greater from the top of your library. If you cast a creature spell this way, it gains flying until end of turn.',
    'You may cast artifact spells from the top of your library. If you cast a creature spell this way, it gains haste until end of turn.',
    'You may cast creature spells from the top of your library. If you cast a creature spell this way, it gains haste.',
    'You may cast creature spells from the top of your library and the bottom of your library.',
    'You may cast a creature spell from the top of your library.',
    'You may cast creature spells from the top of your library once each turn.',
    'You may play lands from the top of your library.',
    'You may cast creature spells from the top of your library. You may look at the top card of your library any time.',
    'You may cast creature cards from the top of your library.',
  ],
  parse: (ctx, pos) => {
    const id = 'static.cast-from-top';
    const r = sequence(
      literal('you may cast '),
      optional(
        map(sequence(typeWords(CARD_TYPES, false), literal(' ')), ([types]) => types),
        [] as string[],
      ),
      literal('spells'),
      optional(
        map(comparisonSuffix(['power', 'toughness', 'manaValue']), (c) => c),
        undefined,
      ),
      pattern(new RegExp(` from the top of your library\\.${''}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, types, , compared] = r.value;
    const base: IrFilter = {
      ...(types.length > 0 ? { types } : {}),
      raw: ctx.text.slice(pos, r.pos),
    };
    const spells = withComparison(base, compared);
    // "If you cast a creature spell this way, it gains haste until end of turn.": said of creature spells.
    const haste = pattern(
      / if you cast a creature spell this way, it gains haste until end of turn\./iu,
    )(ctx, r.pos);
    if (haste.ok && !types.includes('creature')) return fail(ctx, r.pos);
    const end = haste.ok ? haste.pos : r.pos;
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: youNoun(id, pos),
        effects: [{ kind: 'castFromTop', spells, gainsHaste: haste.ok }],
        span: { start: pos, end },
        rule: id,
      },
      pos: end,
    };
  },
});

/**
 * What `~` is while a condition holds: "~ is a Dragon with base power and toughness 4/4, flying, and "{R}: Dragons you control get +1/+0 until end
 * of turn."" (CR 613.1d, 613.4b, 613.1f). Creature types that replace its own (the card types stay), base power and toughness, keywords, and an
 * ability in quotes, each its own effect of the statement, as the layers apply them. A unit of `static.conditional-prefix`.
 */
export const SELF_BECOMES_UNIT: Parser<StaticUnit> = (ctx, pos) => {
  const self = quiet(family<IrNoun>('noun', { only: ['noun.self'] }))(ctx, pos);
  if (!self.ok) return self;
  const is = sequence(
    pattern(/ is an? /iu),
    CREATURE_TYPE_LIST,
    optional(
      map(sequence(literal(' with '), BASE_PT('static.conditional-prefix')), ([, pt]) => pt),
      null,
    ),
  )(ctx, self.pos);
  if (!is.ok) return is;
  const [, subtypes, basePt] = is.value;
  const effects: IrStaticEffect[] = [{ kind: 'replaceTypes', cardTypes: [], subtypes }];
  if (basePt !== null) {
    effects.push({ kind: 'basePt', power: basePt.power, toughness: basePt.toughness });
  }
  let at = is.pos;
  const keywords = sequence(literal(', '), KEYWORD_WORDS)(ctx, at);
  if (keywords.ok) {
    for (const keyword of keywords.value[1]) effects.push({ kind: 'grantKeyword', keyword });
    at = keywords.pos;
  }
  const quoted = sequence(choice(literal(', and '), literal(' and ')), QUOTED_ABILITY)(ctx, at);
  if (quoted.ok) {
    effects.push(...quoted.value[1]);
    at = quoted.pos;
  }
  // A statement that is nothing but a creature type and numbers is `static.attached-becomes`'s way of speaking; here at least one thing more
  // than the type is said, or the keywords and the ability.
  if (basePt === null && !keywords.ok && !quoted.ok) return fail(ctx, pos);
  return { ok: true, value: { noun: self.value, effects }, pos: at };
};

export const DRAGON_STATIC_RULES = [STATIC_UNSPENT_MANA, STATIC_CAST_FROM_TOP].map(quietly);
