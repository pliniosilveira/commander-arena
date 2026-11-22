/**
 * Cards that cannot be chosen as a companion in Commander (house rule of SPEC 5.8, not in the CR). The owner named the list; it is data, kept apart from the check, and must be confirmed
 * against the official Commander rules before it is relied on or extended. Matched by the exact card name, ignoring case.
 */
export const COMPANION_BANNED_IN_COMMANDER: readonly string[] = ['Lutri, the Spellchaser'];

export function isBannedCompanion(name: string): boolean {
  const lower = name.toLowerCase();
  return COMPANION_BANNED_IN_COMMANDER.some((banned) => banned.toLowerCase() === lower);
}
