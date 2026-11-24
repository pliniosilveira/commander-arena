/**
 * A player's party (CR 700.8): up to one Cleric, one Rogue, one Warrior and one Wizard among the creatures they control. The number of creatures in it is
 * worked out by the game, never declared (CR 700.8a); a creature with several of the four types fills one slot (CR 700.8b), and where that can be done in
 * different ways the one with the most creatures counts. That is the size of a maximum matching between the creatures and the four types, found here
 * by augmenting paths. The file reads no state: callers pass the creature types of the creatures they look at, after layer 4.
 */
import type { Subtype } from '../characteristics';

/** The creature types a party has a slot for, in the order of CR 700.8. */
export const PARTY_TYPES: readonly Subtype[] = ['Cleric', 'Rogue', 'Warrior', 'Wizard'];

/**
 * The party roles each creature could fill: for creature `i`, the indexes into `PARTY_TYPES` of the party types among its `subtypes`.
 * A creature with none of them is left out.
 */
function slotsOf(creatures: readonly (readonly Subtype[])[]): number[][] {
  const slots: number[][] = [];
  for (const subtypes of creatures) {
    const mine: number[] = [];
    PARTY_TYPES.forEach((type, i) => {
      if (subtypes.includes(type)) mine.push(i);
    });
    if (mine.length > 0) slots.push(mine);
  }
  return slots;
}

/**
 * CR 700.8, 700.8a, 700.8b: the number of creatures in the party of a player whose creatures have the given creature `subtypes`
 * (one entry for each creature they control): a number from 0 to 4.
 */
export function partySizeOf(creatures: readonly (readonly Subtype[])[]): number {
  return assignParty(creatures).filter((slot) => slot !== null).length;
}

/**
 * The creature that fills each party slot (an index into `creatures`, or null for an empty slot), for a way of filling the slots with the most creatures
 * (CR 700.8b). The slots are in the order of `PARTY_TYPES`.
 */
export function assignParty(creatures: readonly (readonly Subtype[])[]): (number | null)[] {
  const index: number[] = [];
  creatures.forEach((subtypes, i) => {
    if (PARTY_TYPES.some((t) => subtypes.includes(t))) index.push(i);
  });
  const slots = slotsOf(creatures);
  const holder: (number | null)[] = PARTY_TYPES.map(() => null);
  const place = (c: number, seen: boolean[]): boolean => {
    for (const s of slots[c] ?? []) {
      if (seen[s]) continue;
      seen[s] = true;
      const current = holder[s];
      if (current === null || current === undefined || place(current, seen)) {
        holder[s] = c;
        return true;
      }
    }
    return false;
  };
  for (let c = 0; c < slots.length; c++)
    place(
      c,
      PARTY_TYPES.map(() => false),
    );
  return holder.map((c) => (c === null || c === undefined ? null : (index[c] ?? null)));
}
