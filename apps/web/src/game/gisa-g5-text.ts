/**
 * The words of group 5 of the Gisa deck (issue 41, D-1440): the reminder of Decayed (CR 702.147a) and the instruction its triggered ability gives, "sacrifice it at end of combat". Pure.
 */

/** The reminder of Decayed (CR 702.147a): the static ability and the triggered ability the keyword stands for. */
export const DECAYED_REMINDER =
  "This creature can't block. When it attacks, sacrifice it at end of combat.";

/** "Sacrifice it at end of combat": the delayed sacrifice of the ability of Decayed (`of: 'this'`), or of the creature that blocked the Ring-bearer. */
export function delayedSacrificeText(of: 'this' | undefined): string {
  return of === 'this'
    ? 'Sacrifice it at end of combat'
    : 'Sacrifice the blocking creature at end of combat';
}
