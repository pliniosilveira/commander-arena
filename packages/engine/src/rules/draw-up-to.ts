/**
 * "Its controller may draw up to two cards at the beginning of the next turn's upkeep" (D-217, CR 121.1, 608.2d): the `draw` effect with `upTo`, run as an
 * instruction. The player who draws (the one the selector names, who is not always the controller of the effect: the controller of a countered spell) is asked
 * how many cards, from none to the most the effect says (a `chooseX` decision of purpose `drawUpTo`); the cards are then drawn one at a time as any draw is.
 */
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { sourceInfo } from './source-info';
import { done, type StepOutcome } from './step-outcome';

type DrawUpTo = Extract<Instruction, { kind: 'drawUpTo' }>;

export function runDrawUpTo(state: GameState, res: ResolutionContext, ins: DrawUpTo): StepOutcome {
  if (ins.amount === null) {
    if (ins.max <= 0) return done(state);
    const info = sourceInfo(state, res.source);
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'chooseX',
        seat: ins.seat,
        source: res.object,
        sourceName: info?.name ?? '',
        sourceOracleText: info?.oracleText ?? '',
        purpose: 'drawUpTo',
        min: 0,
        max: ins.max,
        perX: { mana: 0, life: 0 },
      },
    };
  }
  if (ins.amount <= 0) return done(state);
  return done(
    state,
    [],
    [{ kind: 'draw', seat: ins.seat, count: ins.amount, commanderChoice: null }],
  );
}
