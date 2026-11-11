/**
 * The question of connive (D-223) that the engine asks as a `choosePermanent`: "If multiple permanents are instructed to connive at the same time, the first
 * player in APNAP order who controls one or more of those permanents chooses one of them and it connives" (`conniveOrder`, CR 701.50c), asked when that
 * player has two or more. The words read the decision and the objects it names and nothing else. No new dialog kind: the permanent is chosen on the board
 * (a permanent that has left the battlefield cannot be clicked: the engine would take it, the board shows none). Pure.
 */
import type { ChoosePermanentDecision } from '@commander-arena/engine';
import { type Index, stackName } from './lookup';

/** True for the choice of the permanent that connives next. */
export function isConniveOrder(decision: Pick<ChoosePermanentDecision, 'purpose'>): boolean {
  return decision.purpose === 'conniveOrder';
}

/** "Several permanents connive: choose which of yours connives next (Unstable Experiment)." */
export function conniveOrderPrompt(
  decision: Pick<ChoosePermanentDecision, 'source'>,
  index: Index,
): string {
  return `Several permanents connive: choose which of yours connives next (${stackName(index, decision.source)}).`;
}
