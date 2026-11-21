/**
 * The question of a remove-counters cost that the engine asks as a `choosePermanent` with `purpose: 'removeCountersCost'`: "Remove two +1/+1 counters from among creatures you control"
 * as part of the cost of an activated ability (CR 118.3, 122.1), asked once for each counter while more than one permanent could give it. It is a cost, so Cancel rewinds the whole
 * activation (CR 733). The words read the decision and the ability on the stack and nothing else. No new dialog kind: the permanent is chosen on the board, as for any other choice
 * of permanents; the engine stays the judge of every answer. Pure.
 */
import type { ChoosePermanentDecision } from '@commander-arena/engine';
import { amongWhat, countersTaken } from '../../game/remove-counters-cost-text';
import { type Index, nameOf, stackName } from './lookup';

/** True for the choice of the permanent a counter is taken from to pay a remove-counters cost. */
export function isRemoveCountersCost(decision: Pick<ChoosePermanentDecision, 'purpose'>): boolean {
  return decision.purpose === 'removeCountersCost';
}

/** "Choose one of the creatures you control to remove a +1/+1 counter from, as a cost." The words come from the cost of the ability on the stack; without it a plain sentence. */
export function removeCountersCostPrompt(
  decision: Pick<ChoosePermanentDecision, 'source'>,
  index: Index,
): string {
  const ability = index.get(decision.source)?.ability;
  const cost =
    ability?.kind === 'activated'
      ? ability.cost.find((c) => c.kind === 'removeCounters' && c.among !== undefined)
      : undefined;
  if (cost?.kind === 'removeCounters' && cost.among !== undefined) {
    return `Choose one of the ${amongWhat(cost.among)} to remove ${countersTaken(cost.counter, 1)} from, as a cost.`;
  }
  return `Choose a permanent to remove a counter from as a cost for ${stackName(index, decision.source)}.`;
}

/** The badge on a chosen permanent. */
export const REMOVE_COUNTERS_COST_BADGE = 'Remove counter';

/** The title of its dock panel. */
export function removeCountersCostTitle(
  decision: Pick<ChoosePermanentDecision, 'source'>,
  index: Index,
): string {
  return `Remove a counter to pay for ${nameOf(index, decision.source)}`;
}
