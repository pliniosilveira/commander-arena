/**
 * Replacement rule of the Hosts of Mordor deck (Notion Thief): "If an opponent would draw a card except the first one they draw in each of their draw steps, instead that player skips
 * that draw and you draw a card." (CR 614.1a, 614.11, 504.1). The engine's `drawRedirect`: each draw of an opponent of the controller but the first of each of their draw steps does not
 * happen, and the controller draws a card in its place.
 */
import { literal, sequence } from '../../combinators';
import type { IrAbility, IrClause } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { replacement } from './shared';

const ID = 'replacement.draw-redirect';

/**
 * `replacement.draw-redirect`: "If an opponent would draw a card except the first one they draw in each of their draw steps, instead that player skips that draw and you draw a card."
 * (CR 614.1a, 614.11, 504.1, 121.6). Not read: a replacement of every draw (the engine has no form without the exception), another exception ("except the first one they draw
 * each turn"), the draws of another player than an opponent, more than one card, another result ("they draw a card instead"), a missing period or "instead".
 */
export const REPLACEMENT_DRAW_REDIRECT = defineRule<IrAbility>({
  id: ID,
  family: 'replacement',
  leading: ['if'],
  cites: [
    'CR 614.1a (Replacement Effects)',
    'CR 614.11 (Replacement Effects)',
    'CR 504.1 (Draw Step)',
    'CR 121.6 (Drawing a Card)',
  ],
  examples: [
    'If an opponent would draw a card except the first one they draw in each of their draw steps, instead that player skips that draw and you draw a card.',
  ],
  rejects: [
    'If an opponent would draw a card except the first one they draw in each of their draw steps, instead that player skips that draw and you draw a card',
    'If an opponent would draw a card except the first one they draw in each of their draw steps, instead that player skips that draw.',
    'If an opponent would draw a card except the first one they draw in each of their draw steps, they draw two cards instead.',
    'If an opponent would draw a card, instead that player skips that draw and you draw a card.',
    'If an opponent would draw a card except the first one they draw each turn, instead that player skips that draw and you draw a card.',
    'If a player would draw a card except the first one they draw in each of their draw steps, instead that player skips that draw and you draw a card.',
    'If you would draw a card except the first one you draw in each of your draw steps, instead that player skips that draw and you draw a card.',
    'If an opponent would draw a card except the first one they draw in each of their draw steps, instead that player skips that draw and you draw two cards.',
    'If an opponent would draw a card except the first one they draw in each of their draw steps, that player skips that draw and you draw a card.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal(
        'if an opponent would draw a card except the first one they draw in each of their draw steps, instead that player skips that draw and you draw a card',
      ),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const event: IrClause = {
      kind: 'clause',
      verb: 'drawRedirect',
      args: {},
      optional: false,
      span,
      rule: ID,
    };
    return { ok: true, value: replacement(ID, span, event), pos: r.pos };
  },
});

export const DRAW_REDIRECT_REPLACEMENT_RULES = [REPLACEMENT_DRAW_REDIRECT].map(quietly);
