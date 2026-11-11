/**
 * The optional untap (CR 502.3, D-125): "You may choose not to untap this permanent during your untap step."
 * The untap step asks one `choosePermanent` with `purpose: 'untap'`: `legal` are the tapped permanents the
 * player may leave tapped, and the answer names the ones that untap. The dialog is a checklist with every
 * permanent checked (the answer the AI gives), so `ui.permanents` holds the permanents that untap.
 */
import type { ChoosePermanentDecision, ObjectId } from '@commander-arena/engine';

/** True for the untap step's question. */
export function isUntapChoice(decision: Pick<ChoosePermanentDecision, 'purpose'>): boolean {
  return decision.purpose === 'untap';
}

export const UNTAP_PROMPT = 'Untap during your untap step: choose which of these stay tapped.';

/** The hint under the title of the checklist. */
export const UNTAP_HINT = 'A checked permanent untaps. Uncheck one to leave it tapped.';

/** Every permanent starts checked: the default is to untap them all. */
export function initialUntap(
  decision: Pick<ChoosePermanentDecision, 'legal'>,
): readonly ObjectId[] {
  return decision.legal;
}

/** Checks or unchecks one permanent; one the engine did not list is ignored. */
export function toggleUntap(
  chosen: readonly ObjectId[],
  decision: Pick<ChoosePermanentDecision, 'legal'>,
  id: ObjectId,
): readonly ObjectId[] {
  if (!decision.legal.includes(id)) return chosen;
  return chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id];
}

/** "Untap all", "Untap 1 of 2", "Leave all tapped". */
export function untapButtonLabel(untapping: number, total: number): string {
  if (untapping === total) return 'Untap all';
  return untapping === 0 ? 'Leave all tapped' : `Untap ${untapping} of ${total}`;
}

/** The bar's second line: what stays tapped, counted. */
export function untapDetail(untapping: number, total: number): string {
  const tapped = total - untapping;
  return tapped === 0
    ? 'All of them untap.'
    : `${tapped} of ${total} ${tapped === 1 ? 'stays' : 'stay'} tapped.`;
}
