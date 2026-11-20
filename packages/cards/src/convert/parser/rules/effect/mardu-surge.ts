/**
 * Effect rules of the Mardu Surge deck (issue 101).
 *
 * - `effect.create-tokens-per-opponent-tapped-attacking`: "For each opponent, create a 1/1 white Human creature token that's tapped and attacking that player or a planeswalker they
 *   control." (CR 508.4, 111.2, 101.4). The engine's `createToken` with `forEachOpponent: { attacking: true }`: the tokens made for each opponent enter tapped and attacking that
 *   opponent (the choice of a planeswalker is not offered, `docs/ROADMAP.md`).
 */
import { fail, literal, pattern } from '../../combinators';
import type { IrClause, IrToken } from '../../ir/types';
import { defineRule, family } from '../registry';
import { flag } from './dragons';
import { type Clauses, makeClause } from './operands';

const BOUNDARY = '(?![\\p{L}\\p{N}])';

export const EFFECT_CREATE_TOKENS_PER_OPPONENT_TAPPED_ATTACKING = defineRule<Clauses>({
  id: 'effect.create-tokens-per-opponent-tapped-attacking',
  family: 'effect',
  leading: ['for'],
  cites: ['CR 508.4 (Declare Attackers Step)', 'CR 111.2 (Tokens)', 'CR 101.4 (Golden Rules)'],
  examples: [
    "for each opponent, create a 1/1 white Human creature token that's tapped and attacking that player or a planeswalker they control",
    "for each opponent, create a 1/1 red Goblin creature token that's tapped and attacking that player",
    'for each opponent, create two 1/1 white Soldier creature tokens that are tapped and attacking that player',
  ],
  rejects: [
    "for each opponent, create a 1/1 white Human creature token that's tapped and attacking",
    "for each opponent, create a 1/1 white Human creature token that's tapped and attacking a player",
    "for each player, create a 1/1 white Human creature token that's tapped and attacking that player",
    "create a 1/1 white Human creature token that's tapped and attacking that player",
    'for each opponent, create a 1/1 white Human creature token that attacks that player',
    "for each opponent, create a Treasure token that's tapped and attacking that player",
    "for each opponent, create a 1/1 white Human creature token that's tapped and attacking that player and draw a card",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.create-tokens-per-opponent-tapped-attacking';
    const head = literal('for each opponent, create ')(ctx, pos);
    if (!head.ok) return head;
    const token = family<IrToken>('token')(ctx, head.pos);
    if (!token.ok) return token;
    if (token.value.tappedAndAttacking !== true) return fail(ctx, pos);
    const tail = pattern(
      new RegExp(` that player(?: or a planeswalker they control)?${BOUNDARY}`, 'iu'),
    )(ctx, token.pos);
    if (!tail.ok) return fail(ctx, pos);
    if (token.value.copyOf !== undefined || token.value.predefined !== undefined) {
      return fail(ctx, pos);
    }
    const span = { start: pos, end: tail.pos };
    const clause: IrClause = makeClause(
      id,
      'createToken',
      { token: token.value, perOpponentTappedAttacking: flag(id, true, span) },
      span,
    );
    return { ok: true, value: [clause], pos: tail.pos };
  },
});

/**
 * `effect.opponents-may-create-tokens`: "Each opponent may create X 1/1 red Elemental creature tokens with haste. For each opponent who does, create X 1/1 red Elemental creature tokens
 * with haste." (Tempt with Vengeance; CR 101.4, 111.2, 608.2d): the two sentences of the offer are one instruction (`segment.ts` keeps them together). Each opponent, in turn order, is
 * asked; one who accepts creates the tokens of the first sentence and the controller of the spell creates the tokens of the second for them. The tokens are the ones the token family reads.
 * Not read: another kind of player, "each player", a second sentence that does not count the opponents who did, no second sentence.
 */
