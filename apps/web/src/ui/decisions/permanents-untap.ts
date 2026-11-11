/**
 * The question of an effect that untaps permanents the controller chooses (D-216, CR 701.26a: "Untap up to three lands.") that the engine asks as a
 * `choosePermanent` of purpose `untapChoice`: none up to `max` of the tapped permanents on the battlefield. The words read the decision, the objects
 * it names and the `untap` effect of the ability on the stack; the engine stays the judge of every answer. No new dialog kind. Pure.
 */
import type { ChoosePermanentDecision } from '@commander-arena/engine';
import { type Index, stackName } from './lookup';

type Asked = Pick<ChoosePermanentDecision, 'purpose'>;

/** True for the choice of the permanents an effect untaps. */
export function isUntapChoice(decision: Asked): boolean {
  return decision.purpose === 'untapChoice';
}

/** "Untap up to 3 permanents for Frantic Search." */
export function untapChoicePrompt(
  decision: Pick<ChoosePermanentDecision, 'max' | 'source'>,
  index: Index,
): string {
  return `Choose up to ${decision.max} tapped ${decision.max === 1 ? 'permanent' : 'permanents'} to untap for ${stackName(index, decision.source)}.`;
}

/** The title of its dock panel. */
export const UNTAP_CHOICE_TITLE = 'Untap permanents';

/** The badge on a chosen permanent. */
export const UNTAP_CHOICE_BADGE = 'Untap';
