/**
 * Effect rules of group 10 of the Ahoy Mateys deck (stack and cost effects): "Each creature that convoked this spell connives." (Lethal Scheme) and "Each player reveals the top card of their
 * library. For each nonland card revealed this way, you create a Map token." (Storm Fleet Negotiator). The engine runs `connive` of `convokers` and `revealTopBranches` with a branch done
 * by the controller; only the words are new.
 */
import { fail, pattern, sequence } from '../../combinators';
import type { IrToken } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const CONVOKERS_ID = 'effect.convokers-connive';

/**
 * `effect.convokers-connive`: "each creature that convoked this spell connives" (CR 702.51a: the creatures a player taps to pay for a spell with Convoke "convoked" it; CR 701.50a: each
 * of them draws a card, discards a card, and gets a +1/+1 counter if the card discarded is a nonland card). The engine's `connive` of `convokers`. Not read: another subject ("each creature
 * you control"), "target", a number, "connives" with more after it, an ability instead of a spell ("that convoked it").
 */
export const EFFECT_CONVOKERS_CONNIVE = defineRule<Clauses>({
  id: CONVOKERS_ID,
  family: 'effect',
  leading: ['each'],
  cites: ['CR 702.51a (Convoke)', 'CR 701.50a (Connive)', 'CR 400.7 (Objects)'],
  examples: [
    'each creature that convoked ~ connives',
    'Each creature that convoked this spell connives',
  ],
  rejects: [
    'each creature that convoked ~',
    'each creature you control connives',
    'each creature that convoked ~ connive',
    'each creature that convoked it connives',
    'each creature that convoked ~ connives 2',
    'each creature that convoked ~ connives, then draws a card',
    'each creature that convoked ~ connives and draws a card',
    'target creature that convoked ~ connives',
    'each artifact that improvised ~ connives',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `each creature that convoked (?:~|this spell) connives${BOUNDARY}(?!,| and\\b| then\\b| \\d)`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause(CONVOKERS_ID, 'convokersConnive', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

const REVEAL_ID = 'effect.each-player-reveals-token-for-nonland';

/**
 * `effect.each-player-reveals-token-for-nonland`: "each player reveals the top card of their library. For each nonland card revealed this way, you create a Map token" (CR 701.20a: revealing
 * shows the card to every player and it stays on top of the library; CR 608.2c: what is done is read of the cards as they were revealed). Every player reveals their own top card, and the
 * controller of the ability creates one token for each card that was not a land (an empty library reveals nothing). The engine's `revealTopBranches` of each player, with a branch done by the
 * controller (`asController`). The sentences are kept together by the segmenter (`segment.ts`). Not read: "reveal the top two cards", another library, "each opponent", a land count,
 * "you create" with a count, a token that the controller of the revealing player gets, more after the token.
 */
export const EFFECT_EACH_PLAYER_REVEALS_TOKEN_FOR_NONLAND = defineRule<Clauses>({
  id: REVEAL_ID,
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 701.20a (Reveal)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 205.2a (Card Types)',
    'CR 111.1 (Tokens)',
  ],
  examples: [
    'each player reveals the top card of their library. For each nonland card revealed this way, you create a Map token',
    'Each player reveals the top card of their library. For each nonland card revealed this way, you create a Treasure token',
  ],
  rejects: [
    'each player reveals the top card of their library',
    'each player reveals the top card of their library. For each land card revealed this way, you create a Map token',
    'each player reveals the top two cards of their library. For each nonland card revealed this way, you create a Map token',
    'each opponent reveals the top card of their library. For each nonland card revealed this way, you create a Map token',
    'each player reveals the top card of their library. For each nonland card revealed this way, each player creates a Map token',
    'each player reveals the top card of their library. For each nonland card revealed this way, you create a Map token and draw a card',
    'you reveal the top card of your library. For each nonland card revealed this way, you create a Map token',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      pattern(
        /each player reveals the top card of their library\. for each nonland card revealed this way, you create /iu,
      ),
      family<IrToken>('token', { only: ['token.predefined', 'token.custom'] }),
    )(ctx, pos);
    if (!r.ok) return r;
    if (/^(?:,| and\b| then\b)/iu.test(ctx.text.slice(r.pos))) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: [makeClause(REVEAL_ID, 'revealEachTokenForNonland', { token: r.value[1] }, span)],
      pos: r.pos,
    };
  },
});

export const AHOY_G10_EFFECT_RULES = [
  EFFECT_CONVOKERS_CONNIVE,
  EFFECT_EACH_PLAYER_REVEALS_TOKEN_FOR_NONLAND,
];
