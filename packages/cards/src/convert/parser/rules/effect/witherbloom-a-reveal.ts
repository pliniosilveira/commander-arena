/**
 * Effect rule of group A of the Witherbloom Witchcraft deck (issue 190): "Reveal the top card of your library. If it's a creature card, create a 1/1 green Saproling creature
 * token. If it's a land card, put that card onto the battlefield under your control. If it's a noncreature, nonland card, you gain 2 life." and "Reveal the top card of your
 * library. If it's a creature card, you gain life equal to that card's toughness, lose life equal to its power, then put it into your hand." The engine runs `revealTopBranches`
 * (rules/reveal-top-branches.ts); only the words are new. The sentences of one reveal are kept together by the segmenter (`segment.ts`).
 */
import {
  choice,
  fail,
  literal,
  many,
  map,
  type Parser,
  pattern,
  sequence,
} from '../../combinators';
import type { IrAmount, IrArg, IrFilter, IrNoun, IrToken } from '../../ir/types';
import { BOUNDARY, CARD_TYPES } from '../noun/phrases';
import { defineRule, family } from '../registry';
import { TAKEN_CARD } from './library';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.reveal-top-branches';

/** One thing a branch does, in the words the rule reads. */
type Act =
  | { readonly kind: 'token'; readonly token: IrToken }
  | { readonly kind: 'gain'; readonly amount: IrAmount }
  | { readonly kind: 'gainToughness' }
  | { readonly kind: 'losePower' }
  | { readonly kind: 'battlefield' }
  | { readonly kind: 'hand' };

const NON_TYPE = `non(?:${CARD_TYPES})`;

/** "a noncreature, nonland card": a card that has none of the card types the words leave out (CR 205.2a), each with its own "non". */
const NONMATCHING_CARD: Parser<IrNoun> = (ctx, pos) => {
  const r = pattern(new RegExp(`an? (${NON_TYPE}(?:,? ${NON_TYPE})*) card${BOUNDARY}`, 'iu'))(
    ctx,
    pos,
  );
  if (!r.ok) return r;
  const notTypes = [...(r.value[1] ?? '').toLowerCase().matchAll(/non([a-z]+)/gu)].map(
    (m) => m[1] ?? '',
  );
  if (new Set(notTypes).size !== notTypes.length) return fail(ctx, pos);
  const filter: IrFilter = {
    notTypes,
    card: true,
    raw: ctx.text.slice(pos, r.pos),
  };
  return {
    ok: true,
    value: {
      kind: 'noun',
      det: 'a',
      filter,
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: r.pos },
      rule: ID,
    },
    pos: r.pos,
  };
};

const NUMBER_WORDS = /^\d+$/u;

const ACT: Parser<Act> = choice<Act>(
  map(
    sequence(
      literal('create '),
      family<IrToken>('token', { only: ['token.predefined', 'token.custom'] }),
    ),
    ([, token]): Act => ({ kind: 'token', token }),
  ),
  (ctx, pos) => {
    const r = pattern(new RegExp(`(?:you )?gain (\\d+) life${BOUNDARY}`, 'iu'))(ctx, pos);
    if (!r.ok) return r;
    const text = r.value[1] ?? '';
    if (!NUMBER_WORDS.test(text) || Number(text) < 1) return fail(ctx, pos);
    return {
      ok: true,
      value: {
        kind: 'gain',
        amount: { kind: 'number', value: Number(text), span: { start: pos, end: r.pos } },
      },
      pos: r.pos,
    };
  },
  map(
    pattern(new RegExp(`(?:you )?gain life equal to that card['’]s toughness${BOUNDARY}`, 'iu')),
    (): Act => ({ kind: 'gainToughness' }),
  ),
  map(
    pattern(new RegExp(`(?:you )?lose life equal to its power${BOUNDARY}`, 'iu')),
    (): Act => ({ kind: 'losePower' }),
  ),
  map(
    pattern(
      new RegExp(
        `put (?:it|that card) onto the battlefield(?: under your control)?${BOUNDARY}`,
        'iu',
      ),
    ),
    (): Act => ({ kind: 'battlefield' }),
  ),
  map(
    pattern(new RegExp(`put (?:it|that card) into your hand${BOUNDARY}`, 'iu')),
    (): Act => ({ kind: 'hand' }),
  ),
);

/** What a branch does, in text order: "A", "A, B", "A, B, then C", "A and B": the card is put somewhere last, and once. */
const ACTS: Parser<Act[]> = (ctx, pos) => {
  const first = ACT(ctx, pos);
  if (!first.ok) return first;
  const more = many(map(sequence(pattern(/, then |, | and /iu), ACT), ([, act]) => act))(
    ctx,
    first.pos,
  );
  if (!more.ok) return more;
  const acts = [first.value, ...more.value];
  const moves = acts.filter((a) => a.kind === 'battlefield' || a.kind === 'hand');
  const lastIsMove = acts[acts.length - 1] === moves[0];
  if (moves.length > 1 || (moves.length === 1 && !lastIsMove)) return fail(ctx, pos);
  // The life of "that card's toughness" and "its power" is read of the card revealed: one of each at most, and only as a pair of one branch.
  const kinds = acts.map((a) => a.kind);
  if (new Set(kinds).size !== kinds.length) return fail(ctx, pos);
  return { ok: true, value: acts, pos: more.pos };
};

