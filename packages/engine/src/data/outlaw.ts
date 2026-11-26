/**
 * CR 700.12 (General): "The term outlaw refers to an object that has the Assassin, Mercenary, Pirate, Rogue, and/or Warlock creature types."
 * Outlaw is no creature type itself; it names the objects that have at least one of these five. `ObjectFilter.outlaw` reads it of a permanent, a card in any
 * zone and a spell on the stack alike (CR 700.12a decides which zone a card's text means: "outlaws you control" are permanents, "outlaw spell" and "outlaw
 * card" are the stack and the zone the text names).
 */
export const OUTLAW_CREATURE_TYPES: readonly string[] = [
  'Assassin',
  'Mercenary',
  'Pirate',
  'Rogue',
  'Warlock',
];

/** Whether an object with these subtypes is an outlaw (CR 700.12): it has at least one of the five outlaw creature types. */
export function isOutlaw(subtypes: readonly string[]): boolean {
  return subtypes.some((s) => OUTLAW_CREATURE_TYPES.includes(s));
}
