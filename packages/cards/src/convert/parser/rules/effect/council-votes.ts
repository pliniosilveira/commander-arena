/**
 * Effect rules of the council cards of the Elven Council deck (issue 17): "For each Redhorn Pass vote, search your library for a basic land card ..." (Travel Through Caradhras) and
 * "Each player returns up to two cards from their graveyard to their hand" (Sail into the West). The vote itself is `effect.vote`; the votes counted are `amount.for-each-vote`.
 */
import { fail, literal, map, optional, pattern, sequence } from '../../combinators';
import type { IrAmount, IrCounterSpec } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, makeClause, single } from './operands';

/** The verbs of the instructions that may be repeated for each vote: a search and a chosen card put from the graveyard. Others stay unread (the lowering repeats what it knows). */
const REPEATABLE = new Set(['search', 'putFromZone']);

/**
 * `effect.for-each-vote`: "for each Redhorn Pass vote, search your library for a basic land card and put it onto the battlefield tapped" (CR 608.2c: an instruction followed once for each
 * vote for the option, 701.38b: the options have no rules meaning of their own, 701.23: search). One instruction, one clause: the clause carries the count of votes as `repeatFor`, and the
 * lowering does the instruction that many times (the engine's `repeat`, none for no votes). Not read: no option ("for each vote"), more than one instruction after the comma, an
 * instruction that is not a search or a card chosen from a graveyard, a "you may" ("for each vote, you may ...": the offer is made again each time).
 */
export const EFFECT_FOR_EACH_VOTE = defineRule<Clauses>({
  id: 'effect.for-each-vote',
  family: 'effect',
  leading: ['for'],
  cites: [
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 701.38b (Vote)',
    'CR 701.23 (Search)',
    'CR 400.7 (General)',
  ],
  examples: [
    'for each Redhorn Pass vote, search your library for a basic land card and put it onto the battlefield tapped',
    'For each Mines of Moria vote, return a card from your graveyard to your hand',
    'for each wild vote, return a creature card from your graveyard to your hand',
  ],
  rejects: [
    'for each vote, search your library for a basic land card and put it onto the battlefield tapped',
    'for each Redhorn Pass vote, search your library for a basic land card and put it onto the battlefield tapped and draw a card',
    'for each Redhorn Pass vote, you may return a card from your graveyard to your hand',
    'for each Redhorn Pass vote, draw a card and lose 1 life',
    'for each Redhorn Pass vote, tap target creature',
    'for each extra vote, return a card from your graveyard to your hand',
    'for each Redhorn Pass vote,',
    'for each creature you control, return a card from your graveyard to your hand',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.for-each-vote';
    const lead = sequence(
      family<IrAmount>('amount', { only: ['amount.for-each-vote'] }),
      literal(', '),
    )(ctx, pos);
    if (!lead.ok) return lead;
    const inner = family<Clauses>('effect', {
      only: ['effect.search-by', 'effect.search', 'effect.return-chosen-card'],
    })(ctx, lead.pos);
    if (!inner.ok) return fail(ctx, pos);
    const [only, ...more] = inner.value;
    if (only === undefined || more.length > 0 || !REPEATABLE.has(only.verb)) return fail(ctx, pos);
    if (only.optional || (only.args.may?.kind === 'flag' && only.args.may.value))
      return fail(ctx, pos);
    // "..., return a card and draw a card": what follows is more of the same instruction and would not be repeated: not read.
    if (/^(?:, | and | then )/iu.test(ctx.text.slice(inner.pos))) return fail(ctx, pos);
    return {
      ok: true,
      value: [
        {
          ...only,
          span: { start: pos, end: inner.pos },
          rule: id,
          args: { ...only.args, repeatFor: lead.value[0] },
        },
      ],
      pos: inner.pos,
    };
  },
});

/**
 * `effect.each-player-returns`: "each player returns up to two cards from their graveyard to their hand" (CR 101.4, 608.2d, 400.3: each player chooses among their own graveyard, in
 * turn order, and the cards go to their owner's hand). The engine's `forEachPlayer` that runs as each player, with a choice of none to the number of cards. Not read: another number or "all",
 * "target player returns", another zone, a kind of card, "up to one", cards from another graveyard.
 */
