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
): string {
  // "your hand", "your library", "the graveyard", "exile" (an unearthed commander is exiled, D-124).
  const there =
    from === 'hand' || from === 'library'
      ? `your ${from}`
      : from === 'exile'
        ? 'exile'
        : `the ${from}`;
  const pending = zoneNow === 'battlefield' || zoneNow === 'stack';
  return `${name} ${pending ? 'would be put into' : 'is in'} ${there}. You may put it into the command zone instead.`;
}
