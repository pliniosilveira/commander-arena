/**
 * `effect.create-token`: "Create a Treasure token", "create two 1/1 white Soldier creature
 * tokens" (CR 111.2: the player creating a token is its controller and owner). The token itself is
 * read by the token family; this rule is the verb. A single token may be counted by what the
 * player controls ("Create a 0/1 green Plant creature token for each land you control", CR 608.2c:
 * counted as the instruction runs, D-095), and, since stage P28 (D-131), so may a quantity above one and every count of
 * "for each" ("for each opponent who has more cards in hand than you", "for each creature sacrificed this way"). A
 * token may enter tapped ("two tapped Treasure tokens", CR 110.5b). A count of X is the X of the spell or ability (stage
 * P16, D-103) or what the sentence defines it as ("..., where X is the number of creatures attacking you").
 * `effect.investigate` is the keyword action that makes a Clue (CR 701.16a), also "once for each ...".
 */
import {
  fail,
  literal,
  map,
  optional,
  type ParseContext,
  type ParseResult,
  type Parser,
  pattern,
  quiet,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrToken } from '../../ir/types';
import { FOR_EACH_TAIL, scaled } from '../amount/scaled';
import { defineRule, family } from '../registry';
import { type Clauses, makeClause, single } from './operands';

/**
 * A token, and the count of "for each ..." that may follow it (stage P15; stage P28, D-131): "a 0/1 green Plant creature
 * token for each land you control" has the count as its count, and "two Treasure tokens for each creature you control"
 * twice the count (CR 608.2c: counted as the instruction runs). The count that follows a quantity of X is not read.
 * `only` narrows the token rules (a token that is a copy is not made by "its controller creates").
 */
export function tokenWithEach(only?: readonly string[]): Parser<IrToken> {
  const token = family<IrToken>('token', only === undefined ? {} : { only });
  return (ctx, pos) => {
    const read = token(ctx, pos);
    if (!read.ok) return read;
    // Read quietly: a count that cannot multiply (X) is refused where "for each" begins, not after it.
    const counted = quiet((c: ParseContext, at: number): ParseResult<IrToken | null> => {
      const each = optional(FOR_EACH_TAIL, null)(c, at);
      if (!each.ok || each.value === null) return { ok: true, value: null, pos: at };
      const count = scaled(read.value.count, each.value);
      return count === null
        ? fail(c, at)
        : { ok: true, value: { ...read.value, count }, pos: each.pos };
    })(ctx, read.pos);
    if (!counted.ok) return fail(ctx, read.pos);
    return counted.value === null ? read : { ok: true, value: counted.value, pos: counted.pos };
  };
}

/**
 * " or a Treasure token" (stage P35, D-176, CR 608.2d): the other token that "create a Food token or a Treasure token" offers. Both are a predefined
 * token of one, so the player chooses which one is created; the lowering is the engine's `chooseOne`.
 */
const OR_ANOTHER_TOKEN: Parser<IrToken> = satisfy(
  map(
    sequence(literal(' or '), family<IrToken>('token', { only: ['token.predefined'] })),
    ([, token]) => token,
  ),
  (token) => token.count.kind === 'number' && token.count.value === 1,
);

/** "create a Food token or a Treasure token": the first token must be one predefined token of one for the other to be offered with it. */
const createdTokens: Parser<{ token: IrToken; alternative: IrToken | null }> = (ctx, pos) => {
  const head = sequence(literal('create '), tokenWithEach())(ctx, pos);
  if (!head.ok) return head;
  const [, token] = head.value;
  const one =
    token.predefined !== undefined && token.count.kind === 'number' && token.count.value === 1;
  const alternative = one ? OR_ANOTHER_TOKEN(ctx, head.pos) : null;
  if (alternative === null || !alternative.ok) {
    return { ok: true, value: { token, alternative: null }, pos: head.pos };
  }
  return { ok: true, value: { token, alternative: alternative.value }, pos: alternative.pos };
};

