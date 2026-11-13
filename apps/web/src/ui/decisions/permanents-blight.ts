/**
 * The question of a blight cost (D-407) that the engine asks as a `choosePermanent` with `purpose: 'blight'`: "Blight 1" as part of the cost of an activated
 * ability puts -1/-1 counters on a creature the player controls (CR 701.68a), asked when two or more creatures can take them. It is a cost, so Cancel rewinds the
 * whole activation (CR 733). The words read the decision and the ability on the stack and nothing else. No new dialog kind: the creature is chosen on the board, as
 * for any other choice of permanents; the engine stays the judge of every answer. Pure.
 */
import type { ChoosePermanentDecision, ObjectId } from '@commander-arena/engine';
import { type Index, nameOf, stackName } from './lookup';

/** True for the choice of the creature that gets the -1/-1 counters of a blight cost. */
export function isBlight(decision: Pick<ChoosePermanentDecision, 'purpose'>): boolean {
  return decision.purpose === 'blight';
}

/** How many counters the blight cost of the ability on the stack puts on the creature; 1 when the view does not show the ability (the usual cost). */
function blightCount(decision: Pick<ChoosePermanentDecision, 'source'>, index: Index): number {
  const ability = index.get(decision.source)?.ability;
  const cost =
    ability?.kind === 'activated' ? ability.cost.find((c) => c.kind === 'blight') : undefined;
  return cost?.kind === 'blight' ? cost.count : 1;
}

/** "Blight 1: choose a creature you control to put a -1/-1 counter on, to pay for Spiral into Solitude." */
export function blightPrompt(
  decision: Pick<ChoosePermanentDecision, 'source'>,
  index: Index,
): string {
  const count = blightCount(decision, index);
  const counters = count === 1 ? 'a -1/-1 counter' : `${count} -1/-1 counters`;
  return `Blight ${count}: choose a creature you control to put ${counters} on, to pay for ${stackName(index, decision.source)}.`;
}

/** The badge on the chosen creature. */
export const BLIGHT_BADGE = 'Blighted';

/** The title of its dock panel. */
export const BLIGHT_TITLE = 'Blight: choose a creature';

/** The bar's second line: what a click does. */
export function blightDetail(chosen: readonly ObjectId[], index: Index): string {
  const [one] = chosen;
  return one === undefined
    ? 'Click a creature you control to put the -1/-1 counters on it. A creature with toughness 1 dies from a single counter.'
    : `${nameOf(index, one)} will get the -1/-1 counters. Click it again to take it back.`;
}
