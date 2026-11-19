/**
 * `token.aura`: "a white Aura enchantment token named Contract" (CR 111.3, 111.4, 303.4, 205.3h: a token described by the effect that is an Aura; issue 89). One token, one color,
 * the Aura subtype and the enchantment type, no power or toughness and no abilities of its own here: what it enchants (`enchant creature`), the target it is attached to and the
 * ability it has are read by `effect.create-token` (the engine creates an Aura token only attached, CR 303.4f), and the lowering refuses an Aura token without them.
 */
import { map, optional, pattern, sequence } from '../../combinators';
import type { IrAmount, IrToken } from '../../ir/types';
import { defineRule, node, spanned } from '../registry';

type Bare = Omit<IrToken, 'span' | 'rule'>;

/** " named Contract": capitalized words that "of", "the" and the like may join, up to the lowercase word that follows. */
const NAME = map(
  pattern(/ named ([A-Z][\p{L}'’-]*(?:(?: (?:of|the|de|la|in|on))* [A-Z][\p{L}'’-]*)*)/u),
  (m) => m[1] ?? '',
);

export const TOKEN_AURA = defineRule<IrToken>({
  id: 'token.aura',
  family: 'token',
  leading: [],
  cites: ['CR 111.3 (Tokens)', 'CR 111.4 (Tokens)', 'CR 303.4 (Auras)', 'CR 205.3h (Subtypes)'],
  examples: [
    'a white Aura enchantment token named Contract',
    'a black Aura enchantment token named Curse of Silence',
    'an Aura enchantment token',
  ],
  rejects: [
    'a white Aura enchantment token named',
    'a white Aura enchantment token named contract',
    'two white Aura enchantment tokens named Contract',
    'a white and blue Aura enchantment token named Contract',
    'a white Aura enchantment creature token named Contract',
    'a white Aura token named Contract',
    'a white Aura enchantment tokens named Contract',
    'a 1/1 white Aura enchantment token named Contract',
    'X white Aura enchantment tokens',
  ],
  parse: node<Bare, IrToken>(
    'token.aura',
    map(
      sequence(
        map(
          spanned(pattern(/an? /i)),
          ({ span }): IrAmount => ({ kind: 'number', value: 1, span }),
        ),
        pattern(/(?:(white|blue|black|red|green) )?Aura enchantment token(?![\p{L}\p{N}])/u),
        optional(NAME, null),
      ),
      ([count, words, named]): Bare => ({
        kind: 'token',
        count,
        ...(named === null ? {} : { named }),
        colors: words[1] === undefined ? [] : [words[1]],
        types: ['enchantment'],
        subtypes: ['Aura'],
      }),
    ),
    (b) => b,
  ),
});

export const AURA_TOKEN_RULES = [TOKEN_AURA];
