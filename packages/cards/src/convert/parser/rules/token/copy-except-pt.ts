/**
 * `token.copy-except-pt`: "a token that's a copy of enchanted creature, except the token is 1/1" (Endless Evil; CR 707.9b: the final set of values of each characteristic is part of the
 * copiable values of the copy; CR 707.9d: a characteristic-defining ability of the original that defines the power or toughness the exception gives is not copied). Only the power and the
 * toughness change: colors, types and abilities are the ones the original has. The permanent copied is the one the Aura is attached to (an Equipment's "equipped creature" is not read). The engine's `createToken` of a `copyOf` with
 * `setPt`. Not read: another subject, a color or a type in the exception, "in addition to", a second exception, "a" before the numbers ("except it's a 1/1" has its own rule).
 */
import { map, pattern, satisfy, sequence } from '../../combinators';
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
