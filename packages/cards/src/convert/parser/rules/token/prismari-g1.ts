/**
 * `token.copies-x`: "X tokens that are copies of another target creature you control" (Prismari deck, group 1, D-638, CR 707.2, 111.4, 107.3c): X tokens, each with the copiable values of
 * one permanent, the X of the spell or ability or what the sentence defines it as ("..., where X is one plus the number of instant and sorcery spells you've cast this turn"). The source
 * is one permanent: `~`, "target <permanent>" ("another target creature you control") or "it". The engine's `createToken` of a `copyOf` with that count. Not read: a number (that is
 * `token.copy`'s), "a token", "that's a copy", a copy of several permanents, an exception.
 */
import { map, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrNoun, IrToken } from '../../ir/types';
import { defineRule, family, node, spanned } from '../registry';

type Bare = Omit<IrToken, 'span' | 'rule'>;

const COPY_SOURCE = satisfy(
  family<IrNoun>('noun', { only: ['noun.self', 'noun.target-permanent', 'noun.it'] }),
  (noun) => !noun.plural,
);

export const TOKEN_COPIES_X = defineRule<IrToken>({
  id: 'token.copies-x',
  family: 'token',
  leading: [],
  cites: ['CR 707.2 (Copying Objects)', 'CR 111.4 (Tokens)', 'CR 107.3c (Numbers and Symbols)'],
  examples: [
    'X tokens that are copies of another target creature you control',
    'X tokens that are copies of target creature',
    'X tokens that are copies of ~',
  ],
  rejects: [
    'two tokens that are copies of another target creature you control',
    'X token that is a copy of another target creature you control',
    'X tokens that are a copy of target creature',
    'x tokens that are copies of target creature',
    'X tokens that are copies of two target creatures',
    'X tokens that are copies of target creatures',
    'X tokens that are copies of target creature, except it has haste',
    'X tokens that are copies of that creature',
    'X Treasure tokens',
  ],
  parse: node<Bare, IrToken>(
    'token.copies-x',
    map(
      sequence(
        map(spanned(pattern(/X(?![\p{L}\p{N}])/u)), ({ span }): IrAmount => ({ kind: 'x', span })),
        pattern(/ tokens that are copies of /i),
        COPY_SOURCE,
      ),
      ([count, , copyOf]): Bare => ({ kind: 'token', copyOf, count }),
    ),
    (b) => b,
  ),
});
