/**
 * Condition of the Mind Flayarrrs deck (River of Tears): "you played a land this turn", the condition of a mana ability that makes other mana instead.
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule, spanned } from '../registry';

/**
 * `condition.played-land-this-turn`: "you played a land this turn" (CR 305.1, 305.2: playing a land is a special action, counted per player and per turn). The engine's
 * `playedLandThisTurn`, read as the ability is used. Not read: another player ("an opponent played a land"), a count ("you played two lands"), another time ("last turn"),
 * "you've played", a land put onto the battlefield, "played a land" with no "this turn".
 */
export const CONDITION_PLAYED_LAND_THIS_TURN = defineRule<IrCondition>({
  id: 'condition.played-land-this-turn',
  family: 'condition',
  leading: ['you'],
  cites: ['CR 305.1 (Lands)', 'CR 305.2 (Lands)'],
  examples: ['you played a land this turn'],
  rejects: [
    'you played a land this turn.',
    'an opponent played a land this turn',
    'you played two lands this turn',
    'you played a land last turn',
    'you have played a land this turn',
    'you played a land',
    'you put a land onto the battlefield this turn',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(/you played a land this turn(?![\p{L}\p{N}])/iu))(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'playedLandThisTurn' },
        span: { start: pos, end: r.pos },
        rule: 'condition.played-land-this-turn',
      },
      pos: r.pos,
    };
  },
});

export const PLAYED_LAND_CONDITION_RULES = [CONDITION_PLAYED_LAND_THIS_TURN];
