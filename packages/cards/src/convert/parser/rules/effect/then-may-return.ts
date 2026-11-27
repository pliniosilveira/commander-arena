/**
 * Effect rule of the Jump Scare! deck (issue 108, group C): "Draw a card, then you may return a land you control to its owner's hand." (Kefnet the Mindful).
 */
import { fail, pattern, sequence } from '../../combinators';
import { defineRule, quietly } from '../registry';
import { objectSubject } from '../trigger/subjects';
import { type Clauses, makeClause } from './operands';
import { impliedYou } from './player';

const ID = 'effect.draw-then-may-return-own';

/**
 * `effect.draw-then-may-return-own`: "Draw a card, then you may return a land you control to its owner's hand." (Kefnet the Mindful; CR 121.1, 608.2d, 400.3, 108.3): the draw, and the
 * return of one permanent of a kind the controller controls, which they may decline. The choice is made as the instruction runs, after the card is drawn (Kefnet's ruling). The engine's
 * `draw` and a `may` of a `moveToZone` of a chosen permanent to the hand. Not read: a number of cards other than one, a permanent that is not the controller's, a target, "up to", more after it.
 */
export const EFFECT_DRAW_THEN_MAY_RETURN_OWN = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['draw'],
  cites: [
    'CR 121.1 (Drawing a Card)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 400.3 (General)',
  ],
  examples: [
    "draw a card, then you may return a land you control to its owner's hand",
    "draw a card, then you may return a creature you control to its owner's hand",
  ],
  rejects: [
    "draw a card, then return a land you control to its owner's hand",
    "draw two cards, then you may return a land you control to its owner's hand",
    "draw a card, then you may return a land to its owner's hand",
    "draw a card, then you may return target land you control to its owner's hand",
    "draw a card, then you may return a land you control to its owner's hand and draw a card",
    "draw a card, then you may return a land an opponent controls to its owner's hand",
    'draw a card, then you may return a land you control to your hand',
  ],
  parse: (ctx, pos) => {
    const head = pattern(/draw a card, then you may return /iu)(ctx, pos);
    if (!head.ok) return head;
    const r = sequence(
      objectSubject(ID),
      pattern(/ to its owner['’]s hand(?![\p{L}\p{N}])(?!\s+(?:and|at|unless))/iu),
    )(ctx, head.pos);
    if (!r.ok) return r;
    const [noun] = r.value;
    if (noun.filter.controller !== 'you' || noun.other || noun.upTo) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    const one = { kind: 'number' as const, value: 1, span, rule: ID };
    return {
      ok: true,
      value: [
        {
          ...makeClause(ID, 'draw', { player: impliedYou(ID, pos), amount: one }, span),
          connector: 'then' as const,
        },
        makeClause(ID, 'mayReturnOwn', { objects: noun }, span),
      ],
      pos: r.pos,
    };
  },
});

export const THEN_MAY_RETURN_EFFECT_RULES = [quietly(EFFECT_DRAW_THEN_MAY_RETURN_OWN)];