const BRANCH_HEAD = pattern(/if it['’]s /iu);

/** ". If it's a land card, put that card onto the battlefield under your control": the kind of card, and what is done when the card revealed is of it. */
const BRANCH = (ctx: Parameters<Parser<unknown>>[0], pos: number) => {
  const head = BRANCH_HEAD(ctx, pos);
  if (!head.ok) return head;
  const card = choice(NONMATCHING_CARD, TAKEN_CARD)(ctx, head.pos);
  if (!card.ok) return card;
  const comma = literal(', ')(ctx, card.pos);
  if (!comma.ok) return comma;
  const acts = ACTS(ctx, comma.pos);
  if (!acts.ok) return acts;
  return {
    ok: true,
    value: { card: card.value, acts: acts.value },
    pos: acts.pos,
  } as const;
};

/** What may follow the last branch: nothing that adds an instruction the card would not always get. */
const MORE_AFTER = /^(?:,| and\b| then\b)/iu;

/**
 * `effect.reveal-top-branches`: "reveal the top card of your library. If it's a creature card, create a 1/1 green Saproling creature token. If it's a land card, put that card onto the
 * battlefield under your control. If it's a noncreature, nonland card, you gain 2 life." (CR 701.20a: revealing shows the card to every player and it stays on top of the library; CR
 * 608.2c: each "if" sentence is read as the effect comes up, of the card as it was revealed, so a card of two kinds does both). Each sentence names the kind of card (card types, or the
 * types the words leave out) and what is done when the card is of it: create a token, gain a number of life, gain life equal to that card's toughness, lose life equal to its power,
 * and put it onto the battlefield or into your hand, which comes last and once. The engine's `revealTopBranches` of your own library. Not read: more than the top card, another library,
 * "you may", a kind no sentence names, a sentence without its comma, "otherwise", an instruction the engine's branch does not run ("exile it"), a second move of the card, the same act twice.
 */
export const EFFECT_REVEAL_TOP_BRANCHES = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['reveal'],
  cites: [
    'CR 701.20a (Reveal)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 205.2a (Card Types)',
    'CR 119.3 (Life)',
  ],
  examples: [
    "reveal the top card of your library. If it's a creature card, create a 1/1 green Saproling creature token. If it's a land card, put that card onto the battlefield under your control. If it's a noncreature, nonland card, you gain 2 life",
    "reveal the top card of your library. If it's a creature card, you gain life equal to that card's toughness, lose life equal to its power, then put it into your hand",
    "reveal the top card of your library. If it's a land card, put it onto the battlefield. If it's an artifact card, you gain 3 life",
    "reveal the top card of your library. If it's a creature card, you gain 2 life",
  ],
  rejects: [
    'reveal the top card of your library',
    "reveal the top card of your library. If it's a creature card",
    "reveal the top card of your library. If it's a creature card you gain 2 life",
    "reveal the top two cards of your library. If it's a creature card, you gain 2 life",
    "reveal the top card of their library. If it's a creature card, you gain 2 life",
    "you may reveal the top card of your library. If it's a creature card, you gain 2 life",
    "reveal the top card of your library. If it's a creature card, you gain 2 life and draw a card",
    "reveal the top card of your library. If it's a creature card, exile it",
    "reveal the top card of your library. If it's a creature card, put it into your hand, then you gain 2 life",
    "reveal the top card of your library. If it's a creature card, put it into your hand and put it onto the battlefield",
    "reveal the top card of your library. If it's a creature card, you gain 2 life and gain 3 life",
    "reveal the top card of your library. If it's a creature card, you gain 2 life. Otherwise, put it into your hand",
    "reveal the top card of your library. If it's a noncreature, noncreature card, you gain 2 life",
    "reveal the top card of your library. If it's a creature card, you gain life equal to its toughness",
    "reveal the top card of your library. If it's a creature card, you gain 0 life",
  ],
  parse: (ctx, pos) => {
    const head = pattern(/reveal the top card of your library\. /iu)(ctx, pos);
    if (!head.ok) return head;
    const first = BRANCH(ctx, head.pos);
    if (!first.ok) return first;
    const rest = many(map(sequence(literal('. '), BRANCH), ([, branch]) => branch))(ctx, first.pos);
    if (!rest.ok) return rest;
    const end = rest.pos;
    if (MORE_AFTER.test(ctx.text.slice(end))) return fail(ctx, pos);
    const branches = [first.value, ...rest.value];
    const span = { start: pos, end };
    const args: Record<string, IrArg> = { count: { kind: 'number', value: branches.length, span } };
    for (const [i, branch] of branches.entries()) {
      args[`what${i}`] = branch.card;
      args[`acts${i}`] = {
        kind: 'name',
        name: branch.acts.map((a) => a.kind).join(','),
        span,
        rule: ID,
      };
      for (const act of branch.acts) {
        if (act.kind === 'token') args[`token${i}`] = act.token;
        if (act.kind === 'gain') args[`gain${i}`] = act.amount;
      }
    }
    return {
      ok: true,
      value: [makeClause(ID, 'revealTopBranches', args, span)],
      pos: end,
    };
  },
});
