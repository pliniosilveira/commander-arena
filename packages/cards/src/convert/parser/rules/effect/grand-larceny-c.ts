/**
 * Effect rule of group C of the Grand Larceny deck (issue 119): "an opponent draws a card." (Baleful Mastery; CR 608.2d, 102.2, 121.1).
 */
import { fail, pattern } from '../../combinators';
import type { IrAmount, IrNoun } from '../../ir/types';
import { defineRule } from '../registry';
import { type Clauses, makeClause } from './operands';

/** The words of the number of cards drawn. */
const COUNTS: Readonly<Record<string, number>> = {
  a: 1,
  two: 2,
  three: 3,
  four: 4,
};

/**
 * `effect.an-opponent-draws`: "an opponent draws a card" (CR 608.2d: no target is chosen, so the controller of the spell or ability chooses the opponent as it resolves, as the Scryfall
 * ruling of Baleful Mastery says; CR 102.2: an opponent is a player of another team; CR 121.1: drawing a card). Two instructions: choose an opponent (the engine's `choosePlayer`, nothing
 * is asked when one opponent is left) and that player draws the cards. Not read: "target opponent", "each opponent", "an opponent draws" with another number, "an opponent may", "an
 * opponent of your choice", "an opponent discards", more words after it.
 */
export const EFFECT_AN_OPPONENT_DRAWS = defineRule<Clauses>({
  id: 'effect.an-opponent-draws',
  family: 'effect',
  leading: ['an'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 102.2 (Players)',
    'CR 121.1 (Drawing a Card)',
  ],
  examples: ['an opponent draws a card', 'an opponent draws two cards'],
  rejects: [
    'an opponent draws a card.',
    'an opponent draws',
    'an opponent draws cards',
    'an opponent draws a card and gains 2 life',
    'an opponent may draw a card',
    'an opponent draws five cards',
    'an opponent draws one card',
    'an opponent draws a cards',
    'an opponent discards a card',
    'a player draws a card',
    'target opponent draws a card',
    'each opponent draws a card',
    'an opponent draws two card',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /an opponent draws (?:(a) card|(two|three|four) cards)(?![\p{L}\p{N}'’])(?!,| and\b| then\b)/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const id = 'effect.an-opponent-draws';
    const count = COUNTS[(r.value[1] ?? r.value[2] ?? '').toLowerCase()];
    if (count === undefined) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    const that: IrNoun = {
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: 'that player' },
      upTo: false,
      plural: false,
      other: false,
      span,
      rule: id,
      ref: 'chosen',
    };
    const amount: IrAmount = { kind: 'number', value: count, span };
    return {
      ok: true,
      value: [
        makeClause(id, 'chooseOpponent', {}, span),
        makeClause(id, 'draw', { player: that, amount }, span),
      ],
      pos: r.pos,
    };
  },
});

export const GRAND_LARCENY_C_EFFECT_RULES = [EFFECT_AN_OPPONENT_DRAWS];
