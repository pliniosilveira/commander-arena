/**
 * "If you didn't draw cards this way" (Mr. Foxglove): what a draw of the controller before it in the same text did. What the engine can run is the lowering's business
 * (`lower/conditions.ts`).
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `condition.didnt-draw-this-way`: "you didn't draw cards this way", "you didn't draw a card this way" (CR 608.2c: what the instruction before it did, CR 121.1: a card is drawn; an
 * amount of 0, or an empty library, draws none). The engine's `not` of `thisWayAtLeast` `playersDrew` 1. Only after a draw of the controller in the same text, which the lowering checks.
 * Not read: another player ("an opponent didn't draw"), the positive "you drew", the present tense, "this turn".
 */
export const CONDITION_DIDNT_DRAW_THIS_WAY = defineRule<IrCondition>({
  id: 'condition.didnt-draw-this-way',
  family: 'condition',
  leading: ['you'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)', 'CR 121.1 (Drawing a Card)'],
  examples: [
    'you didn’t draw cards this way',
    "you didn't draw cards this way",
    "you didn't draw a card this way",
    "You didn't draw cards this way",
  ],
  rejects: [
    "you didn't draw cards",
    "you didn't draw cards this turn",
    'you drew cards this way',
    "you don't draw cards this way",
    "an opponent didn't draw cards this way",
    "you didn't draw two cards this way",
    "you didn't draw cards this wayward",
  ],
  parse: (ctx, pos) => {
    const r = pattern(/you didn['’]t draw (?:cards|a card) this way(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'notDrewThisWay' },
        span: { start: pos, end: r.pos },
        rule: 'condition.didnt-draw-this-way',
      },
      pos: r.pos,
    };
  },
});

export const DREW_THIS_WAY_CONDITION_RULES = [CONDITION_DIDNT_DRAW_THIS_WAY];
