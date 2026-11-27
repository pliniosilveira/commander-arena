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
  choice,
  fail,
  literal,
  map,
  optional,
  type ParseContext,
  type ParseResult,
  type Parser,
  pattern,
  quiet,
  refuseAt,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrAmount, IrNoun, IrQuotedAbility, IrToken } from '../../ir/types';
import { FOR_EACH_TAIL, scaled } from '../amount/scaled';
import { defineRule, family } from '../registry';
import { TOKEN_QUOTED_ABILITY } from '../static/quoted';
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

/**
 * " attached to target creature an opponent controls. The token has enchant creature and \"...\"" (issue 89, CR 303.4f, 111.4, 702.5a): what an Aura token is created attached to
 * (one target) and what it has, the words that follow `token.aura`. The ability in quotes is the token's own and optional ("The token has enchant creature.").
 */
const AURA_TOKEN_TAIL: Parser<{
  attachTo: IrNoun;
  enchants: true;
  quoted: IrQuotedAbility | null;
}> = (ctx, pos) => {
  const head = sequence(
    literal(' attached to '),
    refuseAt(
      family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
      (n) => !n.plural && !n.upTo && n.anyNumber !== true,
      (_n, _ctx, start) => start,
    ),
    literal('. The token has enchant creature'),
    optional(sequence(literal(' and '), TOKEN_QUOTED_ABILITY), null),
  )(ctx, pos);
  if (!head.ok) return head;
  const [, attachTo, , rider] = head.value;
  return {
    ok: true,
    value: { attachTo, enchants: true, quoted: rider === null ? null : rider[1] },
    pos: head.pos,
  };
};

/** " attached to up to one target creature you control" (CR 303.7): the one permanent, a target (an "up to one" one too), that a Role token is created attached to. */
const ROLE_TOKEN_TAIL: Parser<IrNoun> = map(
  sequence(
    literal(' attached to '),
    refuseAt(
      family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
      (n) => !n.plural && n.anyNumber !== true,
      (_n, _ctx, start) => start,
    ),
  ),
  ([, noun]) => noun,
);

