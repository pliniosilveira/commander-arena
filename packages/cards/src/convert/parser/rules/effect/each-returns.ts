/**
 * Effect rule of the Revenant Recon deck (Discovery // Dispersal): "Each opponent returns a nonland permanent they control with the greatest mana value among permanents they control to
 * its owner's hand, then discards a card." (CR 608.2d, 101.4, 202.3, 701.9). Each player the subject names chooses among their own permanents; the engine's `moveToZone` of a `choose`
 * with `players` (and `greatest`), then `discard` (`lower/each-returns.ts`).
 */
import { pattern } from '../../combinators';
import type { IrArg, IrClause, IrNoun, Span } from '../../ir/types';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.each-returns';

const flag = (value: boolean, span: Span): IrArg => ({ kind: 'flag', value, span, rule: ID });

/**
 * `effect.each-returns`: "each opponent returns a nonland permanent they control to its owner's hand", "each player returns a creature they control to its owner's hand", with the
 * limit "with the greatest mana value among permanents they control" (CR 608.2d: the player chooses among the tied permanents) and the tail ", then discards a card" (CR 701.9). The
 * greatest value among the nonland permanents and among all the permanents is the same (a land has mana value 0, a nonland permanent has at least 0), so the limit is read as the
 * ties for the greatest mana value among the permanents the player may choose. Not read: another number of permanents, "a permanent of your choice", "target", another zone, "their
 * owner's hand", another tail, "each other player".
 */
export const EFFECT_EACH_RETURNS = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 101.4 (Players)',
    'CR 202.3 (Mana Value)',
    'CR 701.9 (Discard)',
  ],
  examples: [
    "each opponent returns a nonland permanent they control with the greatest mana value among permanents they control to its owner's hand, then discards a card",
    "each opponent returns a creature they control to its owner's hand",
    "each player returns a nonland permanent they control to its owner's hand",
    "each opponent returns a creature they control with the greatest mana value among permanents they control to its owner's hand",
  ],
  rejects: [
    "each opponent returns two creatures they control to its owner's hand",
    "each opponent returns a nonland permanent they control to its owner's hand, then discards two cards",
    "each opponent returns a nonland permanent they control to their owner's hand",
    "each opponent returns target nonland permanent they control to its owner's hand",
    'each opponent returns a nonland permanent they control to the top of their library',
    "each other player returns a creature they control to its owner's hand",
    "each opponent returns a nonland permanent they control with the greatest mana value to its owner's hand",
    "each opponent returns a nonland permanent they control to its owner's hand and discards a card",
    "each opponent returns a nonland permanent to its owner's hand",
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /each (opponent|player) returns an? (nonland permanent|creature|permanent) they control( with the greatest mana value among permanents they control)? to its owner['’]s hand(, then discards a card)?(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span, value: m } = r.value;
    const who = (m[1] ?? '').toLowerCase();
    const what = (m[2] ?? '').toLowerCase();
    const players: IrNoun = {
      kind: 'noun',
      det: who === 'opponent' ? 'eachOpponent' : 'eachPlayer',
      filter: { raw: `each ${who}` },
      upTo: false,
      plural: false,
      other: false,
      span,
      rule: ID,
    };
    const returned = makeClause(
      ID,
      'eachReturns',
      {
        players,
        nonland: flag(what === 'nonland permanent', span),
        creature: flag(what === 'creature', span),
        greatest: flag(m[3] !== undefined, span),
      },
      span,
    );
    const clauses: IrClause[] = [returned];
    if (m[4] !== undefined) {
      clauses.push(makeClause(ID, 'eachDiscardsOne', { players: { ...players, rule: ID } }, span));
    }
    return { ok: true, value: clauses, pos: r.pos };
  },
});

export const EACH_RETURNS_EFFECT_RULES = [EFFECT_EACH_RETURNS].map(quietly);
