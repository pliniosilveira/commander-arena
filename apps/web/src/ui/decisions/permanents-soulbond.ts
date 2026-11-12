/**
 * The question of soulbond (D-984) that the engine asks as a `choosePermanent`: "you may pair this creature with another unpaired creature you control"
 * (`soulbond`, CR 702.95a), asked when the creature enters or another creature of the player enters. `subject` is the creature with soulbond, `legal` the creatures it
 * may be paired with, `min` is 0 (choosing none is the "may") and `max` is 1; even a single candidate is asked. The words read the decision and the objects it
 * names and nothing else; the engine stays the judge of every answer. No new dialog kind: the creature is chosen on the board, as for any other choice of permanents. Pure.
 */
import type { ChoosePermanentDecision, ObjectId } from '@commander-arena/engine';
import { type Index, nameOf } from './lookup';

type Asked = Pick<ChoosePermanentDecision, 'purpose'>;

/** True for the choice of the creature a soulbond creature is paired with. */
export function isSoulbond(decision: Asked): boolean {
  return decision.purpose === 'soulbond';
}

/** "Pair SYNTHETIC Soulbound Squire with another creature you control, or none." (the creature with soulbond is named). */
export function soulbondPrompt(
  decision: Pick<ChoosePermanentDecision, 'subject' | 'source'>,
  index: Index,
): string {
  const id = decision.subject ?? decision.source;
  const name = index.get(id) === undefined ? 'this creature' : nameOf(index, id);
  return `Pair ${name} with another unpaired creature you control, or none.`;
}

/** The title of its dock panel. */
export const SOULBOND_TITLE = 'Pair a creature';

/** The bar's second line: what a click does, and what Confirm does with nothing chosen. */
export function soulbondDetail(chosen: readonly ObjectId[], index: Index): string {
  const [one] = chosen;
  return one === undefined
    ? 'Click a creature to pair it, or Confirm to pair none.'
    : `${nameOf(index, one)} will be paired. Click it again to take it back.`;
}

/** The label of Confirm: "Pair them", or "Don't pair" when none is chosen. */
export function soulbondConfirm(chosen: readonly ObjectId[]): string {
  return chosen.length === 0 ? "Don't pair" : 'Pair them';
}

/** The badge on the chosen creature. */
export const SOULBOND_BADGE = 'Pair';
