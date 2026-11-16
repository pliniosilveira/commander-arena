/**
 * `token.copy-not-legendary`: "a token that's a copy of ~, except it's not legendary and its starting loyalty is 1" (Jace, Mirror Mage; Galadriel deck, group 3).
 * A copy with exceptions to its supertypes and loyalty (CR 707.9b: an exception is part of the copiable values of the copy; CR 205.4a: legendary is a supertype; CR 306.5b: a
 * planeswalker enters with loyalty counters equal to its starting loyalty, the loyalty its copiable values give a token copy). The engine's `createToken` of a `copyOf` with
 * `notLegendary` and `startingLoyalty`.
 */
import { map, optional, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrNoun, IrToken } from '../../ir/types';
import { defineRule, family, node, spanned } from '../registry';

type Bare = Omit<IrToken, 'span' | 'rule'>;

const COPY_SOURCES = ['noun.self', 'noun.target-permanent', 'noun.it', 'noun.that-card'] as const;
const COPY_SOURCE = satisfy(family<IrNoun>('noun', { only: COPY_SOURCES }), (noun) => !noun.plural);

export const TOKEN_COPY_NOT_LEGENDARY = defineRule<IrToken>({
  id: 'token.copy-not-legendary',
  family: 'token',
  leading: [],
  cites: [
    'CR 707.9b (Copying Objects)',
    'CR 707.2 (Copying Objects)',
    'CR 205.4a (Supertypes)',
    'CR 306.5b (Planeswalkers)',
    'CR 111.4 (Tokens)',
  ],
  examples: [
    'a token that’s a copy of ~, except it’s not legendary and its starting loyalty is 1',
    "a token that's a copy of ~, except it's not legendary and its starting loyalty is 1",
    'a token that’s a copy of ~, except it’s not legendary',
    'a token that’s a copy of target planeswalker you control, except it’s not legendary and its starting loyalty is 3',
    'a token that’s a copy of it, except it’s not legendary',
  ],
  rejects: [
    'a token that’s a copy of ~',
    'a token that’s a copy of ~, except its starting loyalty is 1',
    'a token that’s a copy of ~, except it’s not legendary and its starting loyalty is one',
    'a token that’s a copy of ~, except it’s not legendary and its starting loyalty is X',
    'a token that’s a copy of ~, except it’s not legendary and its starting loyalty is 1 and it has haste',
    'a token that’s a copy of ~, except it’s legendary',
    'a token that’s a copy of ~, except it’s not legendary and has haste',
    'a token that’s a copy of ~, except it’s a 4/4 black Zombie',
    'two tokens that are copies of ~, except they’re not legendary',
    'a tapped token that’s a copy of ~, except it’s not legendary',
    'a token that’s a copy of those cards, except it’s not legendary',
    'a token that’s a copy of ~, except it’s not legendary and its starting loyalty is 1.',
  ],
  parse: node<Bare, IrToken>(
    'token.copy-not-legendary',
    map(
      sequence(
        map(
          spanned(pattern(/an? /i)),
          ({ span }): IrAmount => ({ kind: 'number', value: 1, span }),
        ),
        pattern(/token that['’]s a copy of /i),
        COPY_SOURCE,
        pattern(/, except it['’]s not legendary(?![\p{L}\p{N}])/iu),
        optional(
          map(pattern(/ and its starting loyalty is (\d+)(?![\p{L}\p{N}])/iu), (m) => Number(m[1])),
          null,
        ),
      ),
      ([count, , copyOf, , loyalty]): Bare => ({
        kind: 'token',
        copyOf,
        count,
        copyNotLegendary: true,
        ...(loyalty === null ? {} : { copyStartingLoyalty: loyalty }),
      }),
    ),
    (b) => b,
  ),
});

export const GALADRIEL_G3_TOKEN_RULES = [TOKEN_COPY_NOT_LEGENDARY];
