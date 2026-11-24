/**
 * The party of a `chooseParty` decision (Stick Together, CR 700.8d): the pure helpers of the dialog. The player picks up to one creature for each of Cleric, Rogue, Warrior and
 * Wizard; one creature fills at most one place, so picking it for another place moves it.
 */
import {
  type ChoosePartyDecision,
  enumerateParties,
  type ObjectId,
  type PartyMember,
} from '@commander-arena/engine';

/** The answer the dialog starts with: the fullest party the engine lists, which the player edits. */
export function initialParty(d: ChoosePartyDecision): readonly PartyMember[] {
  return enumerateParties(d.slots, 1)[0] ?? [];
}

/** The creature that fills `type` now, if any. */
export function filledBy(
  party: readonly PartyMember[],
  type: PartyMember['type'],
): ObjectId | undefined {
  return party.find((m) => m.type === type)?.object;
}

/** Clicking a creature in the row of `type`: it leaves the party when it fills that place, otherwise it fills it (leaving the place it filled before). */
export function togglePartyMember(
  party: readonly PartyMember[],
  type: PartyMember['type'],
  object: ObjectId,
): readonly PartyMember[] {
  if (filledBy(party, type) === object) return party.filter((m) => m.type !== type);
  return [...party.filter((m) => m.type !== type && m.object !== object), { type, object }];
}

/** The party in the order of the decision's places, as the answer names it. */
export function partyInOrder(
  d: ChoosePartyDecision,
  party: readonly PartyMember[],
): readonly PartyMember[] {
  return d.slots.flatMap((s) => party.filter((m) => m.type === s.type));
}
