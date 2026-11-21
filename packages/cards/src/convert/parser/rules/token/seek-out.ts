/**
 * `token.copy-not-legendary-adds-types`: "a token that's a copy of another target creature you control, except it isn't legendary, it's an Illusion artifact in addition to its other
 * types, and it has haste" (Reg Barclay, Fidgety Fantasist; Federation Fleet deck, group A). A copy with exceptions to its supertypes, its types and its abilities (CR 707.9b: an
 * exception is part of the copiable values of the copy; CR 205.4a: legendary is a supertype; CR 707.9a: the abilities it has besides the copied ones). The engine's `createToken` of a
 * `copyOf` with `notLegendary`, `addSubtypes`, `addTypes` and `abilities`. Read apart from `token.copy-not-legendary` (a loyalty) and `token.copy-except-additive` (a power and toughness).
 */
import { literal, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrNoun, IrToken } from '../../ir/types';
import { KEYWORD_WORDS } from '../keyword/list';
import { defineRule, family, node, spanned } from '../registry';

type Bare = Omit<IrToken, 'span' | 'rule'>;

const COPY_SOURCES = ['noun.self', 'noun.target-permanent', 'noun.it', 'noun.that-card'] as const;
const COPY_SOURCE = satisfy(family<IrNoun>('noun', { only: COPY_SOURCES }), (noun) => !noun.plural);

const CARD_TYPE_WORD = pattern(/(artifact|enchantment|creature)(?![\p{L}\p{N}])/u);

export const TOKEN_COPY_NOT_LEGENDARY_ADDS_TYPES = defineRule<IrToken>({
  id: 'token.copy-not-legendary-adds-types',
  family: 'token',
  leading: [],
  cites: [
    'CR 707.9b (Copying Objects)',
    'CR 707.9a (Copying Objects)',
    'CR 707.2 (Copying Objects)',
    'CR 205.4a (Supertypes)',
    'CR 111.4 (Tokens)',
  ],
  examples: [
    'a token that’s a copy of another target creature you control, except it isn’t legendary, it’s an Illusion artifact in addition to its other types, and it has haste',
    "a token that's a copy of target creature you control, except it isn't legendary, it's a Spirit artifact in addition to its other types, and it has flying and haste",
  ],
  rejects: [
    'a token that’s a copy of target creature you control, except it isn’t legendary',
    'a token that’s a copy of target creature you control, except it isn’t legendary, it’s an Illusion artifact in addition to its other types',
    'a token that’s a copy of target creature you control, except it isn’t legendary, it’s an Illusion artifact in addition to its other types, and it has',
    'a token that’s a copy of target creature you control, except it isn’t legendary, it’s an Illusion artifact in its other types, and it has haste',
    'a token that’s a copy of target creature you control, except it’s legendary, it’s an Illusion artifact in addition to its other types, and it has haste',
    'a token that’s a copy of target creature you control, except it isn’t legendary, it’s an illusion artifact in addition to its other types, and it has haste',
    'a token that’s a copy of target creature you control, except it isn’t legendary, it’s an Illusion land in addition to its other types, and it has haste',
    'a token that’s a copy of target creature you control, except it isn’t legendary, it’s an Illusion artifact in addition to its other types, and it has flash',
    'two tokens that are copies of target creature you control, except they aren’t legendary, they’re Illusion artifacts in addition to their other types, and they have haste',
    'a token that’s a copy of those creatures, except it isn’t legendary, it’s an Illusion artifact in addition to its other types, and it has haste',
  ],
  parse: node<Bare, IrToken>(
    'token.copy-not-legendary-adds-types',
    map(
      sequence(
        map(
          spanned(pattern(/an? /i)),
          ({ span }): IrAmount => ({ kind: 'number', value: 1, span }),
        ),
        pattern(/token that['’]s a copy of /i),
        COPY_SOURCE,
        pattern(/, except it isn['’]t legendary, it['’]s an? /iu),
        pattern(/[A-Z][a-z]+(?: [A-Z][a-z]+)*(?![\p{L}\p{N}])/u),
        literal(' '),
        CARD_TYPE_WORD,
        literal(' in addition to its other types, and it has '),
        KEYWORD_WORDS,
      ),
      ([count, , copyOf, , subtypes, , cardType, , keywords]): Bare => ({
        kind: 'token',
        copyOf,
        count,
        copyNotLegendary: true,
        copyAddsTypes: {
          subtypes: subtypes[0].split(' '),
          cardTypes: [cardType[1] ?? ''],
          keywords,
        },
      }),
    ),
    (b) => b,
  ),
});

export const SEEK_OUT_TOKEN_RULES = [TOKEN_COPY_NOT_LEGENDARY_ADDS_TYPES];
