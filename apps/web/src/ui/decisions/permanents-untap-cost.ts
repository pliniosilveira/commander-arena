/**
 * The question of an untap cost that the engine asks as a `choosePermanent` with `purpose: 'untapCost'`: "Untap two tapped creatures you control" as part of the cost of an
 * activated ability (CR 701.26b), asked when more creatures can be untapped than the cost needs. It is a cost, so Cancel rewinds the whole activation (CR 733). The words read
 * the decision and the ability on the stack and nothing else. No new dialog kind: the permanents are chosen on the board, as for any other choice of permanents; the engine stays
 * the judge of every answer. Pure.
 */
import type { ChoosePermanentDecision } from '@commander-arena/engine';
import { untapWhat } from '../../game/untap-cost-text';
import { type Index, nameOf, stackName } from './lookup';

/** True for the choice of the permanents untapped to pay an untap cost. */
export function isUntapCost(decision: Pick<ChoosePermanentDecision, 'purpose'>): boolean {
  return decision.purpose === 'untapCost';
}

/** "Choose two tapped creatures you control to untap as a cost." The words come from the untap cost of the ability on the stack; without it a plain count. */
export function untapCostPrompt(
  decision: Pick<ChoosePermanentDecision, 'min' | 'max' | 'source'>,
  index: Index,
): string {
  const ability = index.get(decision.source)?.ability;
  const cost =
    ability?.kind === 'activated'
      ? ability.cost.find((c) => c.kind === 'untapPermanents')
      : undefined;
  if (cost?.kind === 'untapPermanents' && cost.count === decision.max) {
    return `Choose ${untapWhat(cost.filter, cost.count, true)} to untap as a cost.`;
  }
  return `Choose ${decision.max} permanents to untap as a cost for ${stackName(index, decision.source)}.`;
}

/** The badge on a chosen permanent. */
export const UNTAP_COST_BADGE = 'Untap';

/** The title of its dock panel. */
export function untapCostTitle(
  decision: Pick<ChoosePermanentDecision, 'source'>,
  index: Index,
): string {
  return `Untap to pay for ${nameOf(index, decision.source)}`;
}
