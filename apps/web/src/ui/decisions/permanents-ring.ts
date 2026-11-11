/**
 * The question of the Ring (D-196) that the engine asks as a `choosePermanent`: "Each time the Ring tempts you, choose a creature you control. That
 * creature becomes your Ring-bearer" (`ringBearer`, CR 701.54a), asked when the player controls two or more creatures. The words read the decision and
 * the objects it names and nothing else; the engine stays the judge of every answer. No new dialog kind: the permanents are chosen on the board, as for
 * any other choice of permanents. Pure.
 */
import type { ChoosePermanentDecision, ObjectId } from '@commander-arena/engine';
import { type Index, nameOf, stackName } from './lookup';

type Asked = Pick<ChoosePermanentDecision, 'purpose'>;

/** True for the choice of the creature that becomes the Ring-bearer. */
export function isRingBearer(decision: Asked): boolean {
  return decision.purpose === 'ringBearer';
}

/** "Choose your Ring-bearer for There and Back Again." (the spell or ability that tempts is named). */
export function ringBearerPrompt(
  decision: Pick<ChoosePermanentDecision, 'source'>,
  index: Index,
): string {
  return `The Ring tempts you: choose your Ring-bearer, a creature you control, for ${stackName(index, decision.source)}.`;
}

/** The title of its dock panel. */
export const RING_BEARER_TITLE = 'Choose your Ring-bearer';

/** The bar's second line: what a click does. */
export function ringBearerDetail(chosen: readonly ObjectId[], index: Index): string {
  const [one] = chosen;
  return one === undefined
    ? "Click a creature to make it your Ring-bearer: legendary, and it can't be blocked by creatures with greater power."
    : `${nameOf(index, one)} will be your Ring-bearer. Click it again to take it back.`;
}

/** The badge on the chosen creature. */
export const RING_BEARER_BADGE = 'Ring-bearer';
