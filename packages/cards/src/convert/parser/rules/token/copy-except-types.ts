/**
 * Token copies of the Aetherdrift energy deck (issue 105): "a token that's a copy of target permanent you control, except it's a 5/5 artifact creature in addition to its other types and has
 * haste" (Saheeli, Radiant Creator; CR 707.9b: the final set of values of each characteristic is part of the copiable values of the copy; CR 707.9d: a characteristic-defining ability that
 * defines the power and toughness the exception gives is not copied). The same engine reading as `token.copy-except-additive`, with card types and no creature type of its own.
 */
import { choice, literal, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrNoun, IrToken } from '../../ir/types';
import { KEYWORD_WORD, keywordWordsOf } from '../keyword/list';
import { defineRule, family, node, spanned } from '../registry';

type Bare = Omit<IrToken, 'span' | 'rule'>;

const COPY_SOURCE = satisfy(
  family<IrNoun>('noun', {
    only: ['noun.self', 'noun.target-permanent', 'noun.it', 'noun.that-card'],
  }),
  (noun) => !noun.plural,
);

/** The card types the copy has besides its own: "artifact creature" (the creature last, as a card's type line writes them). */
const ADDED_TYPES = choice(
  map(literal('artifact creature'), () => ['artifact', 'creature']),
  map(literal('enchantment creature'), () => ['enchantment', 'creature']),
);

export const TOKEN_COPY_EXCEPT_ADDITIVE_TYPES = defineRule<IrToken>({
  id: 'token.copy-except-additive-types',
  family: 'token',
  leading: [],
  cites: ['CR 707.9b (Copying Objects)', 'CR 707.9d (Copying Objects)', 'CR 111.4 (Tokens)'],
  examples: [
    'a token that’s a copy of target permanent, except it’s a 5/5 artifact creature in addition to its other types',
    'a token that’s a copy of target permanent, except it’s a 5/5 artifact creature in addition to its other types and has haste',
    'a token that’s a copy of ~, except it’s a 2/2 enchantment creature in addition to its other types and has flying',
  ],
  rejects: [
    'a token that’s a copy of target permanent, except it’s a 5/5 artifact creature',
    'a token that’s a copy of target permanent, except it’s a 5/5 artifact creature in addition to its other types and has flash',
    'a token that’s a copy of target permanent, except it’s a 5/5 artifact in addition to its other types',
    'a token that’s a copy of target permanent, except it’s a 5/5 Dragon creature in addition to its other types',
    'a token that’s a copy of target permanent, except it’s a 5/5 artifact creature in addition to its other types and it has haste',
    'two tokens that are copies of target permanent, except they’re 5/5 artifact creatures in addition to their other types',
    'a token that’s a copy of those cards, except it’s a 5/5 artifact creature in addition to its other types',
  ],
  parse: node<Bare, IrToken>(
    'token.copy-except-additive-types',
    map(
      sequence(
        map(
          spanned(pattern(/an? /i)),
          ({ span }): IrAmount => ({ kind: 'number', value: 1, span }),
        ),
        pattern(/token that['’]s a copy of /i),
        COPY_SOURCE,
        pattern(/, except it['’]s an? (\d+)\/(\d+) /i),
        ADDED_TYPES,
        literal(' in addition to its other types'),
        choice(
          map(sequence(literal(' and has '), keywordWordsOf(KEYWORD_WORD)), ([, words]) => words),
          map(literal(''), (): string[] => []),
        ),
      ),
      ([count, , copyOf, pt, cardTypes, , keywords]): Bare => ({
        kind: 'token',
        copyOf,
        count,
        copyExceptAdditive: {
          power: Number(pt[1]),
          toughness: Number(pt[2]),
          subtypes: [],
          cardTypes,
          keywords,
        },
      }),
    ),
    (b) => b,
  ),
});

/**
 * `token.copy-except-set-types`: "a token that's a copy of that card, except it's an artifact and it loses all other card types" (Espers to Magicite; CR 707.9b: the final set of values of each
 * characteristic is part of the copiable values of the copy). The copy has the one card type the words name and none of the ones it copies. The engine's `createToken` of a `copyOf` with
 * `setTypes`. Not read: a power and toughness, a color, a creature type, "in addition to its other types" (the additive rules), more than one type, a keyword, another rider.
 */
export const TOKEN_COPY_EXCEPT_SET_TYPES = defineRule<IrToken>({
  id: 'token.copy-except-set-types',
  family: 'token',
  leading: [],
  cites: ['CR 707.9b (Copying Objects)', 'CR 111.4 (Tokens)'],
  examples: [
    'a token that’s a copy of that card, except it’s an artifact and it loses all other card types',
    'a token that’s a copy of that card, except it’s an enchantment and it loses all other card types',
  ],
  rejects: [
    'a token that’s a copy of that card, except it’s an artifact',
    'a token that’s a copy of that card, except it’s an artifact in addition to its other types',
    'a token that’s a copy of that card, except it’s an artifact and it loses all other card types and has haste',
    'a token that’s a copy of that card, except it’s an artifact creature and it loses all other card types',
    'a token that’s a copy of that card, except it’s a 4/4 artifact and it loses all other card types',
    'a token that’s a copy of that card, except it’s an artifact and it loses all other creature types',
    'two tokens that are copies of that card, except they’re artifacts and they lose all other card types',
    'a token that’s a copy of those cards, except it’s an artifact and it loses all other card types',
  ],
  parse: node<Bare, IrToken>(
    'token.copy-except-set-types',
    map(
      sequence(
        map(
          spanned(pattern(/an? /i)),
          ({ span }): IrAmount => ({ kind: 'number', value: 1, span }),
        ),
        pattern(/token that['’]s a copy of /i),
        COPY_SOURCE,
        pattern(
          /, except it['’]s an? (artifact|enchantment) and it loses all other card types(?![\p{L}\p{N}])/iu,
        ),
      ),
      ([count, , copyOf, type]): Bare => ({
        kind: 'token',
        copyOf,
        count,
        copySetTypes: [(type[1] ?? '').toLowerCase()],
      }),
    ),
    (b) => b,
  ),
});
