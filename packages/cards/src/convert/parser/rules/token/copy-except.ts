/**
 * `token.copy-except`: "a tapped token that's a copy of that card, except it's a 4/4 black Zombie" (Hashaton, Scarab's Fist; Hashaton deck group 5, D-382, provisional number).
 * A copy with an exception that gives the characteristics a value (CR 707.9b: the final set of values is part of the copiable values of the copy; CR 707.9d: a
 * characteristic-defining ability of the original that defines a characteristic the exception gives a value to is not copied). The engine's `createToken` of a `copyOf` with
 * `setPt`, `setColors` and `setCreatureTypes`, tapped when the words say it (CR 110.5b).
 */
import {
  choice,
  literal,
  map,
  optional,
  pattern,
  satisfy,
  separatedBy1,
  sequence,
} from '../../combinators';
import type { IrAmount, IrNoun, IrToken } from '../../ir/types';
import { defineRule, family, node, spanned } from '../registry';

type Bare = Omit<IrToken, 'span' | 'rule'>;

const COPY_SOURCES = ['noun.self', 'noun.target-permanent', 'noun.it', 'noun.that-card'] as const;

const COPY_SOURCE = satisfy(family<IrNoun>('noun', { only: COPY_SOURCES }), (noun) => !noun.plural);

const COLOR_WORD = pattern(/(white|blue|black|red|green)(?![\p{L}\p{N}])/iu);

/** One or more colors, joined by commas and "and" ("black", "white and blue"); "colorless" is no color. */
const COLORS = choice<string[]>(
  map(pattern(/colorless(?![\p{L}\p{N}])/iu), (): string[] => []),
  satisfy(
    separatedBy1(
      map(COLOR_WORD, (m) => (m[1] ?? '').toLowerCase()),
      choice(literal(', and '), literal(', '), literal(' and ')),
    ),
    (colors) => new Set(colors).size === colors.length,
  ),
);

/** Creature types as printed: capitalized words ("Zombie", "Elf Warrior"). */
const SUBTYPES = map(pattern(/[A-Z][a-z]+(?: [A-Z][a-z]+)*(?![\p{L}\p{N}])/u), (m) =>
  m[0].split(' '),
);

export const TOKEN_COPY_EXCEPT = defineRule<IrToken>({
  id: 'token.copy-except',
  family: 'token',
  leading: [],
  cites: [
    'CR 707.9b (Copying Objects)',
    'CR 707.9d (Copying Objects)',
    'CR 707.2 (Copying Objects)',
    'CR 111.4 (Tokens)',
    'CR 110.5b (Permanent Status)',
  ],
  examples: [
    'a tapped token that’s a copy of that card, except it’s a 4/4 black Zombie',
    'a token that’s a copy of that card, except it’s a 4/4 black Zombie',
    'a token that’s a copy of target creature, except it’s a 1/1 white Spirit',
    'a tapped token that’s a copy of ~, except it’s a 2/2 blue and red Elf Wizard',
  ],
  rejects: [
    'a token that’s a copy of that card',
    'a token that’s a copy of that card, except it’s a 4/4',
    'a token that’s a copy of target creature, except it’s a 1/1',
    'a token that’s a copy of that card, except it’s black',
    'a token that’s a copy of that card, except it’s a 4/4 black Zombie in addition to its other types',
    'a token that’s a copy of that card, except it’s a 4/4 black zombie',
    'a token that’s a copy of that card, except it’s a 4/4 black Zombie and has haste',
    'a token that’s a copy of that card, except it has haste',
    'two tokens that are copies of that card, except they’re 4/4 black Zombies',
    'a tapped tapped token that’s a copy of that card, except it’s a 4/4 black Zombie',
    'a token that’s a copy of those cards, except it’s a 4/4 black Zombie',
  ],
  parse: node<Bare, IrToken>(
    'token.copy-except',
    map(
      sequence(
        map(
          spanned(pattern(/an? /i)),
          ({ span }): IrAmount => ({ kind: 'number', value: 1, span }),
        ),
        optional(
          map(literal('tapped '), () => true as const),
          null,
        ),
        pattern(/token that['’]s a copy of /i),
        COPY_SOURCE,
        pattern(/, except it['’]s an? (\d+)\/(\d+) /i),
        COLORS,
        literal(' '),
        SUBTYPES,
        optional(
          map(literal(' creature'), () => true as const),
          null,
        ),
      ),
      ([count, tapped, , copyOf, pt, colors, , subtypes]): Bare => ({
        kind: 'token',
        copyOf,
        count,
        ...(tapped === null ? {} : { tapped }),
        copyExcept: {
          power: Number(pt[1]),
          toughness: Number(pt[2]),
          colors,
          subtypes,
        },
      }),
    ),
    (b) => b,
  ),
});
