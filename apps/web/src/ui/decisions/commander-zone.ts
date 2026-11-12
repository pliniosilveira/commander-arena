/**
 * The line under the commander-zone question (CR 903.9). A commander that is already in the
 * graveyard or exile (903.9a, a state-based action) "is in" it; one that is still on the battlefield
 * or the stack when the question is asked (903.9b, a replacement effect: a bounce, or the return of a
 * dashed commander at the end step) "would be put into" the hand or the library, so it is not worded
 * as if it had gone there already.
 */
import type { CommanderZoneDecision, ObjectView } from '@commander-arena/engine';

export function commanderZoneDetail(
  name: string,
  from: CommanderZoneDecision['from'],
  zoneNow: ObjectView['zone'] | undefined,
  meld?: ObjectView['meld'],
): string {
  // "your hand", "your library", "the graveyard", "exile" (an unearthed commander is exiled, D-124).
  const there =
    from === 'hand' || from === 'library'
      ? `your ${from}`
      : from === 'exile'
        ? 'exile'
        : `the ${from}`;
  const pending = zoneNow === 'battlefield' || zoneNow === 'stack';
  const base = `${name} ${pending ? 'would be put into' : 'is in'} ${there}. You may put it into the command zone instead.`;
  // CR 903.9c (D-277): a melded permanent that is a commander: only the commander card goes to the command zone, the other card goes where the permanent would have gone.
  const [commander, other] = meld?.components ?? [];
  if (!pending || commander === undefined || other === undefined) return base;
  return `${base} It is a melded permanent: if you do, only ${commander.name} goes there, and ${other.name} goes into ${there} (CR 903.9c).`;
}
