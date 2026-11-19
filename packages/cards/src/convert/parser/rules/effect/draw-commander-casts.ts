/**
 * `effect.draw-x-plus-commander-casts`: "target player draws X cards plus an additional card for each time they've cast a commander from the command zone this game" (CR 121.1,
 * 903.8, 107.3a; the Quandrix Unlimited deck, Commander's Insight). One draw of X cards and one more for each time the player the instruction names (a target, "they") cast a
 * commander from the command zone: the engine's `draw` of the `sum` of `x` and `commanderCasts` of that player.
 */
import { literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';
import { type Clauses, makeClause } from './operands';

export const EFFECT_DRAW_X_PLUS_COMMANDER_CASTS = defineRule<Clauses>({
  id: 'effect.draw-x-plus-commander-casts',
  family: 'effect',
  leading: ['target'],
  cites: ['CR 121.1 (Drawing a Card)', 'CR 903.8 (Commander)', 'CR 107.3a (Numbers and Symbols)'],
  examples: [
    "target player draws X cards plus an additional card for each time they've cast a commander from the command zone this game",
    'target player draws X cards plus an additional card for each time they’ve cast a commander from the command zone this game',
  ],
  rejects: [
    'target player draws X cards',
    "target player draws X cards plus an additional card for each time they've cast a commander from the command zone",
    "target player draws X cards plus an additional card for each time they've cast a spell this game",
    "target player draws X cards plus an additional card for each time you've cast a commander from the command zone this game",
    "target player draws two cards plus an additional card for each time they've cast a commander from the command zone this game",
    "target creature draws X cards plus an additional card for each time they've cast a commander from the command zone this game",
    "you draw X cards plus an additional card for each time they've cast a commander from the command zone this game",
  ],
  parse: (ctx, pos) => {
    const head = sequence(
      satisfy(family<IrNoun>('noun', { only: ['noun.player'] }), (noun) => noun.det === 'target'),
      literal(' draws '),
    )(ctx, pos);
    if (!head.ok) return head;
    const x = pattern(/X(?![\p{L}\p{N}])/u)(ctx, head.pos);
    if (!x.ok) return x;
    const tail = pattern(
      / cards plus an additional card for each time they['’]ve cast a commander from the command zone this game(?![\p{L}\p{N}])/iu,
    )(ctx, x.pos);
    if (!tail.ok) return tail;
    const [subject] = head.value;
    const span = { start: pos, end: tail.pos };
    // The word "they" itself, so the pronoun has a span of its own for the binding pass.
    const theyAt = x.pos + tail.value[0].toLowerCase().indexOf('they');
    const they: IrNoun = {
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: 'they' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: theyAt, end: theyAt + 4 },
      rule: 'effect.draw-x-plus-commander-casts',
    };
    const amount: IrAmount = {
      kind: 'sum',
      of: [
        { kind: 'x', span: { start: head.pos, end: x.pos } },
        { kind: 'commanderCasts', player: they, span: { start: x.pos, end: tail.pos } },
      ],
      span,
    };
    return {
      ok: true,
      value: [
        makeClause('effect.draw-x-plus-commander-casts', 'draw', { player: subject, amount }, span),
      ],
      pos: tail.pos,
    };
  },
});

export const DRAW_COMMANDER_CASTS_EFFECT_RULES = [EFFECT_DRAW_X_PLUS_COMMANDER_CASTS];