export const EFFECT_CREATE_TOKEN = defineRule<Clauses>({
  id: 'effect.create-token',
  family: 'effect',
  leading: ['create'],
  cites: ['CR 111.2 (Tokens)', 'CR 111.10 (Tokens)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'create a Treasure token',
    'create two Treasure tokens',
    'create a 1/1 white Soldier creature token',
    'create a Food token',
    'create a 1/1 white Spirit creature token with flying',
    'create a 0/1 green Plant creature token for each land you control',
    'create a Treasure token for each creature you control',
    'create X Treasure tokens',
    'create X 1/1 white Soldier creature tokens',
    'create a 2/2 green Wolf creature token for each time it was kicked',
    'create a Treasure token for each time ~ was kicked',
    'create two Treasure tokens for each land you control',
    'create two Treasure tokens for each time it was kicked',
    'create a tapped Treasure token',
    'create thirteen tapped 2/2 black Zombie creature tokens',
    'create a 1/2 green Spider creature token with reach for each creature attacking you',
    'create a Clue token for each opponent who has more cards in hand than you',
    'create a 2/2 black Zombie creature token for each creature sacrificed this way',
    'create a 1/1 white Soldier creature token for each +1/+1 counter on ~',
    // Stage P35 (D-176, CR 608.2d): one of two predefined tokens, chosen as the instruction resolves.
    'create a Food token or a Treasure token',
    'create a Clue token or a Treasure token',
  ],
  rejects: [
    'create X Treasure tokens for each time it was kicked',
    'create a Treasure token tapped',
    'create a copy of target creature',
    'creates a Treasure token',
    'create X Treasure tokens for each land you control',
    'create a Treasure token for each land',
    'create a Treasure token for each',
    'create a tapped',
    'create tapped Treasure tokens',
    'create a Food token or',
    'create a Food token or a Treasure',
    'create a Food token or a 1/1 white Soldier creature token',
    'create a Food token or two Treasure tokens',
    'create two Food tokens or a Treasure token',
    'create a Food token or a Treasure token or a Clue token',
    'create a Food token or Treasure token',
    'create a Food token for each land or a Treasure token',
  ],
  parse: single(
    'effect.create-token',
    // The count of "for each" replaces the "a" (a quantity above one multiplies it, stage P28): the engine's amount is
    // counted once for the instruction.
    createdTokens,
    ({ token, alternative }) => ({
      verb: 'createToken',
      args: alternative === null ? { token } : { token, alternative },
    }),
  ),
});

/**
 * `effect.investigate`: "Investigate." (CR 701.16a: it means "Create a Clue token", CR 111.10f), and "Investigate once for
 * each opponent who has more cards in hand than you." (stage P28: the count of "for each" is the number of Clues, CR
 * 608.2c). "Investigate twice" and the other forms of the action stay unread.
 */
export const EFFECT_INVESTIGATE = defineRule<Clauses>({
  id: 'effect.investigate',
  family: 'effect',
  leading: ['investigate'],
  cites: [
    'CR 701.16a (Investigate)',
    'CR 111.10f (Tokens)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'investigate',
    'investigate once for each opponent who has more cards in hand than you',
    'investigate once for each creature you control',
  ],
  rejects: [
    'investigate twice',
    'investigates',
    'investigate a Clue',
    'investigate for each land',
    'investigate once',
    'investigate once for each',
    'investigate once for each creature',
  ],
  parse: (ctx, pos) => {
    const word = pattern(/investigate(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!word.ok) return word;
    const each = optional(
      map(sequence(literal(' once'), FOR_EACH_TAIL), ([, amount]) => amount),
      null,
    )(ctx, word.pos);
    if (!each.ok) return each;
    // "once" is the word of the count: it alone is not read.
    if (each.value === null && ctx.text.startsWith(' once', word.pos)) return fail(ctx, word.pos);
    const end = each.pos;
    const span = { start: pos, end };
    const token: IrToken = {
      kind: 'token',
      predefined: 'Clue',
      count: each.value ?? { kind: 'number', value: 1, span },
      span,
      rule: 'effect.investigate',
    };
    return {
      ok: true,
      value: [makeClause('effect.investigate', 'createToken', { token }, span)] as Clauses,
      pos: end,
    };
  },
});

export const TOKEN_EFFECT_RULES = [EFFECT_CREATE_TOKEN, EFFECT_INVESTIGATE];
