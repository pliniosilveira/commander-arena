/**
 * The votes for one option of a vote (stage P44, D-195, the engine's `Amount` `votesFor`, CR 701.38a, 701.38b): "the number of profit votes", the value
 * phrase that "equal to twice the number of profit votes" reads. The option is one word the card gave in its vote ("votes for profit or security"), which
 * has no rules meaning of its own (CR 701.38b); which options a vote offers is the vote's business, so the word is read as written and the engine's
 * validation refuses one the vote does not offer. Not read: "the number of votes" (no option), a plural "the number of profit votes for ...", a pronoun
 * ("your votes", "their votes") and words that count the votes of players ("all", "total", "each", "extra").
 */
import { fail, pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';

/** The words before "votes" that name no option of a card's vote. */
const NOT_AN_OPTION = new Set([
  'a',
  'additional',
  'all',
  'an',
  'any',
  'each',
  'extra',
  'its',
  'no',
  'other',
  'the',
  'their',
  'these',
  'those',
  'total',
  'your',
]);

const VOTES = /the number of ([\p{L}]+(?:-[\p{L}]+)*) votes(?![\p{L}\p{N}])/iu;

/** The value phrase "the number of profit votes", as an atom of the value family. */
export const VOTES_AMOUNT = (ctx: Parameters<ReturnType<typeof pattern>>[0], pos: number) => {
  const r = pattern(VOTES)(ctx, pos);
  if (!r.ok) return r;
  const option = (r.value[1] ?? '').toLowerCase();
  if (NOT_AN_OPTION.has(option)) return fail(ctx, pos);
  const value: IrAmount = { kind: 'votesFor', option, span: { start: pos, end: r.pos } };
  return { ok: true as const, value, pos: r.pos };
};
