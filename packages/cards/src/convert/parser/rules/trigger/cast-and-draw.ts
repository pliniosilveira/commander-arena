/**
 * Trigger rule of a spell cast and a card drawn written as one sentence (CR 603.2c: two events, each triggers the ability on its own and they share the
 * effect): "Whenever you cast a noncreature spell and whenever you draw your third card each turn, ...". It starts like `trigger.cast`, which stops before
 * the rest, so it comes before it.
 */
import { literal, sequence } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, family, quietly } from '../registry';

/**
 * `trigger.cast-and-draw`: the cast trigger of `trigger.cast` and, after " and whenever ", the draw trigger of `trigger.drawn` (CR 603.2c, 121.2, 601.2i).
 * Like `trigger.or` it lowers to one engine ability for each event, sharing the effect. Not read: "when" for the second event, "or", a second event that is
 * not a draw, a third event.
 */
export const TRIGGER_CAST_AND_DRAW = quietly(
  defineRule<IrTrigger>({
    id: 'trigger.cast-and-draw',
    family: 'trigger',
    leading: ['you', 'an', 'a'],
    cites: [
      'CR 603.2c (Handling Triggered Abilities)',
      'CR 121.2 (Drawing a Card)',
      'CR 601.2i (Casting Spells)',
    ],
    examples: [
      'you cast a noncreature spell and whenever you draw your third card each turn',
      'you cast a creature spell and whenever you draw a card',
    ],
    rejects: [
      'you cast a noncreature spell and when you draw your third card each turn',
      'you cast a noncreature spell or whenever you draw your third card each turn',
      'you cast a noncreature spell and whenever you draw',
      'you cast a noncreature spell and whenever ~ attacks',
      'you cast a noncreature spell and whenever you draw a card and whenever you draw your second card each turn',
      'you draw a card and whenever you cast a noncreature spell',
    ],
    parse: (ctx, pos) => {
      const r = sequence(
        family<IrTrigger>('trigger', { only: ['trigger.cast'] }),
        literal(' and whenever '),
        family<IrTrigger>('trigger', { only: ['trigger.drawn'] }),
      )(ctx, pos);
      if (!r.ok) return r;
      const [cast, , draw] = r.value;
      return {
        ok: true,
        value: {
          ...cast,
          span: { start: pos, end: r.pos },
          rule: 'trigger.cast-and-draw',
          alternatives: [draw],
        },
        pos: r.pos,
      };
    },
  }),
);

export const CAST_AND_DRAW_TRIGGER_RULES = [TRIGGER_CAST_AND_DRAW] as const;
