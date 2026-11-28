/**
 * Token rules of the Family Matters deck, group C (Helm of the Host, Echoing Assault): copies of a permanent with one exception to their characteristics.
 *
 * - `token.copy-token-not-legendary`: "a token that's a copy of equipped creature, except the token isn't legendary" (CR 707.9b, 205.4a).
 * - `token.copy-except-one-one`: "a token that's a copy of that creature, except it's 1/1" (CR 707.9b, 707.9d).
 */
import { choice, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrNoun, IrToken } from '../../ir/types';
import { defineRule, family, node, spanned } from '../registry';

type Bare = Omit<IrToken, 'span' | 'rule'>;

/** What the copy is made of: the permanent the words name ("~", "target creature", "it"), "equipped creature" or "enchanted creature", or "that creature" of the sentence before. */
const COPY_SOURCE = choice(
  satisfy(
    family<IrNoun>('noun', {
      only: ['noun.self', 'noun.target-permanent', 'noun.it', 'noun.that-card'],
    }),
    (noun) => !noun.plural,
  ),
  family<IrNoun>('noun', { only: ['noun.attached-permanent'] }),
  satisfy(family<IrNoun>('noun', { only: ['noun.that-object'] }), (noun) =>
    /^that creature$/iu.test(noun.filter.raw.trim()),
  ),
);

const ONE = map(
  spanned(pattern(/an? /i)),
  ({ span }): IrAmount => ({
    kind: 'number',
    value: 1,
    span,
  }),
);

export const TOKEN_COPY_TOKEN_NOT_LEGENDARY = defineRule<IrToken>({
  id: 'token.copy-token-not-legendary',
  family: 'token',
  leading: [],
  cites: [
    'CR 707.9b (Copying Objects)',
    'CR 707.2 (Copying Objects)',
    'CR 205.4a (Supertypes)',
    'CR 111.4 (Tokens)',
  ],
  examples: [
    'a token that’s a copy of equipped creature, except the token isn’t legendary',
    "a token that's a copy of equipped creature, except the token isn't legendary",
    'a token that’s a copy of enchanted creature, except the token isn’t legendary',
    'a token that’s a copy of target creature you control, except the token isn’t legendary',
  ],
  rejects: [
    'a token that’s a copy of equipped creature',
    'a token that’s a copy of equipped creature, except it’s not legendary',
    'a token that’s a copy of equipped creature, except the token is legendary',
    'a token that’s a copy of equipped creature, except the token isn’t legendary and has haste',
    'a token that’s a copy of equipped creature, except the token isn’t legendary.',
    'two tokens that are copies of equipped creature, except the tokens aren’t legendary',
    'a tapped token that’s a copy of equipped creature, except the token isn’t legendary',
    'a token that’s a copy of those cards, except the token isn’t legendary',
  ],
  parse: node<Bare, IrToken>(
    'token.copy-token-not-legendary',
    map(
      sequence(
        ONE,
        pattern(/token that['’]s a copy of /i),
        COPY_SOURCE,
        pattern(
          /, except the token isn['’]t legendary(?![\p{L}\p{N}'’])(?!\s+and(?![\p{L}\p{N}]))/iu,
        ),
      ),
      ([count, , copyOf]): Bare => ({
        kind: 'token',
        copyOf,
        count,
        copyNotLegendary: true,
      }),
    ),
    (b) => b,
  ),
});

export const TOKEN_COPY_EXCEPT_ONE_ONE = defineRule<IrToken>({
  id: 'token.copy-except-one-one',
  family: 'token',
  leading: [],
  cites: [
    'CR 707.9b (Copying Objects)',
    'CR 707.9d (Copying Objects)',
    'CR 707.2 (Copying Objects)',
    'CR 111.4 (Tokens)',
  ],
  examples: [
    'a token that’s a copy of that creature, except it’s 1/1',
    "a token that's a copy of that creature, except it's 1/1",
    'a token that’s a copy of target creature, except it’s 2/2',
    'a token that’s a copy of ~, except it’s 0/1',
  ],
  rejects: [
    'a token that’s a copy of that creature, except it’s 1/1 and it’s a Nightmare in addition to its other types',
    'a token that’s a copy of that creature, except it’s 1/1 and has haste',
    'a token that’s a copy of that creature, except it’s a 1/1',
    'a token that’s a copy of that creature, except it’s X/X',
    'a token that’s a copy of that creature, except it’s 1/',
    'a token that’s a copy of that creature, except it’s black 1/1',
    'a token that’s a copy of that permanent, except it’s 1/1',
    'two tokens that are copies of that creature, except they’re 1/1',
    'a token that’s a copy of that creature',
  ],
  parse: node<Bare, IrToken>(
    'token.copy-except-one-one',
    map(
      sequence(
        ONE,
        pattern(/token that['’]s a copy of /i),
        COPY_SOURCE,
        pattern(/, except it['’]s (\d+)\/(\d+)(?![\p{L}\p{N}/'’])(?!\s+and(?![\p{L}\p{N}]))/iu),
      ),
      ([count, , copyOf, pt]): Bare => ({
        kind: 'token',
        copyOf,
        count,
        copySetPt: { power: Number(pt[1]), toughness: Number(pt[2]) },
      }),
    ),
    (b) => b,
  ),
});

export const FAMILY_MATTERS_C_TOKEN_RULES = [
  TOKEN_COPY_TOKEN_NOT_LEGENDARY,
  TOKEN_COPY_EXCEPT_ONE_ONE,
];
