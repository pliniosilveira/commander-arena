/**
 * The question of "Move any number of +1/+1 counters from this creature onto other creatures" (issue 230, CR 122.1) that the engine asks as a `choosePermanent` of purpose
 * 'moveCounters': which creature one more counter moves onto, or none to stop. Asked again after each move while the source has a counter left. The words read the decision and
 * the objects it names and nothing else. No new dialog kind: the creature is chosen on the board; the engine stays the judge of every answer. Pure.
 */
import type { ChoosePermanentDecision, ObjectId } from '@commander-arena/engine';
import { type Index, nameOf, stackName } from './lookup';

/** True for the choice of the permanent a counter moves onto. */
export function isMoveCounters(decision: Pick<ChoosePermanentDecision, 'purpose'>): boolean {
  return decision.purpose === 'moveCounters';
}

/** "Move a counter: choose a creature to put it on, or none to stop (Forgotten Ancient)." */
export function moveCountersPrompt(
  decision: Pick<ChoosePermanentDecision, 'source'>,
  index: Index,
): string {
  return `Move a counter: choose a creature to put it on, or none to stop (${stackName(index, decision.source)}).`;
}

/** The badge on the chosen creature. */
export const MOVE_COUNTERS_BADGE = 'Gets a counter';

/** The title of its dock panel. */
export const MOVE_COUNTERS_TITLE = 'Move a counter';

/** The bar's second line: what a click does, and what confirming with none chosen does. */
export function moveCountersDetail(chosen: readonly ObjectId[], index: Index): string {
  const [one] = chosen;
  return one === undefined
    ? 'Click a creature to move a counter onto it, or confirm with none to stop moving counters.'
    : `A counter moves onto ${nameOf(index, one)}. Click it again to take it back.`;
}