export const EFFECT_EACH_PLAYER_RETURNS = defineRule<Clauses>({
  id: 'effect.each-player-returns',
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 101.4 (Handling Simultaneous Decisions)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 400.3 (General)',
  ],
  examples: [
    'each player returns up to two cards from their graveyard to their hand',
    'each player returns up to three cards from their graveyard to their hand',
  ],
  rejects: [
    'each player returns up to two cards from their graveyard to the battlefield',
    'each player returns two cards from their graveyard to their hand',
    'each player returns up to one card from their graveyard to their hand',
    'each opponent returns up to two cards from their graveyard to their hand',
    'each player returns up to two cards from a graveyard to their hand',
    'each player returns up to two creature cards from their graveyard to their hand',
    'each player returns up to two cards from their hand to their graveyard',
    'each player returns up to two cards from their graveyard to their hand and draws a card',
  ],
  parse: (ctx, pos) => {
    const r = map(
      spanned(
        sequence(
          literal('each player returns up to '),
          family<IrAmount>('amount', { only: ['amount.number'] }),
          literal(' cards from their graveyard to their hand'),
        ),
      ),
      ({ value, span }) => ({ amount: value[1], span }),
    )(ctx, pos);
    if (!r.ok) return r;
    // "up to one" is "a card": another wording, and a count of 2 or more is the choice of several.
    if (r.value.amount.kind !== 'number' || r.value.amount.value < 2) return fail(ctx, pos);
    // "... to their hand and draws a card": a verb that goes on for the same players is not read here.
    if (/^ and (?!then )/iu.test(ctx.text.slice(r.pos))) return fail(ctx, pos);
    return {
      ok: true,
      value: [
        makeClause(
          'effect.each-player-returns',
          'eachPlayerReturnsUpTo',
          { count: r.value.amount },
          r.value.span,
        ),
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.you-exile`: "you exile ~" after another instruction ("..., then you exile this spell", Sail into the West): the controller, said in words, doing what "exile ~" says (CR 608.2c, 608.2n:
 * the spell exiled by its own instruction is not put into a graveyard as it finishes). The words after "you" are read by `effect.exile`. Not read: another subject, "you may exile".
 */
export const EFFECT_YOU_EXILE = defineRule<Clauses>({
  id: 'effect.you-exile',
  family: 'effect',
  leading: ['you'],
  cites: [
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 608.2n (Resolving Spells and Abilities)',
  ],
  examples: ['you exile ~', 'you exile target creature'],
  rejects: [
    'you may exile ~',
    'you exile',
    'each player exiles ~',
    'you exile ~ and',
    'target player exiles ~',
  ],
  parse: (ctx, pos) => {
    const lead = literal('you ')(ctx, pos);
    if (!lead.ok) return lead;
    const exiled = family<Clauses>('effect', { only: ['effect.exile'] })(ctx, lead.pos);
    if (!exiled.ok) return fail(ctx, pos);
    return {
      ok: true,
      value: exiled.value.map((c) => ({
        ...c,
        span: { start: pos, end: c.span.end },
        rule: 'effect.you-exile',
      })),
      pos: exiled.pos,
    };
  },
});

/**
 * `effect.add-counters-ring-bearer`: "put a +1/+1 counter on your Ring-bearer" (CR 701.54e: the creature that is your Ring-bearer; CR 122.6: putting counters on an object). The engine's
 * `addCounters` on the `ringBearer` object, which is nothing when the player has no Ring-bearer. Only a +1/+1 or -1/-1 style counter and a number or "a". Not read: another player's
 * Ring-bearer, "target Ring-bearer", "that creature", "each Ring-bearer", a number that is X, a named counter.
 */
export const EFFECT_ADD_COUNTERS_RING_BEARER = defineRule<Clauses>({
  id: 'effect.add-counters-ring-bearer',
  family: 'effect',
  leading: ['put', 'you'],
  cites: ['CR 701.54e (The Ring Tempts You)', 'CR 122.6 (Counters)'],
  examples: [
    'put a +1/+1 counter on your Ring-bearer',
    'you put a +1/+1 counter on your Ring-bearer',
    'put two +1/+1 counters on your Ring-bearer',
  ],
  rejects: [
    'put a +1/+1 counter on their Ring-bearer',
    'put a +1/+1 counter on target Ring-bearer',
    'put X +1/+1 counters on your Ring-bearer',
    'put a charge counter on your Ring-bearer',
    'put a +1/+1 counter on your Ring-bearer and draw a card',
    'put a +1/+1 counter on each Ring-bearer',
    'put a +1/+1 counter on your Ring-bearers',
  ],
  parse: single(
    'effect.add-counters-ring-bearer',
    sequence(
      optional(literal('you '), null),
      literal('put '),
      family<IrAmount>('amount', { only: ['amount.number', 'amount.article'] }),
      literal(' '),
      map(
        spanned(pattern(/[+-]\d+\/[+-]\d+/u)),
        ({ value, span }): IrCounterSpec => ({
          kind: 'counterSpec',
          name: value[0],
          span,
          rule: 'effect.add-counters-ring-bearer',
        }),
      ),
      pattern(/ counters? on your Ring-bearer(?![\p{L}\p{N}-])/u),
    ),
    ([, , count, , counter]) => ({
      verb: 'addCountersRingBearer',
      args: { count, counter },
    }),
  ),
});

export const COUNCIL_VOTES_EFFECT_RULES = [
  EFFECT_ADD_COUNTERS_RING_BEARER,
  EFFECT_FOR_EACH_VOTE,
  EFFECT_EACH_PLAYER_RETURNS,
  EFFECT_YOU_EXILE,
];