export const EFFECT_OPPONENTS_MAY_CREATE_TOKENS = defineRule<Clauses>({
  id: 'effect.opponents-may-create-tokens',
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 101.4 (Golden Rules)',
    'CR 111.2 (Tokens)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: [
    'each opponent may create X 1/1 red Elemental creature tokens with haste. for each opponent who does, create X 1/1 red Elemental creature tokens with haste',
    'Each opponent may create X 1/1 red Elemental creature tokens with haste. For each opponent who does, create X 1/1 red Elemental creature tokens with haste',
  ],
  rejects: [
    'each opponent may create X 1/1 red Elemental creature tokens with haste',
    'each opponent may create X 1/1 red Elemental creature tokens with haste. for each opponent, create X 1/1 red Elemental creature tokens with haste',
    'each player may create X 1/1 red Elemental creature tokens with haste. for each player who does, create X 1/1 red Elemental creature tokens with haste',
    'each opponent may create X 1/1 red Elemental creature tokens with haste. for each opponent who does, create X 1/1 red Elemental creature tokens with haste and draw a card',
    'each opponent may create X 1/1 red Elemental creature tokens with haste and draw a card. for each opponent who does, create X 1/1 red Elemental creature tokens with haste',
    'each opponent creates X 1/1 red Elemental creature tokens with haste. for each opponent who does, create X 1/1 red Elemental creature tokens with haste',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.opponents-may-create-tokens';
    const head = literal('each opponent may create ')(ctx, pos);
    if (!head.ok) return head;
    const first = family<IrToken>('token')(ctx, head.pos);
    if (!first.ok) return first;
    const mid = pattern(/\. for each opponent who does, create /iu)(ctx, first.pos);
    if (!mid.ok) return fail(ctx, pos);
    const second = family<IrToken>('token')(ctx, mid.pos);
    if (!second.ok) return fail(ctx, pos);
    const span = { start: pos, end: second.pos };
    const clause: IrClause = makeClause(
      id,
      'opponentsMayCreateTokens',
      { token: first.value, bonus: second.value },
      span,
    );
    return { ok: true, value: [clause], pos: second.pos };
  },
});

/**
 * `effect.double-tokens-this-turn`: "Until end of turn, if one or more tokens would be created under your control, twice that many of those tokens are created instead." (CR 614.1a,
 * 614.5, 611.2a; Kaya, Geist Hunter): the replacement effect of the doubling permanents, as an effect that lasts until the turn ends. The engine's `doubleTokens`. Not read: another
 * duration, a kind of token, "an opponent's", a different count, no "instead".
 */
export const EFFECT_DOUBLE_TOKENS_THIS_TURN = defineRule<Clauses>({
  id: 'effect.double-tokens-this-turn',
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 614.1a (Replacement Effects)',
    'CR 614.5 (Replacement Effects)',
    'CR 611.2a (Continuous Effects)',
    'CR 111.2 (Tokens)',
  ],
  examples: [
    'until end of turn, if one or more tokens would be created under your control, twice that many of those tokens are created instead',
    'Until end of turn, if one or more tokens would be created under your control, twice that many of those tokens are created instead',
  ],
  rejects: [
    'until your next turn, if one or more tokens would be created under your control, twice that many of those tokens are created instead',
    'until end of turn, if one or more tokens would be created under your control, three times that many of those tokens are created instead',
    'until end of turn, if one or more tokens would be created under an opponent’s control, twice that many of those tokens are created instead',
    'until end of turn, if one or more artifact tokens would be created under your control, twice that many of those tokens are created instead',
    'until end of turn, if one or more tokens would be created under your control, twice that many of those tokens are created',
    'if one or more tokens would be created under your control, twice that many of those tokens are created instead',
    'until end of turn, if one or more tokens would be created under your control, twice that many of those tokens are created instead and draw a card',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /until end of turn, if one or more tokens would be created under your control, twice that many of those tokens are created instead(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: [makeClause('effect.double-tokens-this-turn', 'doubleTokensThisTurn', {}, span)],
      pos: r.pos,
    };
  },
});

export const MARDU_SURGE_EFFECT_RULES = [
  EFFECT_CREATE_TOKENS_PER_OPPONENT_TAPPED_ATTACKING,
  EFFECT_OPPONENTS_MAY_CREATE_TOKENS,
  EFFECT_DOUBLE_TOKENS_THIS_TURN,
];
