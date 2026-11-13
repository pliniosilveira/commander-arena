/**
 * The question of amass (D-1123) that the engine asks as a `choosePermanent`: "Choose an Army creature you control. Put N +1/+1 counters on that creature"
 * (`amass`, CR 701.47a), asked when the player controls two or more Armies. The words read the decision and the objects it names and nothing else. No new
 * dialog kind: the Army is chosen on the board, as for any other choice of permanents; the engine stays the judge of every answer. Pure.
 */
import type { ChoosePermanentDecision, ObjectId } from '@commander-arena/engine';
import { type Index, nameOf, stackName } from './lookup';

/** True for the choice of the Army that gets the counters. */
export function isAmass(decision: Pick<ChoosePermanentDecision, 'purpose'>): boolean {
  return decision.purpose === 'amass';
}

/** "Amass: choose an Army you control to put the +1/+1 counters on (Gleaming Overseer)." */
export function amassPrompt(
  decision: Pick<ChoosePermanentDecision, 'source'>,
  index: Index,
): string {
  return `Amass: choose an Army you control to put the +1/+1 counters on (${stackName(index, decision.source)}).`;
}

/** The badge on the chosen Army. */
export const AMASS_BADGE = 'Amassed';

/** The title of its dock panel. */
export const AMASS_TITLE = 'Amass: choose an Army';

/** The bar's second line: what a click does. */
export function amassDetail(chosen: readonly ObjectId[], index: Index): string {
  const [one] = chosen;
  return one === undefined
    ? 'Click an Army to put the +1/+1 counters on it. It becomes the creature type of the amass in addition to its other types.'
    : `${nameOf(index, one)} will get the +1/+1 counters. Click it again to take it back.`;
}