/** "create a Food token or a Treasure token": the first token must be one predefined token of one for the other to be offered with it. */
const createdTokens: Parser<{
  token: IrToken;
  alternative: IrToken | null;
  attachTo?: IrNoun;
}> = (ctx, pos) => {
  const head = sequence(literal('create '), tokenWithEach())(ctx, pos);
  if (!head.ok) return head;
  const [, token] = head.value;
  // Issue 89: an Aura token is created attached to a target and has "enchant creature" (the engine creates one only attached, CR 303.4f).
  if (token.rule === 'token.aura') {
    const tail = AURA_TOKEN_TAIL(ctx, head.pos);
    if (!tail.ok) return tail;
    const { attachTo, quoted } = tail.value;
    return {
      ok: true,
      value: {
        token: {
          ...token,
          enchantsCreature: true,
          ...(quoted === null ? {} : { abilities: [quoted] }),
        },
        alternative: null,
        attachTo,
      },
      pos: tail.pos,
    };
  }
  // CR 111.10, 303.7 (Witch's Mark): a Role token is an Aura token, created attached to the permanent the text names ("attached to up to one target creature you control").
  if (token.predefined === 'Wicked Role') {
    const host = ROLE_TOKEN_TAIL(ctx, head.pos);
    if (!host.ok) return host;
    return {
      ok: true,
      value: { token, alternative: null, attachTo: host.value },
      pos: host.pos,
    };
  }
  // CR 508.4, 110.5b (Kari Zev): "create Ragavan, a legendary 2/1 red Monkey creature token. Ragavan enters tapped and attacking.": the second sentence says the token just made
  // enters tapped and attacking, so it is the token's own flag (as "that's tapped and attacking" is), read only about the one token the first sentence names.
  if (token.named !== undefined && token.legendary === true) {
    const enters = literal(`. ${token.named} enters tapped and attacking`)(ctx, head.pos);
    if (enters.ok && /^(?:\.|$)/u.test(ctx.text.slice(enters.pos))) {
      return {
        ok: true,
        value: { token: { ...token, tappedAndAttacking: true }, alternative: null },
        pos: enters.pos,
      };
    }
  }
  // CR 508.4, 508.6 (Soaring Lightbringer): "a 1/1 white Glimmer enchantment creature token that's tapped and attacking that player": the words name whom the token attacks, the
  // player the trigger is about ("Whenever you attack a player"); "that player or a planeswalker they control" offers a choice and is not read here.
  if (
    token.tappedAndAttacking === true &&
    token.copyOf === undefined &&
    token.predefined === undefined
  ) {
    const named = pattern(/ that player(?![\p{L}\p{N}'’])(?!\s+(?:or|and)(?![\p{L}\p{N}]))/iu)(
      ctx,
      head.pos,
    );
    if (named.ok) {
      const { tappedAndAttacking: _flag, ...plain } = token;
      return {
        ok: true,
        value: { token: { ...plain, tappedAttackingThatPlayer: true }, alternative: null },
        pos: named.pos,
      };
    }
  }
  const rider = sequence(
    choice(literal('. They have '), literal('. Those tokens have ')),
    TOKEN_QUOTED_ABILITY,
  )(ctx, head.pos);
  if (rider.ok) {
    return {
      ok: true,
      value: {
        token: { ...token, abilities: [...(token.abilities ?? []), rider.value[1]] },
        alternative: null,
      },
      pos: rider.pos,
    };
  }
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
    // CR 111.10, 303.7 (Witch's Mark): a Role token is created attached to a target.
    'create a Wicked Role token attached to up to one target creature you control',
    'create a Wicked Role token attached to target creature you control',
    // Issue 89 (CR 303.4f): an Aura token is created attached to a target.
    'create a white Aura enchantment token named Contract attached to target creature an opponent controls. The token has enchant creature and "Whenever enchanted creature attacks, you gain 1 life."',
    'create a white Aura enchantment token named Contract attached to target creature. The token has enchant creature',
    'create a number of 1/1 black and green Pest creature tokens equal to the number of +1/+1 counters on ~. They have "When ~ dies, you gain 1 life."',
    // Issue 144 (Glimpse the Impossible): the same rider with "Those tokens".
    'create a 0/1 colorless Eldrazi Spawn creature token for each card put into your graveyard this way. Those tokens have "Sacrifice ~: Add {C}."',
    // CR 508.4, 508.6 (Soaring Lightbringer): the token attacks the player the trigger is about.
    "create a 1/1 white Glimmer enchantment creature token that's tapped and attacking that player",
    'create two 1/1 white Soldier creature tokens that are tapped and attacking that player',
  ],
  rejects: [
    "create a 1/1 white Glimmer enchantment creature token that's tapped and attacking that player or a planeswalker they control",
    "create a 1/1 white Glimmer enchantment creature token that's tapped and attacking that player's planeswalker",
    "create a 1/1 white Glimmer enchantment creature token that's attacking that player",
    "create a token that's a copy of ~ and that's tapped and attacking that player",
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
    'create a Wicked Role token',
    'create a Wicked Role token attached to target creatures you control',
    'create a white Aura enchantment token named Contract',
    'create a white Aura enchantment token named Contract attached to target creature',
    'create a white Aura enchantment token named Contract attached to target creature. The token has enchant land',
    'create a white Aura enchantment token named Contract attached to up to one target creature. The token has enchant creature',
    'create a white Aura enchantment token named Contract attached to target creatures. The token has enchant creature',
  ],
  parse: single(
    'effect.create-token',
    // The count of "for each" replaces the "a" (a quantity above one multiplies it, stage P28): the engine's amount is
    // counted once for the instruction.
    createdTokens,
    ({ token, alternative, attachTo }) => ({
      verb: 'createToken',
      args: {
        token,
        ...(alternative === null ? {} : { alternative }),
        ...(attachTo === undefined ? {} : { attachTo }),
      },
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

/**
 * `effect.investigate-times`: "Investigate twice.", "Investigate three times.", "Investigate X times, where X is the number of opponents you have." (CR 701.16a:
 * investigating is creating a Clue token, so doing it N times in a row creates N Clues, CR 608.2c; the X of the spell or ability, or a number, is the count).
 * Not read: "once" (the rule above), "a Clue", a count that is not a number or X, and the words after the count.
 */
export const EFFECT_INVESTIGATE_TIMES = defineRule<Clauses>({
  id: 'effect.investigate-times',
  family: 'effect',
  leading: ['investigate'],
  cites: [
    'CR 701.16a (Investigate)',
    'CR 111.10f (Tokens)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 107.3 (Variables)',
  ],
  examples: ['investigate twice', 'investigate three times', 'investigate X times'],
  rejects: [
    'investigate',
    'investigate once',
    'investigate times',
    'investigate X',
    'investigate that many times',
    'investigate a Clue',
  ],
  parse: (ctx, pos) => {
    const word = pattern(/investigate(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!word.ok) return word;
    const twice = pattern(/ twice(?![\p{L}\p{N}])/iu)(ctx, word.pos);
    let count: IrAmount;
    let end: number;
    if (twice.ok) {
      end = twice.pos;
      count = { kind: 'number', value: 2, span: { start: word.pos, end } };
    } else {
      const times = sequence(
        literal(' '),
        family<IrAmount>('amount', { only: ['amount.number', 'amount.x'] }),
        literal(' times'),
      )(ctx, word.pos);
      if (!times.ok) return times;
      count = times.value[1];
      end = times.pos;
    }
    const span = { start: pos, end };
    const token: IrToken = {
      kind: 'token',
      predefined: 'Clue',
      count,
      span,
      rule: 'effect.investigate-times',
    };
    return {
      ok: true,
      value: [makeClause('effect.investigate-times', 'createToken', { token }, span)] as Clauses,
      pos: end,
    };
  },
});

/**
 * `effect.create-two-tokens`: "create X 1/1 white Halfling creature tokens and X Food tokens", "create a Treasure token and a Food token" (CR 111.2, 608.2c): one
 * "create" for two groups of tokens, the second joined by "and" with no verb of its own. It is the two instructions "create A" and "create B", followed in the order written.
 * Not read: a third group, a rider or a "for each" count on the first group (the other rule reads those), "or".
 */
export const EFFECT_CREATE_TWO_TOKENS = defineRule<Clauses>({
  id: 'effect.create-two-tokens',
  family: 'effect',
  leading: ['create'],
  cites: ['CR 111.2 (Tokens)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'create a Treasure token and a Food token',
    'create two Treasure tokens and two Food tokens',
    'create X 1/1 white Halfling creature tokens and X Food tokens',
    'create a 1/1 white Soldier creature token and a Food token',
  ],
  rejects: [
    'create a Food token',
    'create a Food token and',
    'create a Treasure token and a Food token and a Clue token',
    'create a Treasure token or a Food token',
    'create a Treasure token and draw a card',
    'create a Treasure token and a Food token or a Clue token',
  ],
  parse: (ctx, pos) => {
    const first = sequence(literal('create '), family<IrToken>('token'))(ctx, pos);
    if (!first.ok) return first;
    const second = sequence(literal(' and '), family<IrToken>('token'))(ctx, first.pos);
    if (!second.ok) return second;
    // A third group is not read: the next word must not continue the list.
    if (/^(?:,| and | or )/u.test(ctx.text.slice(second.pos))) return fail(ctx, second.pos);
    const id = 'effect.create-two-tokens';
    const a = first.value[1];
    const b = second.value[1];
    return {
      ok: true,
      value: [
        {
          ...makeClause(id, 'createToken', { token: a }, { start: pos, end: first.pos }),
          connector: 'and',
        },
        makeClause(id, 'createToken', { token: b }, { start: first.pos, end: second.pos }),
      ],
      pos: second.pos,
    };
  },
});

/**
 * `effect.create-three-tokens`: "create a 3/3 colorless Golem artifact creature token with flying, a 3/3 colorless Golem artifact creature token with vigilance, and a 3/3 ... with trample"
 * (issue 105, Triplicate Titan; CR 111.2, 608.2c): one "create" for three groups of tokens, written as a list with a comma before the last. It is the three instructions "create A", "create
 * B" and "create C", followed in the order written. Not read: two groups, four, "or", a rider or a "for each" count (the other rules read those).
 */
export const EFFECT_CREATE_THREE_TOKENS = defineRule<Clauses>({
  id: 'effect.create-three-tokens',
  family: 'effect',
  leading: ['create'],
  cites: ['CR 111.2 (Tokens)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'create a Treasure token, a Food token, and a Clue token',
    'create a 3/3 colorless Golem artifact creature token with flying, a 3/3 colorless Golem artifact creature token with vigilance, and a 3/3 colorless Golem artifact creature token with trample',
    'create two Treasure tokens, a Food token, and a Clue token',
  ],
  rejects: [
    'create a Treasure token and a Food token',
    'create a Treasure token, a Food token and a Clue token',
    'create a Treasure token, a Food token, and',
    'create a Treasure token, a Food token, or a Clue token',
    'create a Treasure token, a Food token, a Clue token, and a Gold token',
    'create a Treasure token, a Food token, and a Clue token and draw a card',
    'create a Treasure token, and a Food token',
  ],
  parse: (ctx, pos) => {
    const first = sequence(literal('create '), family<IrToken>('token'))(ctx, pos);
    if (!first.ok) return first;
    const second = sequence(literal(', '), family<IrToken>('token'))(ctx, first.pos);
    if (!second.ok) return second;
    const third = sequence(literal(', and '), family<IrToken>('token'))(ctx, second.pos);
    if (!third.ok) return third;
    // A fourth group is not read: the next word must not continue the list.
    if (/^(?:,| and | or )/u.test(ctx.text.slice(third.pos))) return fail(ctx, third.pos);
    const id = 'effect.create-three-tokens';
    const tokens = [first.value[1], second.value[1], third.value[1]];
    const ends = [first.pos, second.pos, third.pos];
    return {
      ok: true,
      value: tokens.map((token, i) => {
        const clause = makeClause(
          id,
          'createToken',
          { token },
          { start: i === 0 ? pos : (ends[i - 1] ?? pos), end: ends[i] ?? third.pos },
        );
        return i < 2 ? { ...clause, connector: 'and' as const } : clause;
      }),
      pos: third.pos,
    };
  },
});

export const TOKEN_EFFECT_RULES = [
  EFFECT_CREATE_THREE_TOKENS,
  EFFECT_CREATE_TWO_TOKENS,
  EFFECT_CREATE_TOKEN,
  EFFECT_INVESTIGATE_TIMES,
  EFFECT_INVESTIGATE,
];
