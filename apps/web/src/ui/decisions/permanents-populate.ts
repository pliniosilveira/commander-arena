/**
 * The question of populate (D-612) that the engine asks as a `choosePermanent`: "Choose a creature token you control and create a token that's a copy of it"
 * (`populate`, CR 701.36a), asked when the player controls two or more creature tokens. The words read the decision and the objects it names and nothing else. No new
 * dialog kind: the token is chosen on the board, as for any other choice of permanents; the engine stays the judge of every answer. Pure.
 */
import type { ChoosePermanentDecision, ObjectId } from '@commander-arena/engine';
import { type Index, nameOf, stackName } from './lookup';

/** True for the choice of the creature token a populate copies. */
export function isPopulate(decision: Pick<ChoosePermanentDecision, 'purpose'>): boolean {
  return decision.purpose === 'populate';
}

/** "Populate: choose a creature token you control to copy (Rootborn Defenses)." */
export function populatePrompt(
  decision: Pick<ChoosePermanentDecision, 'source'>,
  index: Index,
): string {
  return `Populate: choose a creature token you control to copy (${stackName(index, decision.source)}).`;
}

/** The badge on the chosen token. */
export const POPULATE_BADGE = 'Copied';

/** The title of its dock panel. */
export const POPULATE_TITLE = 'Populate: choose a token';

/** The bar's second line: what a click does. */
export function populateDetail(chosen: readonly ObjectId[], index: Index): string {
  const [one] = chosen;
  return one === undefined
    ? 'Click a creature token to create a copy of it.'
    : `A copy of ${nameOf(index, one)} will be created. Click it again to take it back.`;
}
