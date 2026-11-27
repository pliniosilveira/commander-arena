/**
 * `token.copy-except-pt`: "a token that's a copy of enchanted creature, except the token is 1/1" (Endless Evil; CR 707.9b: the final set of values of each characteristic is part of the
 * copiable values of the copy; CR 707.9d: a characteristic-defining ability of the original that defines the power or toughness the exception gives is not copied). Only the power and the
 * toughness change: colors, types and abilities are the ones the original has. The permanent copied is the one the Aura is attached to (an Equipment's "equipped creature" is not read). The engine's `createToken` of a `copyOf` with
 * `setPt`. Not read: another subject, a color or a type in the exception, "in addition to", a second exception, "a" before the numbers ("except it's a 1/1" has its own rule).
 */
import { choice, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrNoun, IrToken } from '../../ir/types';
import { defineRule, family, node, spanned } from '../registry';

type Bare = Omit<IrToken, 'span' | 'rule'>;

export const TOKEN_COPY_EXCEPT_PT = defineRule<IrToken>({
  id: 'token.copy-except-pt',
  family: 'token',
  leading: [],
  cites: ['CR 707.9b (Copying Objects)', 'CR 707.9d (Copying Objects)', 'CR 111.4 (Tokens)'],
  examples: ['a token that’s a copy of enchanted creature, except the token is 1/1'],
  rejects: [
    'a token that’s a copy of enchanted creature, except the token is 1/1 and has haste',
    'a token that’s a copy of enchanted creature, except the token is a 1/1',
    'a token that’s a copy of enchanted creature, except the token is black 1/1',
    'a token that’s a copy of enchanted creature, except the token is 1/1 black',
    'a token that’s a copy of enchanted creature, except the token is 1/',
    'a token that’s a copy of enchanted creature, except the token isn’t legendary',
    'a token that’s a copy of enchanted creature',
    'a token that’s a copy of equipped creature, except the token is 1/1',
    'a token that’s a copy of target creature, except the token is 1/1',
    'two tokens that are copies of enchanted creature, except the tokens are 1/1',
  ],
  parse: node<Bare, IrToken>(
    'token.copy-except-pt',
    map(
      sequence(
        map(
          spanned(pattern(/an? /i)),
          ({ span }): IrAmount => ({ kind: 'number', value: 1, span }),
        ),
        pattern(/token that['’]s a copy of /i),
        satisfy(
          family<IrNoun>('noun', { only: ['noun.attached-permanent'] }),
          (n) => n.det === 'enchanted',
        ),
        pattern(/, except the token is (\d+)\/(\d+)(?![\p{L}\p{N}/])/iu),
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

/** Creature types as printed: capitalized words ("Nightmare", "Elf Warrior"). */
const SUBTYPES = map(pattern(/[A-Z][a-z]+(?: [A-Z][a-z]+)*(?![\p{L}\p{N}])/u), (m) =>
  m[0].split(' '),
);

/** What the copy is made of: the permanent the words name, or "that creature" of the trigger (the binding pass resolves it as it does "it"). */
const COPY_SOURCE = choice(
  satisfy(
    family<IrNoun>('noun', {
      only: ['noun.self', 'noun.target-permanent', 'noun.it', 'noun.that-card'],
    }),
    (noun) => !noun.plural,
  ),
  satisfy(family<IrNoun>('noun', { only: ['noun.that-object'] }), (noun) =>
    /^that creature$/iu.test(noun.filter.raw.trim()),
  ),
);

/**
 * `token.copy-except-pt-subtype`: "a token that's a copy of that creature, except it's 1/1 and it's a Nightmare in addition to its other types" (Nightmare Shepherd; CR 707.9b: the
 * final set of values of each characteristic is part of the copiable values of the copy, so a copy of the token has them too; CR 707.9d: a characteristic-defining ability of the
 * original that defines the power or toughness the exception gives is not copied; CR 707.2: the copiable values of the original). Two exceptions: the power and toughness the copy
 * has, and creature types it has besides the ones it copies; colors, card types and abilities are the original's. The engine's `createToken` of a `copyOf` with `setPt` and
 * `addSubtypes`. Not read: "a 1/1" (`token.copy-except`), a color, a card type, a keyword, no "in addition to its other types", several tokens.
 */
export const TOKEN_COPY_EXCEPT_PT_SUBTYPE = defineRule<IrToken>({
  id: 'token.copy-except-pt-subtype',
  family: 'token',
  leading: [],
  cites: [
    'CR 707.9b (Copying Objects)',
    'CR 707.9d (Copying Objects)',
    'CR 707.2 (Copying Objects)',
    'CR 111.4 (Tokens)',
  ],
  examples: [
    'a token that’s a copy of that creature, except it’s 1/1 and it’s a Nightmare in addition to its other types',
    "a token that's a copy of that creature, except it's 1/1 and it's a Nightmare in addition to its other types",
    'a token that’s a copy of target creature, except it’s 2/2 and it’s an Elf Warrior in addition to its other types',
    'a token that’s a copy of ~, except it’s 0/1 and it’s a Spirit in addition to its other types',
  ],
  rejects: [
    'a token that’s a copy of that creature, except it’s 1/1 and it’s a Nightmare',
    'a token that’s a copy of that creature, except it’s 1/1 and it’s a nightmare in addition to its other types',
    'a token that’s a copy of that creature, except it’s 1/1 and it’s a black Nightmare in addition to its other types',
    'a token that’s a copy of that creature, except it’s 1/1 and it’s a Nightmare artifact in addition to its other types',
    'a token that’s a copy of that creature, except it’s 1/1 and it’s a Nightmare in addition to its other types and has haste',
    'a token that’s a copy of that creature, except it’s 1/1 and it’s a Nightmare in addition to its other colors',
    'a token that’s a copy of that creature, except it’s X/X and it’s a Nightmare in addition to its other types',
    'a token that’s a copy of that permanent, except it’s 1/1 and it’s a Nightmare in addition to its other types',
    'two tokens that are copies of that creature, except they’re 1/1 and they’re Nightmares in addition to their other types',
  ],
  parse: node<Bare, IrToken>(
    'token.copy-except-pt-subtype',
    map(
      sequence(
        map(
          spanned(pattern(/an? /i)),
          ({ span }): IrAmount => ({ kind: 'number', value: 1, span }),
        ),
        pattern(/token that['’]s a copy of /i),
        COPY_SOURCE,
        pattern(/, except it['’]s (\d+)\/(\d+) and it['’]s an? /iu),
        SUBTYPES,
        pattern(/ in addition to its other types(?![\p{L}\p{N}])(?!\s+and(?![\p{L}\p{N}]))/iu),
      ),
      ([count, , copyOf, pt, subtypes]): Bare => ({
        kind: 'token',
        copyOf,
        count,
        copySetPt: { power: Number(pt[1]), toughness: Number(pt[2]) },
        copyAddsSubtypes: subtypes,
      }),
    ),
    (b) => b,
  ),
});
